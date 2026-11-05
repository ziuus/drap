mod luts;
mod ws;

use std::cell::RefCell;
use std::rc::Rc;
use std::sync::mpsc;
use std::time::Instant;

use cairo::{Context, Filter, SurfacePattern};
use gtk4::prelude::*;
use gtk4::{Application, ApplicationWindow, DrawingArea};
use gtk4_layer_shell::{Edge, Layer, LayerShell};

use luts::Luts;
use ws::{start_ws_client, WsMessage};

thread_local! {
    static WAKEUP_FN: RefCell<Option<Box<dyn Fn()>>> = RefCell::new(None);
}

pub fn wakeup() {
    WAKEUP_FN.with(|f| {
        if let Some(ref cb) = *f.borrow() {
            cb();
        }
    });
}

struct OverlayState {
    theme: String,
    // Ambience glow state
    active_edge: String,
    active_corner: String,
    current_coord: f64,
    target_coord: f64,
    current_intensity: f64,
    target_intensity: f64,
    current_vy: f64,
    // Drop card state
    card_active: bool,
    card_filename: String,
    card_size_str: String,
    card_progress: f64,
    card_start_time: Option<Instant>,
    card_edge: String,
    // Full-screen surge wave state
    confirm_active: bool,
    confirm_progress: f64,
    confirm_start_time: Option<Instant>,
    confirm_edge: String,
    confirm_coord: f64,
    // Tick management
    is_animating: bool,
    start_time: Instant,
}

impl OverlayState {
    fn new() -> Self {
        Self {
            theme: "aurora".to_string(),
            active_edge: "".to_string(),
            active_corner: "".to_string(),
            current_coord: 0.5,
            target_coord: 0.5,
            current_intensity: 0.0,
            target_intensity: 0.0,
            current_vy: 0.0,
            card_active: false,
            card_filename: String::new(),
            card_size_str: String::new(),
            card_progress: 0.0,
            card_start_time: None,
            card_edge: "right".to_string(),
            confirm_active: false,
            confirm_progress: 0.0,
            confirm_start_time: None,
            confirm_edge: "right".to_string(),
            confirm_coord: 0.5,
            is_animating: false,
            start_time: Instant::now(),
        }
    }
}

fn format_bytes(bytes: u64) -> String {
    if bytes < 1024 {
        format!("{} B", bytes)
    } else if bytes < 1024 * 1024 {
        format!("{:.1} KB", bytes as f64 / 1024.0)
    } else if bytes < 1024 * 1024 * 1024 {
        format!("{:.1} MB", bytes as f64 / (1024.0 * 1024.0))
    } else {
        format!("{:.1} GB", bytes as f64 / (1024.0 * 1024.0 * 1024.0))
    }
}

fn rounded_rect(cr: &Context, x: f64, y: f64, w: f64, h: f64, r: f64) {
    let pi = std::f64::consts::PI;
    cr.new_sub_path();
    cr.arc(x + w - r, y + r, r, -pi / 2.0, 0.0);
    cr.arc(x + w - r, y + h - r, r, 0.0, pi / 2.0);
    cr.arc(x + r, y + h - r, r, pi / 2.0, pi);
    cr.arc(x + r, y + r, r, pi, 3.0 * pi / 2.0);
    cr.close_path();
}

fn draw_ambience(cr: &Context, width: f64, height: f64, state: &OverlayState, luts: &Luts) {
    if state.current_intensity <= 0.005 || state.active_edge.is_empty() {
        return;
    }

    let surf = luts.luts.get(&state.theme)
        .or_else(|| luts.luts.get("aurora"))
        .expect("Theme LUT missing");

    let lut_w = 512.0;
    let lut_h = 1024.0;
    let edge = &state.active_edge;
    let coord = state.current_coord;
    let intensity = state.current_intensity;

    let elapsed = state.start_time.elapsed().as_secs_f64();
    let breathe = 1.0 + (elapsed * 3.2).sin() * 0.04;
    let radius = (880.0 + intensity * 920.0) * breathe;
    let radius_y = height.max(1000.0) * (1.05 + intensity * 0.45);

    cr.save().expect("Cairo save");

    if edge.starts_with("corner-") {
        let corner = edge.trim_start_matches("corner-");
        match corner {
            "top-right" => {
                cr.translate(width, 0.0);
                cr.rotate(3.0 * std::f64::consts::PI / 4.0);
            }
            "bottom-right" => {
                cr.translate(width, height);
                cr.rotate(-3.0 * std::f64::consts::PI / 4.0);
            }
            "top-left" => {
                cr.translate(0.0, 0.0);
                cr.rotate(std::f64::consts::PI / 4.0);
            }
            _ => { // bottom-left
                cr.translate(0.0, height);
                cr.rotate(-std::f64::consts::PI / 4.0);
            }
        }
    } else {
        match edge.as_str() {
            "left" => {
                cr.translate(0.0, coord * height);
                cr.rotate(std::f64::consts::PI);
            }
            "top" => {
                cr.translate(coord * width, 0.0);
                cr.rotate(-std::f64::consts::PI / 2.0);
            }
            "bottom" => {
                cr.translate(coord * width, height);
                cr.rotate(std::f64::consts::PI / 2.0);
            }
            _ => { // "right"
                cr.translate(width, coord * height);
            }
        }
    }

    cr.scale(radius / lut_w, radius_y / (lut_h / 2.0));
    cr.translate(-lut_w, -lut_h / 2.0);

    let pat = SurfacePattern::create(surf);
    pat.set_filter(Filter::Bilinear);
    let _ = cr.set_source(&pat);
    let _ = cr.paint_with_alpha(intensity * 0.95);

    let _ = cr.restore();
}

fn draw_fullscreen_surge(cr: &Context, width: f64, height: f64, progress: f64, edge: &str, coord: f64, state: &OverlayState, luts: &Luts) {
    if progress <= 0.001 || progress >= 1.0 {
        return;
    }

    let surf = luts.surge_luts.get(&state.theme)
        .or_else(|| luts.surge_luts.get("aurora"))
        .expect("Surge LUT missing");

    let lut_w = 512.0;
    let lut_h = 1024.0;

    let ease = 1.0 - (1.0 - progress).powf(2.5);
    let damping = (1.0 - progress).max(0.0).powf(1.35);
    if damping <= 0.005 {
        return;
    }

    let max_reach = width.hypot(height) * 1.18;
    let radius_x = 350.0 + ease * (max_reach - 350.0);
    let radius_y = (radius_x * 1.15).max(height * 1.6);

    cr.save().expect("Cairo save");

    if edge.starts_with("corner-") {
        let corner = edge.trim_start_matches("corner-");
        match corner {
            "top-right" => {
                cr.translate(width, 0.0);
                cr.rotate(3.0 * std::f64::consts::PI / 4.0);
            }
            "bottom-right" => {
                cr.translate(width, height);
                cr.rotate(-3.0 * std::f64::consts::PI / 4.0);
            }
            "top-left" => {
                cr.translate(0.0, 0.0);
                cr.rotate(std::f64::consts::PI / 4.0);
            }
            _ => { // bottom-left
                cr.translate(0.0, height);
                cr.rotate(-std::f64::consts::PI / 4.0);
            }
        }
    } else {
        match edge {
            "left" => {
                cr.translate(0.0, coord * height);
                cr.rotate(std::f64::consts::PI);
            }
            "top" => {
                cr.translate(coord * width, 0.0);
                cr.rotate(-std::f64::consts::PI / 2.0);
            }
            "bottom" => {
                cr.translate(coord * width, height);
                cr.rotate(std::f64::consts::PI / 2.0);
            }
            _ => { // right
                cr.translate(width, coord * height);
            }
        }
    }

    cr.scale(radius_x / lut_w, radius_y / (lut_h / 2.0));
    cr.translate(-lut_w, -lut_h / 2.0);

    let pat = SurfacePattern::create(surf);
    pat.set_filter(Filter::Bilinear);
    let _ = cr.set_source(&pat);
    let _ = cr.paint_with_alpha(damping * 0.98);

    let _ = cr.restore();
}

fn draw_drop_card(cr: &Context, width: f64, height: f64, state: &OverlayState) {
    if !state.card_active {
        return;
    }

    let card_w = 280.0;
    let card_h = 74.0;
    let edge = &state.card_edge;

    let (card_x, card_y) = match edge.as_str() {
        "left" => (50.0, (height - card_h) / 2.0),
        "top" => ((width - card_w) / 2.0, 50.0),
        "bottom" => ((width - card_w) / 2.0, height - card_h - 50.0),
        _ => (width - card_w - 50.0, (height - card_h) / 2.0),
    };

    let alpha = if state.card_progress > 0.78 {
        ((1.0 - state.card_progress) / 0.22).max(0.0)
    } else {
        1.0
    };

    cr.save().expect("Cairo save");

    // Card background (Dark translucent frosted glass)
    rounded_rect(cr, card_x, card_y, card_w, card_h, 18.0);
    cr.set_source_rgba(0.08, 0.09, 0.12, 0.88 * alpha);
    let _ = cr.fill_preserve();

    // Specular border
    cr.set_source_rgba(1.0, 1.0, 1.0, 0.22 * alpha);
    cr.set_line_width(1.4);
    let _ = cr.stroke();

    // Accent icon bead
    let icon_cx = card_x + 36.0;
    let icon_cy = card_y + 37.0;
    cr.arc(icon_cx, icon_cy, 18.0, 0.0, 2.0 * std::f64::consts::PI);
    cr.set_source_rgba(0.22, 0.74, 0.98, 0.35 * alpha);
    let _ = cr.fill();

    cr.arc(icon_cx, icon_cy, 8.0, 0.0, 2.0 * std::f64::consts::PI);
    cr.set_source_rgba(1.0, 1.0, 1.0, 0.95 * alpha);
    let _ = cr.fill();

    // Typography
    cr.set_source_rgba(1.0, 1.0, 1.0, 0.96 * alpha);
    cr.select_font_face("Sans", cairo::FontSlant::Normal, cairo::FontWeight::Bold);
    cr.set_font_size(15.0);
    cr.move_to(card_x + 66.0, card_y + 33.0);
    let display_title = if state.card_filename.len() > 22 {
        format!("{}...", &state.card_filename[..19])
    } else {
        state.card_filename.clone()
    };
    let _ = cr.show_text(&display_title);

    cr.set_source_rgba(0.70, 0.75, 0.85, 0.80 * alpha);
    cr.set_font_size(12.0);
    cr.move_to(card_x + 66.0, card_y + 53.0);
    let _ = cr.show_text(&format!("Received • {}", state.card_size_str));

    let _ = cr.restore();
}

fn main() {
    let app = Application::builder()
        .application_id("dev.drap.rust.overlay")
        .build();

    app.connect_activate(|app| {
        let window = ApplicationWindow::builder()
            .application(app)
            .title("Drap Rust Overlay")
            .decorated(false)
            .build();

        // 1. Initialize Wayland Layer Shell
        window.init_layer_shell();
        window.set_layer(Layer::Overlay);
        window.set_namespace("drap-overlay");
        window.set_anchor(Edge::Top, true);
        window.set_anchor(Edge::Bottom, true);
        window.set_anchor(Edge::Left, true);
        window.set_anchor(Edge::Right, true);
        window.set_exclusive_zone(-1);

        // Realize window and set 100% click-through input region
        WidgetExt::realize(&window);
        if let Some(surface) = window.surface() {
            let empty_region = cairo::Region::create();
            surface.set_input_region(&empty_region);
        }

        // 2. Pre-computed high-speed LUT textures
        let luts = Rc::new(Luts::new());
        let state = Rc::new(RefCell::new(OverlayState::new()));

        // 3. Drawing Area
        let drawing_area = DrawingArea::new();
        drawing_area.set_hexpand(true);
        drawing_area.set_vexpand(true);

        let draw_state = state.clone();
        let draw_luts = luts.clone();
        drawing_area.set_draw_func(move |_, cr, width, height| {
            let s = draw_state.borrow();
            let w = width as f64;
            let h = height as f64;

            // Clear surface
            cr.set_operator(cairo::Operator::Clear);
            let _ = cr.paint();
            cr.set_operator(cairo::Operator::Over);

            // Draw full-screen surge wave on drop
            if s.confirm_active {
                draw_fullscreen_surge(cr, w, h, s.confirm_progress, &s.confirm_edge, s.confirm_coord, &s, &draw_luts);
            }

            // Draw ambient edge bulb
            draw_ambience(cr, w, h, &s, &draw_luts);

            // Draw frosted drop card
            draw_drop_card(cr, w, h, &s);
        });

        window.set_child(Some(&drawing_area));

        // 4. Connect WebSocket client via mpsc channel
        let (tx, rx) = mpsc::channel::<WsMessage>();
        start_ws_client(tx);
        let rx_cell = Rc::new(RefCell::new(rx));

        // 5. Reactive tick & event dispatch loop (0.00% idle CPU)
        let tick_state = state.clone();
        let tick_da = drawing_area.clone();
        let tick_rx = rx_cell.clone();

        let attach_tick = {
            let state = tick_state.clone();
            let da = tick_da.clone();
            let rx = tick_rx.clone();
            Rc::new(move || {
                let s_ref = state.clone();
                let da_ref = da.clone();
                let rx_ref = rx.clone();

                da.add_tick_callback(move |_, _| {
                    let mut s = s_ref.borrow_mut();

                    // Poll all incoming messages
                    if let Ok(rx_guard) = rx_ref.try_borrow() {
                        while let Ok(msg) = rx_guard.try_recv() {
                            match msg.msg_type.as_str() {
                                "drag_move" => {
                                    if let Some(corner) = msg.corner {
                                        if !corner.is_empty() {
                                            s.active_corner = corner.to_lowercase();
                                            s.active_edge = format!("corner-{}", s.active_corner);
                                        }
                                    } else if let Some(edge) = msg.edge {
                                        s.active_corner.clear();
                                        s.active_edge = edge.to_lowercase();
                                    }
                                    if let Some(coord) = msg.coord.or(msg.y) {
                                        s.target_coord = coord;
                                    }
                                    if let Some(vy) = msg.velocity_y {
                                        s.current_vy = vy;
                                    }
                                    s.target_intensity = 0.85;
                                }
                                "drag_edge_enter" => {
                                    if let Some(edge) = msg.edge {
                                        s.active_edge = edge.to_lowercase();
                                    }
                                    if let Some(coord) = msg.coord.or(msg.y) {
                                        s.target_coord = coord;
                                        s.current_coord = coord;
                                    }
                                    s.target_intensity = 0.85;
                                }
                                "drag_edge_leave" => {
                                    s.target_intensity = 0.0;
                                }
                                "drag_drop" | "file_uploaded" => {
                                    let edge = msg.edge.unwrap_or_else(|| "right".to_string()).to_lowercase();
                                    let coord = msg.coord.or(msg.y).unwrap_or(0.5);
                                    let filename = msg.filename.unwrap_or_else(|| "Transferred File".to_string());
                                    let size_bytes = msg.size.unwrap_or(0);

                                    s.confirm_active = true;
                                    s.confirm_progress = 0.0;
                                    s.confirm_start_time = Some(Instant::now());
                                    s.confirm_edge = edge.clone();
                                    s.confirm_coord = coord;

                                    s.card_active = true;
                                    s.card_progress = 0.0;
                                    s.card_start_time = Some(Instant::now());
                                    s.card_filename = filename;
                                    s.card_size_str = format_bytes(size_bytes);
                                    s.card_edge = edge;
                                    s.target_intensity = 0.0;
                                }
                                "set_effect" => {
                                    if let Some(t) = msg.theme {
                                        s.theme = t.to_lowercase();
                                    }
                                }
                                _ => {}
                            }
                        }
                    }

                    // Progress confirm wave
                    if s.confirm_active {
                        if let Some(start) = s.confirm_start_time {
                            let elapsed = start.elapsed().as_secs_f64();
                            s.confirm_progress = (elapsed / 1.35).min(1.0);
                            if s.confirm_progress >= 1.0 {
                                s.confirm_active = false;
                                s.confirm_progress = 0.0;
                            }
                        }
                    }

                    // Progress drop card
                    if s.card_active {
                        if let Some(start) = s.card_start_time {
                            let elapsed = start.elapsed().as_secs_f64();
                            s.card_progress = (elapsed / 2.8).min(1.0);
                            if s.card_progress >= 1.0 {
                                s.card_active = false;
                                s.card_progress = 0.0;
                            }
                        }
                    }

                    // Smooth intensity interpolation
                    s.current_intensity += (s.target_intensity - s.current_intensity) * 0.28;
                    s.current_coord += (s.target_coord - s.current_coord) * 0.35;

                    da_ref.queue_draw();

                    // Continue ticking only if there is active motion
                    if s.confirm_active || s.card_active || s.current_intensity > 0.005 || s.target_intensity > 0.005 {
                        glib::ControlFlow::Continue
                    } else {
                        s.current_intensity = 0.0;
                        s.is_animating = false;
                        da_ref.queue_draw();
                        glib::ControlFlow::Break
                    }
                });
            })
        };

        // Register wakeup function for background threads (zero idle CPU)
        let wakeup_state = state.clone();
        let wakeup_attach = attach_tick.clone();
        WAKEUP_FN.with(|f| {
            *f.borrow_mut() = Some(Box::new(move || {
                let mut s = wakeup_state.borrow_mut();
                if !s.is_animating {
                    s.is_animating = true;
                    wakeup_attach();
                }
            }));
        });

        window.present();
    });

    app.run();
}

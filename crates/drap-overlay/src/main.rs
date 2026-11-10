mod luts;
mod ws;

use std::cell::RefCell;
use std::rc::Rc;
use std::sync::mpsc;
use std::time::Instant;

use cairo::{Context, Filter, SurfacePattern};
use gtk4::prelude::*;
use gtk4::{Application, ApplicationWindow, DrawingArea};
use gtk4_layer_shell::{Edge, KeyboardMode, Layer, LayerShell};

use luts::Luts;
use ws::{start_ws_client, WsMessage};

thread_local! {
    static DISPATCH_FN: RefCell<Option<Box<dyn Fn()>>> = RefCell::new(None);
}

pub fn dispatch() {
    DISPATCH_FN.with(|f| {
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
    current_pressure: f64,
    target_pressure: f64,
    current_vy: f64,
    // Drop card state
    card_active: bool,
    card_filename: String,
    card_size_str: String,
    card_progress: f64,
    card_start_time: Option<Instant>,
    card_edge: String,
    card_coord: f64,
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
        let theme = if let Ok(home) = std::env::var("HOME") {
            let cfg_path = std::path::PathBuf::from(home).join(".config/drap/config.json");
            if let Ok(content) = std::fs::read_to_string(cfg_path) {
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(&content) {
                    v.get("theme")
                        .and_then(|t| t.as_str())
                        .map(|s| s.to_lowercase())
                        .unwrap_or_else(|| "aurora".to_string())
                } else {
                    "aurora".to_string()
                }
            } else {
                "aurora".to_string()
            }
        } else {
            "aurora".to_string()
        };

        Self {
            theme,
            active_edge: "right".to_string(),
            active_corner: "".to_string(),
            current_coord: 0.5,
            target_coord: 0.5,
            current_intensity: 0.0,
            target_intensity: 0.0,
            current_pressure: 0.5,
            target_pressure: 0.5,
            current_vy: 0.0,
            card_active: false,
            card_filename: String::new(),
            card_size_str: String::new(),
            card_progress: 0.0,
            card_start_time: None,
            card_edge: "right".to_string(),
            card_coord: 0.5,
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

fn process_message(s: &mut OverlayState, msg: WsMessage) {
    println!(
        "[drap Rust Overlay] Event: type={} edge={:?} corner={:?} coord={:?} prox={:?}",
        msg.msg_type, msg.edge, msg.corner, msg.coord, msg.proximity
    );
    match msg.msg_type.as_str() {
        "drag_start" | "drag_move" | "pointer_drag" => {
            if let Some(ref corner) = msg.corner {
                s.active_corner = corner.to_lowercase();
                s.active_edge = format!("corner-{}", s.active_corner);
            } else if let Some(ref edge) = msg.edge {
                s.active_corner.clear();
                s.active_edge = edge.to_lowercase();
            } else if s.active_edge.is_empty() {
                s.active_edge = "right".to_string();
            }

            if let Some(coord) = msg.coord {
                s.target_coord = coord;
                if msg.msg_type == "drag_start" {
                    s.current_coord = coord;
                }
            }
            if let Some(vy) = msg.vy {
                s.current_vy = vy;
            }
            if let Some(press) = msg.pressure {
                s.target_pressure = press.clamp(0.2, 2.0);
            }
            if let Some(prox) = msg.proximity {
                // Drag active: minimum 0.18 for the initial stage click-and-hold bead, scaling up to 1.0
                s.target_intensity = (0.18 + prox * 0.82).min(1.0);
            } else if msg.msg_type == "drag_start" {
                s.target_intensity = 0.22;
            } else {
                s.target_intensity = 0.85;
            }
            if let Some(t) = msg.theme {
                s.theme = t.to_lowercase();
            }
        }
        "drag_edge_enter" => {
            if let Some(ref corner) = msg.corner {
                s.active_corner = corner.to_lowercase();
                s.active_edge = format!("corner-{}", s.active_corner);
            } else if let Some(ref edge) = msg.edge {
                s.active_corner.clear();
                s.active_edge = edge.to_lowercase();
            } else if s.active_edge.is_empty() {
                s.active_edge = "right".to_string();
            }
            if let Some(coord) = msg.coord {
                s.target_coord = coord;
                s.current_coord = coord;
            }
            if let Some(press) = msg.pressure {
                s.target_pressure = press.clamp(0.2, 2.0);
            }
            s.target_intensity = 1.0;
        }
        "drag_edge_leave" => {
            if !s.confirm_active && !s.card_active {
                s.target_intensity = 0.0;
                s.target_pressure = 0.5;
            }
        }
        "drag_drop" | "file_uploaded" | "file_from_laptop" => {
            let edge = if let Some(ref c) = msg.corner {
                format!("corner-{}", c.to_lowercase())
            } else if let Some(ref e) = msg.edge {
                e.to_lowercase()
            } else if !s.active_edge.is_empty() {
                s.active_edge.clone()
            } else {
                "right".to_string()
            };

            let coord = msg.coord.unwrap_or(s.current_coord);
            let filename = msg.filename.unwrap_or_else(|| "Transferred File".to_string());
            let size_str = msg
                .size_str
                .or_else(|| msg.size_bytes.map(ws::format_bytes))
                .unwrap_or_else(|| "Saved to ~/Downloads".to_string());

            let is_duplicate = if let Some(start) = s.confirm_start_time {
                s.confirm_active && start.elapsed().as_secs_f64() < 0.35
            } else {
                false
            };

            s.card_filename = filename;
            s.card_size_str = size_str;

            if !is_duplicate {
                s.active_edge = edge.clone();
                s.current_coord = coord;
                s.target_coord = coord;
                s.current_intensity = 1.0;
                s.target_intensity = 0.0;

                s.confirm_active = true;
                s.confirm_progress = 0.0;
                s.confirm_start_time = Some(Instant::now());
                s.confirm_edge = edge.clone();
                s.confirm_coord = coord;

                s.card_active = true;
                s.card_progress = 0.0;
                s.card_start_time = Some(Instant::now());
                s.card_edge = edge;
                s.card_coord = coord;
            }

            if let Some(t) = msg.theme {
                s.theme = t.to_lowercase();
            }
        }
        "video_resume" => {
            let edge = if let Some(ref c) = msg.corner {
                format!("corner-{}", c.to_lowercase())
            } else if let Some(ref e) = msg.edge {
                e.to_lowercase()
            } else if !s.active_edge.is_empty() {
                s.active_edge.clone()
            } else {
                "right".to_string()
            };
            let coord = msg.coord.unwrap_or(s.current_coord);

            s.confirm_active = true;
            s.confirm_progress = 0.0;
            s.confirm_start_time = Some(Instant::now());
            s.confirm_edge = edge.clone();
            s.confirm_coord = coord;
            s.active_edge = edge.clone();
            s.current_coord = coord;
            s.target_coord = coord;
            s.current_intensity = 1.0;
            s.target_intensity = 0.0;

            s.card_active = true;
            s.card_progress = 0.0;
            s.card_start_time = Some(Instant::now());
            s.card_edge = edge;
            s.card_coord = coord;
            s.card_filename = msg.filename.unwrap_or_else(|| "Continuity Stream".to_string());
            s.card_size_str = "Resumed in MPV".to_string();
        }
        "set_effect" | "set_config" => {
            if let Some(t) = msg.theme {
                s.theme = t.to_lowercase();
            }
        }
        _ => {}
    }
}

/// Applies coordinate transformation for the given edge or corner,
/// aligning local origin at the contact point with local negative-X pointing inward toward screen center.
fn apply_edge_transform(cr: &Context, width: f64, height: f64, edge: &str, coord: f64) {
    if edge.starts_with("corner-") {
        let corner = edge.trim_start_matches("corner-");
        match corner {
            "top-right" => {
                cr.translate(width, 0.0);
                cr.rotate(-std::f64::consts::PI / 4.0);
            }
            "bottom-right" => {
                cr.translate(width, height);
                cr.rotate(std::f64::consts::PI / 4.0);
            }
            "top-left" => {
                cr.translate(0.0, 0.0);
                cr.rotate(-3.0 * std::f64::consts::PI / 4.0);
            }
            _ => {
                // bottom-left
                cr.translate(0.0, height);
                cr.rotate(3.0 * std::f64::consts::PI / 4.0);
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
            _ => {
                // "right"
                cr.translate(width, coord * height);
            }
        }
    }
}

fn draw_ambience(cr: &Context, width: f64, height: f64, state: &OverlayState, luts: &Luts) {
    if state.current_intensity <= 0.005 || state.active_edge.is_empty() {
        return;
    }

    let surf = luts
        .luts
        .get(&state.theme)
        .or_else(|| luts.luts.get("aurora"))
        .or_else(|| luts.luts.get("heavenly"))
        .expect("Theme LUT missing");

    let lut_w = 512.0;
    let lut_h = 1024.0;
    let edge = &state.active_edge;
    let coord = state.current_coord;
    let intensity = state.current_intensity;
    let pressure_scale = 0.90 + state.current_pressure * 0.45;

    let elapsed = state.start_time.elapsed().as_secs_f64();
    let breathe = 1.0 + 0.055 * (elapsed * 2.6).sin() + 0.025 * (elapsed * 5.2).sin();
    let breathe_y = 1.0 + 0.035 * (elapsed * 2.2).cos();
    let pulse_alpha = 1.0 + 0.060 * (elapsed * 3.2).sin();

    // Two-stage spatial dynamics:
    // Stage 1 (intensity <= 0.25): subtle, focused, elegant connection bead indicating click-and-hold / pickup.
    // Stage 2 (intensity > 0.25): exponential swell into the massive, hyper-luminous Drooop aura with additive Screen bloom!
    let swell = if intensity <= 0.25 {
        0.0
    } else {
        ((intensity - 0.25) / 0.75).powf(1.22)
    };

    let (radius, radius_y) = if edge.starts_with("corner-") {
        let r = ((160.0 + intensity.min(0.25) * 120.0) + swell * 640.0) * pressure_scale * breathe;
        (r, r)
    } else if edge == "top" || edge == "bottom" {
        let rx = ((150.0 + intensity.min(0.25) * 120.0) + swell * 600.0) * pressure_scale * breathe;
        let ry = ((240.0 + intensity.min(0.25) * 160.0) + swell * 700.0) * breathe_y;
        (rx, ry)
    } else {
        // Left / Right edge: 160px initial hold bead, dynamically swelling up to ~880px reach into desktop
        let rx = ((160.0 + intensity.min(0.25) * 120.0) + swell * 700.0) * pressure_scale * breathe;
        let ry = ((250.0 + intensity.min(0.25) * 160.0) + swell * 800.0) * breathe_y;
        (rx, ry)
    };

    cr.save().expect("Cairo save");

    apply_edge_transform(cr, width, height, edge, coord);

    // Apply subtle velocity skew along bezel
    if edge == "left" || edge == "right" {
        let skew_y = (-state.current_vy * 0.16).clamp(-0.20, 0.20);
        let skew_mat = cairo::Matrix::new(1.0, skew_y, 0.0, 1.0, 0.0, 0.0);
        cr.transform(skew_mat);
    }

    // 1. Tier 1: Precomputed Bilinear Chromatic Dispersion Atmospheric Wash
    cr.save().expect("Cairo save");
    cr.scale(radius / lut_w, radius_y / (lut_h / 2.0));
    cr.translate(-lut_w, -lut_h / 2.0);
    let pat = SurfacePattern::create(surf);
    pat.set_filter(Filter::Fast);
    let _ = cr.set_source(&pat);
    let glow_alpha = (intensity.sqrt() * 1.05 * pulse_alpha).min(1.0);
    let _ = cr.paint_with_alpha(glow_alpha);
    let _ = cr.restore();

    // 1b. Tier 1b: Hyper-Luminous Additive Screen Bloom (The High-Energy Drooop Incandescent Glow)
    if swell > 0.02 {
        cr.save().expect("Cairo save");
        cr.set_operator(cairo::Operator::Screen);
        let bloom_rx = radius * 0.88;
        let bloom_ry = radius_y * 0.88;
        let bloom_pat = cairo::RadialGradient::new(0.0, 0.0, 0.0, 0.0, 0.0, bloom_rx);
        match state.theme.as_str() {
            "plasma" => {
                bloom_pat.add_color_stop_rgba(0.00, 1.00, 1.00, 1.00, 0.95 * swell);
                bloom_pat.add_color_stop_rgba(0.12, 0.40, 0.90, 1.00, 0.88 * swell);
                bloom_pat.add_color_stop_rgba(0.35, 0.85, 0.18, 0.95, 0.70 * swell);
                bloom_pat.add_color_stop_rgba(0.65, 0.20, 0.10, 0.85, 0.35 * swell);
                bloom_pat.add_color_stop_rgba(1.00, 0.00, 0.00, 0.00, 0.00);
            }
            "solar" => {
                bloom_pat.add_color_stop_rgba(0.00, 1.00, 1.00, 1.00, 0.98 * swell);
                bloom_pat.add_color_stop_rgba(0.12, 1.00, 0.90, 0.30, 0.90 * swell);
                bloom_pat.add_color_stop_rgba(0.35, 1.00, 0.45, 0.08, 0.70 * swell);
                bloom_pat.add_color_stop_rgba(0.65, 0.85, 0.10, 0.05, 0.35 * swell);
                bloom_pat.add_color_stop_rgba(1.00, 0.00, 0.00, 0.00, 0.00);
            }
            "liquid" => {
                bloom_pat.add_color_stop_rgba(0.00, 1.00, 1.00, 1.00, 0.95 * swell);
                bloom_pat.add_color_stop_rgba(0.12, 0.20, 0.95, 0.95, 0.88 * swell);
                bloom_pat.add_color_stop_rgba(0.35, 0.05, 0.65, 0.98, 0.70 * swell);
                bloom_pat.add_color_stop_rgba(0.65, 0.10, 0.25, 0.85, 0.35 * swell);
                bloom_pat.add_color_stop_rgba(1.00, 0.00, 0.00, 0.00, 0.00);
            }
            _ => {
                // Cosmic Aurora / Heavenly: incandescent gold core -> hot rose -> electric violet -> laser cyan
                bloom_pat.add_color_stop_rgba(0.00, 1.00, 1.00, 1.00, 0.98 * swell);
                bloom_pat.add_color_stop_rgba(0.10, 1.00, 0.92, 0.65, 0.92 * swell);
                bloom_pat.add_color_stop_rgba(0.28, 1.00, 0.32, 0.75, 0.80 * swell);
                bloom_pat.add_color_stop_rgba(0.50, 0.55, 0.18, 0.98, 0.58 * swell);
                bloom_pat.add_color_stop_rgba(0.72, 0.08, 0.82, 0.98, 0.30 * swell);
                bloom_pat.add_color_stop_rgba(1.00, 0.00, 0.00, 0.00, 0.00);
            }
        }
        cr.scale(1.0, bloom_ry / bloom_rx);
        cr.arc(0.0, 0.0, bloom_rx, std::f64::consts::PI / 2.0, 3.0 * std::f64::consts::PI / 2.0);
        let _ = cr.set_source(&bloom_pat);
        let _ = cr.fill();
        let _ = cr.restore();
    }

    // 2. Bursting Volumetric Corona Light Rays (Dynamic Angled Light Fans with Additive Blending)
    if intensity > 0.06 {
        cr.save().expect("Cairo save");
        cr.set_operator(cairo::Operator::Screen);
        let num_rays = if swell > 0.10 { 9 } else { 5 };
        let base_reach = ((150.0 + intensity.min(0.25) * 80.0) + swell * 540.0) * pressure_scale;
        for i in 0..num_rays {
            let angle_offset = (i as f64 - (num_rays as f64 - 1.0) / 2.0) * (if swell > 0.1 { 0.15 } else { 0.18 });
            let beam_len = base_reach * (0.80 + 0.20 * (elapsed * 3.4 + i as f64 * 1.3).sin());
            let beam_alpha = (0.28 + 0.32 * (elapsed * 4.2 + i as f64 * 0.8).sin().abs()) * intensity;

            cr.save().expect("Cairo save");
            cr.rotate(angle_offset);
            let beam_pat = cairo::LinearGradient::new(0.0, 0.0, -beam_len, 0.0);
            match state.theme.as_str() {
                "plasma" => {
                    beam_pat.add_color_stop_rgba(0.0, 0.40, 0.95, 1.0, beam_alpha * 0.90);
                    beam_pat.add_color_stop_rgba(0.4, 0.85, 0.15, 0.95, beam_alpha * 0.70);
                    beam_pat.add_color_stop_rgba(1.0, 0.50, 0.10, 0.90, 0.0);
                }
                "solar" => {
                    beam_pat.add_color_stop_rgba(0.0, 1.0, 0.90, 0.30, beam_alpha * 0.90);
                    beam_pat.add_color_stop_rgba(0.4, 1.0, 0.45, 0.08, beam_alpha * 0.70);
                    beam_pat.add_color_stop_rgba(1.0, 0.80, 0.05, 0.05, 0.0);
                }
                "liquid" => {
                    beam_pat.add_color_stop_rgba(0.0, 0.20, 1.0, 0.90, beam_alpha * 0.90);
                    beam_pat.add_color_stop_rgba(0.4, 0.05, 0.75, 0.98, beam_alpha * 0.70);
                    beam_pat.add_color_stop_rgba(1.0, 0.08, 0.30, 0.85, 0.0);
                }
                _ => {
                    // aurora / heavenly — cycling prismatic beams
                    if i % 3 == 0 {
                        beam_pat.add_color_stop_rgba(0.0, 1.0, 0.85, 0.40, beam_alpha * 0.92); // blazing gold
                        beam_pat.add_color_stop_rgba(0.4, 0.98, 0.28, 0.65, beam_alpha * 0.72); // coral rose
                        beam_pat.add_color_stop_rgba(1.0, 0.60, 0.15, 0.95, 0.0);
                    } else if i % 3 == 1 {
                        beam_pat.add_color_stop_rgba(0.0, 0.95, 0.22, 0.85, beam_alpha * 0.92); // neon magenta
                        beam_pat.add_color_stop_rgba(0.4, 0.55, 0.20, 0.98, beam_alpha * 0.72); // electric violet
                        beam_pat.add_color_stop_rgba(1.0, 0.08, 0.75, 0.95, 0.0);
                    } else {
                        beam_pat.add_color_stop_rgba(0.0, 0.15, 0.90, 0.98, beam_alpha * 0.92); // laser cyan
                        beam_pat.add_color_stop_rgba(0.4, 0.28, 0.48, 0.98, beam_alpha * 0.72); // sapphire
                        beam_pat.add_color_stop_rgba(1.0, 0.65, 0.20, 0.90, 0.0);
                    }
                }
            }
            let _ = cr.set_source(&beam_pat);
            let beam_spread = (24.0 + swell * 20.0) * pressure_scale;
            cr.new_path();
            cr.move_to(0.0, 0.0);
            cr.line_to(-beam_len, -beam_spread);
            cr.line_to(-beam_len, beam_spread);
            cr.close_path();
            let _ = cr.fill();
            let _ = cr.restore();
        }
        let _ = cr.restore();
    }

    // 3. Living Dynamic Harmonic Fluid Meniscus & Surface-Tension Wobble
    let base_radius = ((34.0 + intensity.min(0.25) * 20.0) + swell * 110.0) * pressure_scale;
    cr.save().expect("Cairo save");
    cr.new_path();
    let steps = 48;
    for i in 0..=steps {
        let theta = (std::f64::consts::PI / 2.0)
            + (std::f64::consts::PI * i as f64 / steps as f64);
        let w1 = 0.075 * (theta * 2.5 + elapsed * 3.4).sin();
        let w2 = 0.040 * (theta * 4.5 - elapsed * 2.1).sin();
        let w3 = 0.025 * (theta * 1.5 + elapsed * 1.2).cos();
        let wobble = (w1 + w2 + w3) * (0.35 + 0.65 * intensity);
        let r = base_radius * (1.0 + wobble);
        let x = r * theta.cos();
        let y = r * theta.sin() * (1.42 + 0.10 * (elapsed * 2.4).sin());
        if i == 0 {
            cr.move_to(x, y);
        } else {
            cr.line_to(x, y);
        }
    }
    cr.close_path();

    let fluid_pat = cairo::RadialGradient::new(0.0, 0.0, 4.0, 0.0, 0.0, base_radius * 1.15);
    match state.theme.as_str() {
        "plasma" => {
            fluid_pat.add_color_stop_rgba(0.00, 1.00, 1.00, 1.00, 0.90 * intensity);
            fluid_pat.add_color_stop_rgba(0.18, 0.35, 0.95, 1.00, 0.85 * intensity);
            fluid_pat.add_color_stop_rgba(0.45, 0.95, 0.15, 0.92, 0.70 * intensity);
            fluid_pat.add_color_stop_rgba(0.75, 0.55, 0.10, 0.95, 0.35 * intensity);
            fluid_pat.add_color_stop_rgba(1.00, 0.00, 0.00, 0.00, 0.00);
        }
        "solar" => {
            fluid_pat.add_color_stop_rgba(0.00, 1.00, 1.00, 0.95, 0.92 * intensity);
            fluid_pat.add_color_stop_rgba(0.18, 1.00, 0.85, 0.25, 0.88 * intensity);
            fluid_pat.add_color_stop_rgba(0.45, 1.00, 0.40, 0.08, 0.70 * intensity);
            fluid_pat.add_color_stop_rgba(0.75, 0.85, 0.10, 0.15, 0.35 * intensity);
            fluid_pat.add_color_stop_rgba(1.00, 0.00, 0.00, 0.00, 0.00);
        }
        "liquid" => {
            fluid_pat.add_color_stop_rgba(0.00, 1.00, 1.00, 1.00, 0.90 * intensity);
            fluid_pat.add_color_stop_rgba(0.18, 0.35, 1.00, 0.95, 0.85 * intensity);
            fluid_pat.add_color_stop_rgba(0.48, 0.05, 0.85, 0.85, 0.65 * intensity);
            fluid_pat.add_color_stop_rgba(0.78, 0.08, 0.45, 0.90, 0.35 * intensity);
            fluid_pat.add_color_stop_rgba(1.00, 0.00, 0.00, 0.00, 0.00);
        }
        _ => {
            // aurora / heavenly — rich glowing peach-gold -> coral-rose -> electric magenta -> laser cyan
            fluid_pat.add_color_stop_rgba(0.00, 1.00, 0.98, 0.92, 0.95 * intensity);
            fluid_pat.add_color_stop_rgba(0.14, 1.00, 0.82, 0.30, 0.92 * intensity);
            fluid_pat.add_color_stop_rgba(0.32, 1.00, 0.28, 0.62, 0.85 * intensity);
            fluid_pat.add_color_stop_rgba(0.55, 0.85, 0.15, 0.92, 0.70 * intensity);
            fluid_pat.add_color_stop_rgba(0.78, 0.10, 0.78, 0.98, 0.42 * intensity);
            fluid_pat.add_color_stop_rgba(1.00, 0.00, 0.00, 0.00, 0.00);
        }
    }
    let _ = cr.set_source(&fluid_pat);
    let _ = cr.fill_preserve();

    // Vivid prismatic meniscus outer contour
    cr.set_line_width(2.0 * pressure_scale);
    cr.set_source_rgba(1.0, 0.92, 0.60, 0.50 * intensity);
    let _ = cr.stroke();

    // Specular 3D Core Droplet with Chromatic Halo (Additive Screen blend for incandescent core)
    let core_r = base_radius * 0.38;
    cr.save().expect("Cairo save");
    cr.set_operator(cairo::Operator::Screen);
    let core_pat = cairo::RadialGradient::new(-core_r * 0.35, 0.0, 2.0, 0.0, 0.0, core_r);
    core_pat.add_color_stop_rgba(0.00, 1.00, 1.00, 1.00, 0.98 * intensity);
    core_pat.add_color_stop_rgba(0.28, 1.00, 0.88, 0.45, 0.90 * intensity);
    core_pat.add_color_stop_rgba(0.62, 0.95, 0.35, 0.78, 0.60 * intensity);
    core_pat.add_color_stop_rgba(1.00, 0.00, 0.00, 0.00, 0.00);
    cr.scale(1.0, 1.35);
    cr.arc(0.0, 0.0, core_r, 0.0, 2.0 * std::f64::consts::PI);
    let _ = cr.set_source(&core_pat);
    let _ = cr.fill();
    let _ = cr.restore();
    let _ = cr.restore();

    // 4. Concentric Chromatic Aberration Dispersion Ripples (RGB Separation with Screen blending)
    if intensity > 0.10 {
        cr.save().expect("Cairo save");
        cr.set_operator(cairo::Operator::Screen);
        let wave_r = (base_radius * 0.65 + (elapsed * 55.0) % (90.0 + swell * 80.0)) * pressure_scale;
        let wave_env = (1.0 - (wave_r / (base_radius * 0.65 + 90.0 + swell * 80.0)).powi(2)).max(0.0);

        // Red chromatic fringe
        cr.new_path();
        cr.arc(0.0, 0.0, wave_r + 6.0, std::f64::consts::PI / 2.0, 3.0 * std::f64::consts::PI / 2.0);
        cr.set_line_width(2.0 + swell * 1.5);
        cr.set_source_rgba(1.0, 0.25, 0.50, 0.65 * wave_env * intensity);
        let _ = cr.stroke();

        // Green/Cyan core crest
        cr.new_path();
        cr.arc(0.0, 0.0, wave_r, std::f64::consts::PI / 2.0, 3.0 * std::f64::consts::PI / 2.0);
        cr.set_line_width(2.5 + swell * 2.0);
        cr.set_source_rgba(0.15, 0.95, 0.85, 0.75 * wave_env * intensity);
        let _ = cr.stroke();

        // Blue/Violet chromatic trail
        if wave_r > 6.0 {
            cr.new_path();
            cr.arc(0.0, 0.0, wave_r - 6.0, std::f64::consts::PI / 2.0, 3.0 * std::f64::consts::PI / 2.0);
            cr.set_line_width(1.8 + swell * 1.2);
            cr.set_source_rgba(0.60, 0.20, 0.98, 0.60 * wave_env * intensity);
            let _ = cr.stroke();
        }
        let _ = cr.restore();
    }

    // 5. Tier 5: Molten Dynamic Bezel Rim Light (Brilliant neon glass edge highlight)
    let rim_h = ((200.0 + swell * 350.0) * pressure_scale).min(height * 0.90);
    let rim_w = (3.5 + swell * 3.5) * pressure_scale;
    let rim_pat = cairo::LinearGradient::new(-rim_w, 0.0, 0.0, 0.0);
    match state.theme.as_str() {
        "plasma" => {
            rim_pat.add_color_stop_rgba(0.0, 0.35, 0.95, 1.0, 0.0);
            rim_pat.add_color_stop_rgba(0.4, 0.95, 0.15, 0.95, 0.75 * intensity);
            rim_pat.add_color_stop_rgba(0.8, 0.55, 0.10, 0.95, 0.90 * intensity);
            rim_pat.add_color_stop_rgba(1.0, 1.00, 1.00, 1.00, 1.00 * intensity);
        }
        "solar" => {
            rim_pat.add_color_stop_rgba(0.0, 1.0, 0.35, 0.05, 0.0);
            rim_pat.add_color_stop_rgba(0.4, 1.0, 0.65, 0.10, 0.75 * intensity);
            rim_pat.add_color_stop_rgba(0.8, 1.0, 0.90, 0.30, 0.90 * intensity);
            rim_pat.add_color_stop_rgba(1.0, 1.0, 1.00, 0.95, 1.00 * intensity);
        }
        "liquid" => {
            rim_pat.add_color_stop_rgba(0.0, 0.05, 0.50, 0.95, 0.0);
            rim_pat.add_color_stop_rgba(0.4, 0.08, 0.85, 0.95, 0.75 * intensity);
            rim_pat.add_color_stop_rgba(0.8, 0.45, 1.00, 0.95, 0.90 * intensity);
            rim_pat.add_color_stop_rgba(1.0, 1.00, 1.00, 1.00, 1.00 * intensity);
        }
        _ => {
            // aurora / heavenly — fluorescent chromatic rim line
            rim_pat.add_color_stop_rgba(0.0, 0.10, 0.80, 0.98, 0.0);
            rim_pat.add_color_stop_rgba(0.35, 0.95, 0.20, 0.85, 0.80 * intensity);
            rim_pat.add_color_stop_rgba(0.75, 1.00, 0.80, 0.35, 0.95 * intensity);
            rim_pat.add_color_stop_rgba(1.0, 1.00, 1.00, 1.00, 1.00 * intensity);
        }
    }
    let _ = cr.set_source(&rim_pat);
    cr.rectangle(-rim_w, -rim_h / 2.0, rim_w, rim_h);
    let _ = cr.fill();

    // 6. Tier 6: Theme Optical Accents & Bursting Stardust Motes
    if state.theme == "plasma" && intensity > 0.10 {
        // Crackling lightning tendrils branching across desktop
        cr.save().expect("Cairo save");
        cr.set_operator(cairo::Operator::Screen);
        cr.set_line_cap(cairo::LineCap::Round);
        for branch in 0..5 {
            cr.new_path();
            cr.move_to(0.0, 0.0);
            let mut cx = 0.0;
            let mut cy = 0.0;
            let len = ((120.0 + intensity.min(0.25) * 80.0) + swell * 400.0)
                * (0.7 + 0.3 * (elapsed * 12.0 + branch as f64 * 1.5).sin())
                * pressure_scale;
            let segs = 8;
            for s in 0..segs {
                cx -= len / segs as f64;
                let jitter = (elapsed * 24.0 + s as f64 * 4.0 + branch as f64 * 3.0).sin()
                    * (18.0 + swell * 14.0)
                    * pressure_scale;
                cy += jitter;
                cr.line_to(cx, cy);
            }
            cr.set_line_width(if branch == 0 { 2.8 + swell * 1.5 } else { 1.5 + swell * 0.8 } * pressure_scale);
            cr.set_source_rgba(0.40, 0.95, 1.0, 0.92 * intensity);
            let _ = cr.stroke();
        }
        let _ = cr.restore();
    } else if state.theme == "solar" && intensity > 0.10 {
        // Rising thermonuclear embers
        cr.save().expect("Cairo save");
        cr.set_operator(cairo::Operator::Screen);
        for idx in 0..10 {
            let phase = idx as f64 * 1.1;
            let ey = ((elapsed * 65.0 + phase * 35.0) % (190.0 + swell * 200.0)) - (95.0 + swell * 100.0);
            let ex = -((18.0 + idx as f64 * 18.0 + (elapsed * 3.0 + phase).sin() * 16.0) + swell * 140.0)
                * intensity
                * pressure_scale;
            let er = (2.2 + (idx % 3) as f64 + swell * 2.0) * intensity * pressure_scale;
            cr.arc(ex, ey, er, 0.0, 2.0 * std::f64::consts::PI);
            cr.set_source_rgba(1.0, 0.85, 0.30, 0.92 * intensity);
            let _ = cr.fill();
        }
        let _ = cr.restore();
    } else if intensity > 0.08 {
        // Shimmering Prismatic Bioluminescent Stardust Motes
        cr.save().expect("Cairo save");
        cr.set_operator(cairo::Operator::Screen);
        let num_motes = if swell > 0.1 { 14 } else { 8 };
        for idx in 0..num_motes {
            let phase = idx as f64 * 1.25;
            let span_y = 200.0 + swell * 350.0;
            let sy = ((elapsed * 50.0 + phase * 38.0) % span_y) - span_y / 2.0;
            let sx = -((24.0 + idx as f64 * 22.0 + (elapsed * 2.6 + phase).cos() * 18.0) + swell * 160.0)
                * intensity
                * pressure_scale;
            let sparkle_alpha = (0.4 + 0.6 * (elapsed * 4.0 + phase * 2.0).sin().abs()) * intensity;
            let sr = (2.0 + (idx % 3) as f64 * 1.2 + swell * 1.8) * pressure_scale;
            cr.arc(sx, sy, sr, 0.0, 2.0 * std::f64::consts::PI);
            if idx % 3 == 0 {
                cr.set_source_rgba(1.0, 0.88, 0.45, sparkle_alpha * 0.95); // gold mote
            } else if idx % 3 == 1 {
                cr.set_source_rgba(1.0, 0.38, 0.80, sparkle_alpha * 0.95); // rose mote
            } else {
                cr.set_source_rgba(0.38, 0.92, 1.0, sparkle_alpha * 0.95); // cyan mote
            }
            let _ = cr.fill();
        }
        let _ = cr.restore();
    }

    let _ = cr.restore();
}

fn draw_fullscreen_surge(
    cr: &Context,
    width: f64,
    height: f64,
    progress: f64,
    edge: &str,
    coord: f64,
    state: &OverlayState,
    luts: &Luts,
) {
    if progress <= 0.001 || progress >= 1.0 {
        return;
    }

    let surf = luts
        .surge_luts
        .get(&state.theme)
        .or_else(|| luts.surge_luts.get("aurora"))
        .or_else(|| luts.surge_luts.get("heavenly"))
        .expect("Surge LUT missing");

    let lut_w = 512.0;
    let lut_h = 1024.0;

    let ease = 1.0 - (1.0 - progress).powf(2.8);
    let damping = (1.0 - progress).max(0.0).powf(1.30);
    if damping <= 0.005 {
        return;
    }

    let max_reach = width.hypot(height) * 1.22;
    let radius_x = 380.0 + ease * (max_reach - 380.0);
    let radius_y = (radius_x * 1.15).max(height * 1.6);

    cr.save().expect("Cairo save");

    apply_edge_transform(cr, width, height, edge, coord);

    // 1. Bilinear Surge Atmospheric Wash Blit
    cr.save().expect("Cairo save");
    cr.scale(radius_x / lut_w, radius_y / (lut_h / 2.0));
    cr.translate(-lut_w, -lut_h / 2.0);

    let pat = SurfacePattern::create(surf);
    pat.set_filter(Filter::Fast);
    let _ = cr.set_source(&pat);
    let _ = cr.paint_with_alpha(damping * 0.98);
    let _ = cr.restore();

    // 2. High-Energy Supernova Burst Rays on Entry
    if progress < 0.40 {
        let burst_p = progress / 0.40;
        let burst_alpha = (1.0 - burst_p).powi(2);
        cr.save().expect("Cairo save");
        let num_burst_rays = 12;
        let ray_len = max_reach * 0.55 * burst_p;
        for i in 0..num_burst_rays {
            let angle = (i as f64 - (num_burst_rays as f64 - 1.0) / 2.0) * 0.22;
            cr.save().expect("Cairo save");
            cr.rotate(angle);
            let ray_pat = cairo::LinearGradient::new(0.0, 0.0, -ray_len, 0.0);
            if i % 3 == 0 {
                ray_pat.add_color_stop_rgba(0.0, 1.0, 0.90, 0.40, burst_alpha * 0.90);
                ray_pat.add_color_stop_rgba(1.0, 0.95, 0.20, 0.65, 0.0);
            } else if i % 3 == 1 {
                ray_pat.add_color_stop_rgba(0.0, 0.95, 0.20, 0.85, burst_alpha * 0.90);
                ray_pat.add_color_stop_rgba(1.0, 0.45, 0.15, 0.95, 0.0);
            } else {
                ray_pat.add_color_stop_rgba(0.0, 0.20, 0.85, 1.0, burst_alpha * 0.90);
                ray_pat.add_color_stop_rgba(1.0, 0.10, 0.35, 0.95, 0.0);
            }
            let _ = cr.set_source(&ray_pat);
            cr.new_path();
            cr.move_to(0.0, 0.0);
            cr.line_to(-ray_len, -36.0 * burst_p);
            cr.line_to(-ray_len, 36.0 * burst_p);
            cr.close_path();
            let _ = cr.fill();
            let _ = cr.restore();
        }
        let _ = cr.restore();
    }

    // 3. Concentric Chromatic Water Caustic Shockwaves across screen
    let r_wave = ease * max_reach * 0.75;
    if r_wave > 20.0 {
        cr.save().expect("Cairo save");

        // Outer Red dispersion crest
        cr.new_path();
        cr.arc(0.0, 0.0, r_wave + 14.0, 0.0, 2.0 * std::f64::consts::PI);
        cr.set_line_width(2.8 * damping);
        cr.set_source_rgba(1.0, 0.25, 0.55, 0.65 * damping);
        let _ = cr.stroke();

        // Primary Specular Caustic Shock Crest
        cr.new_path();
        cr.arc(0.0, 0.0, r_wave, 0.0, 2.0 * std::f64::consts::PI);
        cr.set_line_width(3.6 * damping);
        cr.set_source_rgba(1.0, 1.0, 1.0, 0.88 * damping);
        let _ = cr.stroke();

        // Inner Cyan/Turquoise dispersion ring
        if r_wave > 24.0 {
            cr.new_path();
            cr.arc(0.0, 0.0, r_wave - 14.0, 0.0, 2.0 * std::f64::consts::PI);
            cr.set_line_width(2.6 * damping);
            cr.set_source_rgba(0.20, 0.88, 1.0, 0.70 * damping);
            let _ = cr.stroke();
        }

        // Deep Violet dispersion trailing ring
        if r_wave > 48.0 {
            cr.new_path();
            cr.arc(0.0, 0.0, r_wave - 36.0, 0.0, 2.0 * std::f64::consts::PI);
            cr.set_line_width(2.0 * damping);
            cr.set_source_rgba(0.65, 0.20, 0.98, 0.50 * damping);
            let _ = cr.stroke();
        }
        let _ = cr.restore();
    }

    // 4. Exploding Supernova Star Particles
    if progress > 0.05 && progress < 0.75 {
        cr.save().expect("Cairo save");
        let num_sparks = 14;
        for i in 0..num_sparks {
            let spark_angle = (i as f64 / num_sparks as f64) * 2.0 * std::f64::consts::PI;
            let spark_dist = ease * max_reach * 0.45 * (0.65 + 0.35 * (i as f64 * 1.7).sin().abs());
            let sx = -spark_dist * spark_angle.cos().abs();
            let sy = spark_dist * spark_angle.sin();
            let spark_r = (3.2 * damping) * (0.8 + 0.4 * (i as f64).cos().abs());
            cr.arc(sx, sy, spark_r, 0.0, 2.0 * std::f64::consts::PI);
            if i % 3 == 0 {
                cr.set_source_rgba(1.0, 0.85, 0.35, 0.90 * damping);
            } else if i % 3 == 1 {
                cr.set_source_rgba(1.0, 0.30, 0.70, 0.90 * damping);
            } else {
                cr.set_source_rgba(0.30, 0.90, 1.0, 0.90 * damping);
            }
            let _ = cr.fill();
        }
        let _ = cr.restore();
    }

    let _ = cr.restore();
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

fn draw_drop_card(cr: &Context, width: f64, height: f64, state: &OverlayState) {
    if !state.card_active {
        return;
    }

    let card_w = 280.0;
    let card_h = 74.0;
    let edge = &state.card_edge;
    let coord = state.card_coord;

    // Spring overshoot curve on entry, smooth ease-in on exit
    let offset = if state.card_progress < 0.18 {
        let t = state.card_progress / 0.18;
        let c1 = 1.70158;
        let c3 = c1 + 1.0;
        1.0 + c3 * (t - 1.0).powi(3) + c1 * (t - 1.0).powi(2)
    } else if state.card_progress < 0.72 {
        1.0
    } else {
        let t = (state.card_progress - 0.72) / 0.28;
        1.0 - (t * t)
    };

    let (card_x, card_y) = match edge.as_str() {
        "corner-top-right" => (width - (offset * 320.0), offset * 140.0),
        "corner-bottom-right" => (
            width - (offset * 320.0),
            height - (offset * 140.0) - card_h,
        ),
        "corner-top-left" => ((offset * 320.0) - 280.0, offset * 140.0),
        "corner-bottom-left" => (
            (offset * 320.0) - 280.0,
            height - (offset * 140.0) - card_h,
        ),
        "left" => (
            (offset * 320.0) - 280.0,
            (coord * height - card_h / 2.0).clamp(50.0, height - card_h - 50.0),
        ),
        "top" => (
            (coord * width - card_w / 2.0).clamp(40.0, width - card_w - 40.0),
            (offset * 120.0) - card_h,
        ),
        "bottom" => (
            (coord * width - card_w / 2.0).clamp(40.0, width - card_w - 40.0),
            height - (offset * 120.0),
        ),
        _ => (
            width - (offset * 320.0),
            (coord * height - card_h / 2.0).clamp(50.0, height - card_h - 50.0),
        ),
    };

    let alpha = if state.card_progress > 0.72 {
        ((1.0 - state.card_progress) / 0.28).max(0.0)
    } else {
        (state.card_progress / 0.12).min(1.0)
    };

    if alpha <= 0.01 {
        return;
    }

    cr.save().expect("Cairo save");

    // 1. Soft Ambient Drop Shadow
    rounded_rect(cr, card_x + 2.0, card_y + 6.0, card_w, card_h, 16.0);
    cr.set_source_rgba(0.0, 0.0, 0.0, 0.35 * alpha);
    let _ = cr.fill();

    // 2. Frosted Glass Card Body (Deep dark translucent obsidian)
    rounded_rect(cr, card_x, card_y, card_w, card_h, 16.0);
    let card_bg = cairo::LinearGradient::new(card_x, card_y, card_x + card_w, card_y + card_h);
    card_bg.add_color_stop_rgba(0.0, 0.08, 0.12, 0.18, 0.92 * alpha);
    card_bg.add_color_stop_rgba(1.0, 0.04, 0.07, 0.12, 0.96 * alpha);
    let _ = cr.set_source(&card_bg);
    let _ = cr.fill_preserve();

    // 3. Subtle Chromatic Prismatic Edge Border
    let border_pat =
        cairo::LinearGradient::new(card_x, card_y, card_x + card_w, card_y + card_h);
    border_pat.add_color_stop_rgba(0.0, 0.35, 0.85, 1.0, 0.80 * alpha);
    border_pat.add_color_stop_rgba(0.5, 0.75, 0.45, 0.95, 0.60 * alpha);
    border_pat.add_color_stop_rgba(1.0, 0.95, 0.80, 0.40, 0.70 * alpha);
    let _ = cr.set_source(&border_pat);
    cr.set_line_width(1.5);
    let _ = cr.stroke();

    // 4. Emerald/Cyan Success Icon Circle
    let icon_cx = card_x + 30.0;
    let icon_cy = card_y + card_h / 2.0;
    let icon_r = 18.0;
    cr.arc(icon_cx, icon_cy, icon_r, 0.0, 2.0 * std::f64::consts::PI);
    let icon_bg = cairo::LinearGradient::new(
        icon_cx - icon_r,
        icon_cy - icon_r,
        icon_cx + icon_r,
        icon_cy + icon_r,
    );
    icon_bg.add_color_stop_rgba(0.0, 0.0, 0.85, 0.60, 0.90 * alpha);
    icon_bg.add_color_stop_rgba(1.0, 0.0, 0.55, 0.95, 0.90 * alpha);
    let _ = cr.set_source(&icon_bg);
    let _ = cr.fill();

    // 5. Crisp Rounded Vector Checkmark
    cr.set_source_rgba(1.0, 1.0, 1.0, 0.95 * alpha);
    cr.set_line_width(2.4);
    cr.set_line_cap(cairo::LineCap::Round);
    cr.set_line_join(cairo::LineJoin::Round);
    cr.move_to(icon_cx - 6.0, icon_cy);
    cr.line_to(icon_cx - 2.0, icon_cy + 5.0);
    cr.line_to(icon_cx + 7.0, icon_cy - 5.0);
    let _ = cr.stroke();

    // 6. Typography: Filename (Bold)
    cr.set_source_rgba(0.95, 0.97, 1.0, 0.98 * alpha);
    cr.select_font_face("Sans", cairo::FontSlant::Normal, cairo::FontWeight::Bold);
    cr.set_font_size(14.0);
    cr.move_to(card_x + 60.0, card_y + 32.0);
    let display_title = if state.card_filename.len() > 22 {
        format!("{}...", &state.card_filename[..19])
    } else {
        state.card_filename.clone()
    };
    let _ = cr.show_text(&display_title);

    // 7. Typography: Subtitle
    cr.set_source_rgba(0.60, 0.70, 0.85, 0.85 * alpha);
    cr.select_font_face("Sans", cairo::FontSlant::Normal, cairo::FontWeight::Normal);
    cr.set_font_size(11.0);
    cr.move_to(card_x + 60.0, card_y + 52.0);
    let _ = cr.show_text(&format!("Saved to ~/Downloads • {}", state.card_size_str));

    let _ = cr.restore();
}

fn main() {
    let app = Application::builder()
        .application_id("dev.drap.rust.overlay")
        .build();

    app.connect_activate(|app| {
        // 0. Transparent CSS for overlay canvas (prevents opaque dark window background)
        let css_provider = gtk4::CssProvider::new();
        css_provider.load_from_data("
            window {
                background-color: transparent;
                background: none;
            }
        ");
        if let Some(display) = gtk4::gdk::Display::default() {
            gtk4::style_context_add_provider_for_display(
                &display,
                &css_provider,
                gtk4::STYLE_PROVIDER_PRIORITY_APPLICATION,
            );
        }

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
        window.set_exclusive_zone(0);
        window.set_keyboard_mode(KeyboardMode::None);

        if let Some(display) = gtk4::gdk::Display::default() {
            let monitors = display.monitors();
            for i in 0..monitors.n_items() {
                if let Some(mon) = monitors.item(i).and_downcast::<gtk4::gdk::Monitor>() {
                    if mon.connector().as_deref() == Some("eDP-1") {
                        window.set_monitor(&mon);
                        break;
                    }
                }
            }
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

            // Draw full-screen surge wave on drop
            if s.confirm_active {
                draw_fullscreen_surge(
                    cr,
                    w,
                    h,
                    s.confirm_progress,
                    &s.confirm_edge,
                    s.confirm_coord,
                    &s,
                    &draw_luts,
                );
            }

            // Draw ambient edge bulb
            draw_ambience(cr, w, h, &s, &draw_luts);

            // Draw frosted drop card
            draw_drop_card(cr, w, h, &s);
        });

        window.set_child(Some(&drawing_area));

        // Realize window and guarantee 100% click-through input region
        WidgetExt::realize(&window);
        if let Some(surface) = window.surface() {
            let empty_region = cairo::Region::create();
            surface.set_input_region(&empty_region);
        }

        window.connect_map(|win| {
            if let Some(surface) = win.surface() {
                let empty_region = cairo::Region::create();
                surface.set_input_region(&empty_region);
            }
        });

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
                            process_message(&mut s, msg);
                        }
                    }

                    // Progress confirm wave (crisp ~0.48s bloom)
                    if s.confirm_active {
                        if let Some(start) = s.confirm_start_time {
                            let elapsed = start.elapsed().as_secs_f64();
                            s.confirm_progress = (elapsed / 0.48).min(1.0);
                            s.current_intensity =
                                (1.0 - s.confirm_progress).max(0.0).powf(2.0);
                            if s.confirm_progress >= 1.0 {
                                s.confirm_active = false;
                                s.confirm_progress = 0.0;
                                s.current_intensity = 0.0;
                            }
                        }
                    } else {
                        // Smooth intensity interpolation
                        s.current_intensity +=
                            (s.target_intensity - s.current_intensity) * 0.28;
                    }

                    // Smooth pressure interpolation
                    s.current_pressure +=
                        (s.target_pressure - s.current_pressure) * 0.25;

                    // Progress drop card (snappy 1.25s duration)
                    if s.card_active {
                        if let Some(start) = s.card_start_time {
                            let elapsed = start.elapsed().as_secs_f64();
                            s.card_progress = (elapsed / 1.25).min(1.0);
                            if s.card_progress >= 1.0 {
                                s.card_active = false;
                                s.card_progress = 0.0;
                            }
                        }
                    }

                    s.current_coord += (s.target_coord - s.current_coord) * 0.35;

                    da_ref.queue_draw();

                    // Continue ticking only if there is active motion
                    if s.confirm_active
                        || s.card_active
                        || s.current_intensity > 0.005
                        || s.target_intensity > 0.005
                    {
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

        // Register immediate event dispatcher for WebSocket messages
        let d_state = state.clone();
        let d_da = drawing_area.clone();
        let d_rx = rx_cell.clone();
        let d_attach = attach_tick.clone();

        DISPATCH_FN.with(|f| {
            *f.borrow_mut() = Some(Box::new(move || {
                let mut s = d_state.borrow_mut();
                let mut dirty = false;

                if let Ok(rx_guard) = d_rx.try_borrow() {
                    while let Ok(msg) = rx_guard.try_recv() {
                        process_message(&mut s, msg);
                        dirty = true;
                    }
                }

                if dirty {
                    d_da.queue_draw();
                    if !s.is_animating {
                        s.is_animating = true;
                        d_attach();
                    }
                }
            }));
        });

        window.present();
        if let Some(surface) = window.surface() {
            let empty_region = cairo::Region::create();
            surface.set_input_region(&empty_region);
        }
    });

    app.run();
}

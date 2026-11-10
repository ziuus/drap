use cairo::{Context, Format, ImageSurface, RadialGradient};
use std::collections::HashMap;

pub struct Luts {
    pub luts: HashMap<String, ImageSurface>,
    pub surge_luts: HashMap<String, ImageSurface>,
}

impl Luts {
    pub fn new() -> Self {
        let mut luts = HashMap::new();
        let mut surge_luts = HashMap::new();
        let lut_w = 512;
        let lut_h = 1024;
        let cx = lut_w as f64;
        let cy = (lut_h / 2) as f64;
        let max_r = lut_w as f64;

        let themes = ["aurora", "heavenly", "plasma", "solar", "liquid"];

        for &theme in &themes {
            // 1. Edge Bulb LUT — Translucent, Luminous Atmospheric Meniscus
            let surf = ImageSurface::create(Format::ARgb32, lut_w, lut_h)
                .expect("Failed to create Cairo ImageSurface");
            let cr = Context::new(&surf).expect("Failed to create Cairo context");

            let pat = RadialGradient::new(cx, cy, 0.0, cx, cy, max_r);

            match theme {
                "aurora" => {
                    // Hyper-luminous Drooop Cosmic Aurora:
                    // Hot diamond-gold focus -> vivid fluorescent rose -> electric magenta -> deep ultraviolet -> laser cyan -> sapphire
                    pat.add_color_stop_rgba(0.00, 1.00, 0.96, 0.75, 0.88);
                    pat.add_color_stop_rgba(0.08, 1.00, 0.48, 0.78, 0.78);
                    pat.add_color_stop_rgba(0.22, 0.92, 0.20, 0.95, 0.62);
                    pat.add_color_stop_rgba(0.42, 0.42, 0.22, 0.98, 0.45);
                    pat.add_color_stop_rgba(0.65, 0.08, 0.88, 0.98, 0.28);
                    pat.add_color_stop_rgba(0.85, 0.12, 0.40, 0.95, 0.10);
                    pat.add_color_stop_rgba(1.00, 0.00, 0.00, 0.00, 0.00);
                }
                "plasma" => {
                    pat.add_color_stop_rgba(0.00, 0.98, 1.00, 1.00, 0.88);
                    pat.add_color_stop_rgba(0.10, 0.95, 0.25, 0.95, 0.75);
                    pat.add_color_stop_rgba(0.26, 0.75, 0.12, 0.98, 0.58);
                    pat.add_color_stop_rgba(0.50, 0.30, 0.18, 0.95, 0.38);
                    pat.add_color_stop_rgba(0.75, 0.08, 0.85, 0.98, 0.18);
                    pat.add_color_stop_rgba(1.00, 0.00, 0.00, 0.00, 0.00);
                }
                "solar" => {
                    pat.add_color_stop_rgba(0.00, 1.00, 1.00, 0.88, 0.90);
                    pat.add_color_stop_rgba(0.10, 1.00, 0.82, 0.25, 0.78);
                    pat.add_color_stop_rgba(0.26, 0.98, 0.42, 0.10, 0.60);
                    pat.add_color_stop_rgba(0.50, 0.92, 0.15, 0.12, 0.38);
                    pat.add_color_stop_rgba(0.75, 0.70, 0.06, 0.20, 0.18);
                    pat.add_color_stop_rgba(1.00, 0.00, 0.00, 0.00, 0.00);
                }
                "liquid" => {
                    pat.add_color_stop_rgba(0.00, 0.92, 1.00, 1.00, 0.88);
                    pat.add_color_stop_rgba(0.10, 0.20, 0.95, 0.88, 0.75);
                    pat.add_color_stop_rgba(0.28, 0.10, 0.75, 0.98, 0.58);
                    pat.add_color_stop_rgba(0.52, 0.10, 0.48, 0.95, 0.38);
                    pat.add_color_stop_rgba(0.75, 0.06, 0.25, 0.85, 0.18);
                    pat.add_color_stop_rgba(1.00, 0.00, 0.00, 0.00, 0.00);
                }
                _ => {
                    // "heavenly" — Prismatic Iridescent Opal
                    pat.add_color_stop_rgba(0.00, 1.00, 1.00, 1.00, 0.88);
                    pat.add_color_stop_rgba(0.10, 1.00, 0.95, 0.80, 0.75);
                    pat.add_color_stop_rgba(0.25, 0.96, 0.70, 0.95, 0.58);
                    pat.add_color_stop_rgba(0.50, 0.60, 0.65, 0.98, 0.38);
                    pat.add_color_stop_rgba(0.75, 0.30, 0.90, 0.98, 0.18);
                    pat.add_color_stop_rgba(1.00, 0.00, 0.00, 0.00, 0.00);
                }
            }
            cr.set_source(&pat).expect("Failed to set pattern");
            cr.paint().expect("Failed to paint pattern");
            luts.insert(theme.to_string(), surf);

            // 2. Pre-baked Full-Screen Surge Texture — Drop Bloom
            let s_surf = ImageSurface::create(Format::ARgb32, lut_w, lut_h)
                .expect("Failed to create Cairo ImageSurface");
            let s_cr = Context::new(&s_surf).expect("Failed to create Cairo context");
            let s_pat = RadialGradient::new(cx, cy, 0.0, cx, cy, max_r);

            match theme {
                "aurora" => {
                    s_pat.add_color_stop_rgba(0.00, 1.00, 0.96, 0.85, 0.85);
                    s_pat.add_color_stop_rgba(0.12, 1.00, 0.40, 0.70, 0.70);
                    s_pat.add_color_stop_rgba(0.30, 0.85, 0.18, 0.92, 0.52);
                    s_pat.add_color_stop_rgba(0.52, 0.35, 0.25, 0.98, 0.32);
                    s_pat.add_color_stop_rgba(0.72, 0.08, 0.80, 0.98, 0.16);
                    s_pat.add_color_stop_rgba(0.90, 0.10, 0.35, 0.85, 0.04);
                    s_pat.add_color_stop_rgba(1.00, 0.00, 0.00, 0.00, 0.00);
                }
                "plasma" => {
                    s_pat.add_color_stop_rgba(0.00, 1.00, 1.00, 1.00, 0.85);
                    s_pat.add_color_stop_rgba(0.14, 0.35, 0.95, 1.00, 0.70);
                    s_pat.add_color_stop_rgba(0.32, 0.95, 0.18, 0.95, 0.52);
                    s_pat.add_color_stop_rgba(0.55, 0.55, 0.12, 0.98, 0.30);
                    s_pat.add_color_stop_rgba(0.78, 0.10, 0.65, 0.98, 0.14);
                    s_pat.add_color_stop_rgba(1.00, 0.00, 0.00, 0.00, 0.00);
                }
                "solar" => {
                    s_pat.add_color_stop_rgba(0.00, 1.00, 1.00, 0.90, 0.85);
                    s_pat.add_color_stop_rgba(0.14, 1.00, 0.80, 0.25, 0.70);
                    s_pat.add_color_stop_rgba(0.32, 1.00, 0.45, 0.08, 0.52);
                    s_pat.add_color_stop_rgba(0.56, 0.90, 0.18, 0.08, 0.30);
                    s_pat.add_color_stop_rgba(0.78, 0.70, 0.08, 0.15, 0.14);
                    s_pat.add_color_stop_rgba(1.00, 0.00, 0.00, 0.00, 0.00);
                }
                "liquid" => {
                    s_pat.add_color_stop_rgba(0.00, 1.00, 1.00, 1.00, 0.85);
                    s_pat.add_color_stop_rgba(0.14, 0.35, 1.00, 0.95, 0.70);
                    s_pat.add_color_stop_rgba(0.32, 0.08, 0.85, 0.90, 0.52);
                    s_pat.add_color_stop_rgba(0.56, 0.08, 0.55, 0.95, 0.30);
                    s_pat.add_color_stop_rgba(0.78, 0.05, 0.30, 0.85, 0.14);
                    s_pat.add_color_stop_rgba(1.00, 0.00, 0.00, 0.00, 0.00);
                }
                _ => {
                    s_pat.add_color_stop_rgba(0.00, 1.00, 1.00, 1.00, 0.85);
                    s_pat.add_color_stop_rgba(0.14, 1.00, 0.92, 0.75, 0.70);
                    s_pat.add_color_stop_rgba(0.32, 0.95, 0.60, 0.90, 0.52);
                    s_pat.add_color_stop_rgba(0.55, 0.55, 0.60, 0.98, 0.30);
                    s_pat.add_color_stop_rgba(0.78, 0.25, 0.85, 0.98, 0.14);
                    s_pat.add_color_stop_rgba(1.00, 0.00, 0.00, 0.00, 0.00);
                }
            }
            s_cr.set_source(&s_pat).expect("Failed to set pattern");
            s_cr.paint().expect("Failed to paint pattern");
            surge_luts.insert(theme.to_string(), s_surf);
        }

        Self { luts, surge_luts }
    }
}

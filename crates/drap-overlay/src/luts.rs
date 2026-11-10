use cairo::{Context, Format, ImageSurface, RadialGradient};
use std::collections::HashMap;

pub struct Luts {
    #[allow(dead_code)]
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
                    // Exact Drooop Chromatic Dispersion matching Tornike Demo Photo:
                    // Massive incandescent white core -> warm golden peach -> coral rose -> lilac violet -> luminous sky cyan mist
                    pat.add_color_stop_rgba(0.00, 1.00, 1.00, 1.00, 1.00);
                    pat.add_color_stop_rgba(0.50, 1.00, 1.00, 1.00, 0.98);
                    pat.add_color_stop_rgba(0.62, 1.00, 0.94, 0.72, 0.92);
                    pat.add_color_stop_rgba(0.72, 1.00, 0.65, 0.75, 0.82);
                    pat.add_color_stop_rgba(0.82, 0.82, 0.62, 0.98, 0.58);
                    pat.add_color_stop_rgba(0.90, 0.38, 0.82, 1.00, 0.30);
                    pat.add_color_stop_rgba(0.96, 0.15, 0.60, 0.90, 0.10);
                    pat.add_color_stop_rgba(1.00, 0.00, 0.00, 0.00, 0.00);
                }
                "heavenly" => {
                    // Drooop Heavenly Pure Incandescent White Bloom & Pearlescent Celestial Aura
                    pat.add_color_stop_rgba(0.00, 1.00, 1.00, 1.00, 1.00);
                    pat.add_color_stop_rgba(0.35, 1.00, 1.00, 1.00, 0.99);
                    pat.add_color_stop_rgba(0.55, 0.98, 0.99, 1.00, 0.88);
                    pat.add_color_stop_rgba(0.72, 0.94, 0.97, 1.00, 0.60);
                    pat.add_color_stop_rgba(0.88, 0.82, 0.90, 1.00, 0.25);
                    pat.add_color_stop_rgba(1.00, 0.00, 0.00, 0.00, 0.00);
                }
                "plasma" => {
                    pat.add_color_stop_rgba(0.00, 1.00, 1.00, 1.00, 0.98);
                    pat.add_color_stop_rgba(0.20, 0.95, 0.40, 1.00, 0.85);
                    pat.add_color_stop_rgba(0.45, 0.75, 0.25, 0.98, 0.62);
                    pat.add_color_stop_rgba(0.70, 0.45, 0.15, 0.88, 0.35);
                    pat.add_color_stop_rgba(0.88, 0.22, 0.08, 0.60, 0.14);
                    pat.add_color_stop_rgba(1.00, 0.00, 0.00, 0.00, 0.00);
                }
                "solar" => {
                    pat.add_color_stop_rgba(0.00, 1.00, 0.99, 0.94, 0.98);
                    pat.add_color_stop_rgba(0.22, 1.00, 0.82, 0.35, 0.85);
                    pat.add_color_stop_rgba(0.48, 0.98, 0.55, 0.20, 0.60);
                    pat.add_color_stop_rgba(0.72, 0.90, 0.35, 0.15, 0.32);
                    pat.add_color_stop_rgba(0.88, 0.75, 0.18, 0.08, 0.12);
                    pat.add_color_stop_rgba(1.00, 0.00, 0.00, 0.00, 0.00);
                }
                _ => {
                    // "liquid"
                    pat.add_color_stop_rgba(0.00, 1.00, 1.00, 1.00, 1.00);
                    pat.add_color_stop_rgba(0.25, 0.96, 1.00, 1.00, 0.95);
                    pat.add_color_stop_rgba(0.50, 0.35, 0.95, 0.98, 0.75);
                    pat.add_color_stop_rgba(0.72, 0.15, 0.80, 0.92, 0.45);
                    pat.add_color_stop_rgba(0.88, 0.08, 0.55, 0.78, 0.18);
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

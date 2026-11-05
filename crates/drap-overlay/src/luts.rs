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

        let themes = ["aurora", "plasma", "solar", "liquid"];

        for &theme in &themes {
            // 1. Edge Bulb LUT
            let surf = ImageSurface::create(Format::ARgb32, lut_w, lut_h)
                .expect("Failed to create Cairo ImageSurface");
            let cr = Context::new(&surf).expect("Failed to create Cairo context");
            let pat = RadialGradient::new(cx, cy, 0.0, cx, cy, max_r);

            match theme {
                "plasma" => {
                    pat.add_color_stop_rgba(0.00, 1.00, 1.00, 1.00, 0.95);
                    pat.add_color_stop_rgba(0.12, 0.95, 0.40, 1.00, 0.80);
                    pat.add_color_stop_rgba(0.28, 0.75, 0.25, 0.98, 0.60);
                    pat.add_color_stop_rgba(0.50, 0.45, 0.15, 0.88, 0.32);
                    pat.add_color_stop_rgba(0.75, 0.22, 0.08, 0.60, 0.12);
                    pat.add_color_stop_rgba(0.92, 0.10, 0.04, 0.35, 0.02);
                    pat.add_color_stop_rgba(1.00, 0.00, 0.00, 0.00, 0.00);
                }
                "solar" => {
                    pat.add_color_stop_rgba(0.00, 1.00, 0.99, 0.94, 0.95);
                    pat.add_color_stop_rgba(0.14, 1.00, 0.82, 0.35, 0.82);
                    pat.add_color_stop_rgba(0.32, 0.98, 0.55, 0.20, 0.58);
                    pat.add_color_stop_rgba(0.55, 0.90, 0.35, 0.15, 0.30);
                    pat.add_color_stop_rgba(0.78, 0.75, 0.18, 0.08, 0.10);
                    pat.add_color_stop_rgba(0.92, 0.50, 0.10, 0.04, 0.02);
                    pat.add_color_stop_rgba(1.00, 0.00, 0.00, 0.00, 0.00);
                }
                "liquid" => {
                    pat.add_color_stop_rgba(0.00, 1.00, 1.00, 1.00, 1.00);
                    pat.add_color_stop_rgba(0.18, 0.96, 1.00, 1.00, 0.95);
                    pat.add_color_stop_rgba(0.35, 0.35, 0.95, 0.98, 0.75);
                    pat.add_color_stop_rgba(0.55, 0.15, 0.80, 0.92, 0.48);
                    pat.add_color_stop_rgba(0.75, 0.08, 0.55, 0.78, 0.22);
                    pat.add_color_stop_rgba(0.90, 0.03, 0.30, 0.50, 0.06);
                    pat.add_color_stop_rgba(1.00, 0.00, 0.00, 0.00, 0.00);
                }
                _ => { // "aurora"
                    pat.add_color_stop_rgba(0.00, 1.00, 1.00, 1.00, 1.00);
                    pat.add_color_stop_rgba(0.58, 1.00, 1.00, 1.00, 0.99);
                    pat.add_color_stop_rgba(0.66, 1.00, 0.94, 0.72, 0.96);
                    pat.add_color_stop_rgba(0.74, 1.00, 0.65, 0.75, 0.88);
                    pat.add_color_stop_rgba(0.82, 0.82, 0.62, 0.98, 0.65);
                    pat.add_color_stop_rgba(0.90, 0.38, 0.82, 1.00, 0.35);
                    pat.add_color_stop_rgba(0.96, 0.15, 0.60, 0.90, 0.12);
                    pat.add_color_stop_rgba(1.00, 0.00, 0.00, 0.00, 0.00);
                }
            }
            cr.set_source(&pat).expect("Failed to set pattern");
            cr.paint().expect("Failed to paint pattern");
            luts.insert(theme.to_string(), surf);

            // 2. Pre-baked Full-Screen Surge Texture
            let s_surf = ImageSurface::create(Format::ARgb32, lut_w, lut_h)
                .expect("Failed to create Cairo ImageSurface");
            let s_cr = Context::new(&s_surf).expect("Failed to create Cairo context");
            let s_pat = RadialGradient::new(cx, cy, 0.0, cx, cy, max_r);

            match theme {
                "plasma" => {
                    s_pat.add_color_stop_rgba(0.00, 1.00, 1.00, 1.00, 1.00);
                    s_pat.add_color_stop_rgba(0.08, 1.00, 0.90, 1.00, 0.95);
                    s_pat.add_color_stop_rgba(0.22, 0.92, 0.45, 1.00, 0.82);
                    s_pat.add_color_stop_rgba(0.45, 0.70, 0.22, 0.95, 0.58);
                    s_pat.add_color_stop_rgba(0.70, 0.40, 0.12, 0.75, 0.32);
                    s_pat.add_color_stop_rgba(0.90, 0.20, 0.05, 0.45, 0.12);
                    s_pat.add_color_stop_rgba(1.00, 0.00, 0.00, 0.00, 0.00);
                }
                "solar" => {
                    s_pat.add_color_stop_rgba(0.00, 1.00, 1.00, 1.00, 1.00);
                    s_pat.add_color_stop_rgba(0.10, 1.00, 0.95, 0.85, 0.95);
                    s_pat.add_color_stop_rgba(0.28, 1.00, 0.70, 0.25, 0.85);
                    s_pat.add_color_stop_rgba(0.50, 0.98, 0.45, 0.12, 0.55);
                    s_pat.add_color_stop_rgba(0.75, 0.80, 0.25, 0.06, 0.28);
                    s_pat.add_color_stop_rgba(0.92, 0.45, 0.10, 0.02, 0.10);
                    s_pat.add_color_stop_rgba(1.00, 0.00, 0.00, 0.00, 0.00);
                }
                "liquid" => {
                    s_pat.add_color_stop_rgba(0.00, 1.00, 1.00, 1.00, 1.00);
                    s_pat.add_color_stop_rgba(0.12, 0.90, 1.00, 1.00, 0.95);
                    s_pat.add_color_stop_rgba(0.30, 0.35, 0.95, 0.98, 0.80);
                    s_pat.add_color_stop_rgba(0.55, 0.15, 0.75, 0.90, 0.50);
                    s_pat.add_color_stop_rgba(0.78, 0.06, 0.45, 0.70, 0.25);
                    s_pat.add_color_stop_rgba(0.92, 0.02, 0.25, 0.45, 0.08);
                    s_pat.add_color_stop_rgba(1.00, 0.00, 0.00, 0.00, 0.00);
                }
                _ => { // "aurora"
                    s_pat.add_color_stop_rgba(0.00, 1.00, 1.00, 1.00, 1.00);
                    s_pat.add_color_stop_rgba(0.20, 1.00, 0.98, 0.92, 0.98);
                    s_pat.add_color_stop_rgba(0.40, 1.00, 0.88, 0.70, 0.88);
                    s_pat.add_color_stop_rgba(0.60, 1.00, 0.60, 0.78, 0.72);
                    s_pat.add_color_stop_rgba(0.78, 0.75, 0.55, 0.98, 0.52);
                    s_pat.add_color_stop_rgba(0.90, 0.25, 0.70, 0.98, 0.28);
                    s_pat.add_color_stop_rgba(0.97, 0.10, 0.40, 0.75, 0.10);
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

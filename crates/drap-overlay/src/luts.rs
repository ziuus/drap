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
                    // Refined cosmic chromatic aura with luminous translucent falloff:
                    pat.add_color_stop_rgba(0.00, 1.00, 0.94, 0.55, 0.68); // Incandescent golden focus
                    pat.add_color_stop_rgba(0.08, 1.00, 0.35, 0.65, 0.54); // Coral-rose
                    pat.add_color_stop_rgba(0.20, 0.92, 0.15, 0.92, 0.40); // Neon magenta
                    pat.add_color_stop_rgba(0.38, 0.45, 0.18, 0.98, 0.26); // Electric violet
                    pat.add_color_stop_rgba(0.60, 0.06, 0.82, 0.98, 0.14); // Laser cyan
                    pat.add_color_stop_rgba(0.82, 0.12, 0.35, 0.92, 0.04); // Deep sapphire edge
                    pat.add_color_stop_rgba(1.00, 0.00, 0.00, 0.00, 0.00);
                }
                "plasma" => {
                    pat.add_color_stop_rgba(0.00, 0.98, 1.00, 1.00, 0.70); // Electric cyan focus
                    pat.add_color_stop_rgba(0.10, 0.95, 0.20, 0.95, 0.52); // Neon fuchsia
                    pat.add_color_stop_rgba(0.26, 0.72, 0.10, 0.98, 0.38); // Deep violet
                    pat.add_color_stop_rgba(0.50, 0.25, 0.15, 0.95, 0.20); // Ultraviolet
                    pat.add_color_stop_rgba(0.75, 0.08, 0.75, 0.98, 0.08); // Electric blue
                    pat.add_color_stop_rgba(1.00, 0.00, 0.00, 0.00, 0.00);
                }
                "solar" => {
                    pat.add_color_stop_rgba(0.00, 1.00, 1.00, 0.85, 0.70); // Blazing solar focus
                    pat.add_color_stop_rgba(0.10, 1.00, 0.80, 0.20, 0.54); // Golden amber
                    pat.add_color_stop_rgba(0.26, 0.98, 0.38, 0.08, 0.38); // Vermillion orange
                    pat.add_color_stop_rgba(0.50, 0.90, 0.12, 0.12, 0.22); // Solar ruby
                    pat.add_color_stop_rgba(0.75, 0.65, 0.05, 0.18, 0.08); // Crimson dusk
                    pat.add_color_stop_rgba(1.00, 0.00, 0.00, 0.00, 0.00);
                }
                "liquid" => {
                    pat.add_color_stop_rgba(0.00, 0.90, 1.00, 1.00, 0.70); // Caribbean aqua focus
                    pat.add_color_stop_rgba(0.10, 0.15, 0.92, 0.85, 0.52); // Emerald teal
                    pat.add_color_stop_rgba(0.28, 0.08, 0.68, 0.95, 0.38); // Tropical cerulean
                    pat.add_color_stop_rgba(0.52, 0.08, 0.42, 0.92, 0.20); // Deep azure
                    pat.add_color_stop_rgba(0.75, 0.05, 0.20, 0.75, 0.08); // Marine sapphire
                    pat.add_color_stop_rgba(1.00, 0.00, 0.00, 0.00, 0.00);
                }
                _ => {
                    // "heavenly" — Prismatic Iridescent Opal
                    pat.add_color_stop_rgba(0.00, 1.00, 1.00, 1.00, 0.68); // Diamond white
                    pat.add_color_stop_rgba(0.10, 1.00, 0.92, 0.75, 0.52); // Champagne gold
                    pat.add_color_stop_rgba(0.25, 0.95, 0.65, 0.92, 0.36); // Lavender rose
                    pat.add_color_stop_rgba(0.50, 0.55, 0.60, 0.98, 0.20); // Celestial violet
                    pat.add_color_stop_rgba(0.75, 0.25, 0.85, 0.98, 0.08); // Cyan sheen
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

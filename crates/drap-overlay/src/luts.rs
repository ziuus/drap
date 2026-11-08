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

        let themes = ["heavenly", "aurora", "plasma", "solar", "liquid"];

        for &theme in &themes {
            // 1. Edge Bulb LUT — High Luminance Chromatic Aura matching Drooop
            let surf = ImageSurface::create(Format::ARgb32, lut_w, lut_h)
                .expect("Failed to create Cairo ImageSurface");
            let cr = Context::new(&surf).expect("Failed to create Cairo context");

            let wash = RadialGradient::new(cx, cy, 0.0, cx, cy, max_r);
            match theme {
                "heavenly" => {
                    // Pure celestial white atmospheric wash
                    wash.add_color_stop_rgba(0.00, 1.00, 1.00, 1.00, 0.58);
                    wash.add_color_stop_rgba(0.28, 0.98, 0.99, 1.00, 0.38);
                    wash.add_color_stop_rgba(0.60, 0.95, 0.98, 1.00, 0.18);
                    wash.add_color_stop_rgba(0.85, 0.90, 0.95, 1.00, 0.06);
                    wash.add_color_stop_rgba(1.00, 0.00, 0.00, 0.00, 0.00);
                }
                "plasma" => {
                    wash.add_color_stop_rgba(0.00, 0.95, 0.35, 0.95, 0.45);
                    wash.add_color_stop_rgba(0.35, 0.55, 0.20, 0.88, 0.25);
                    wash.add_color_stop_rgba(0.70, 0.25, 0.10, 0.50, 0.10);
                    wash.add_color_stop_rgba(1.00, 0.00, 0.00, 0.00, 0.00);
                }
                "solar" => {
                    wash.add_color_stop_rgba(0.00, 1.00, 0.85, 0.30, 0.45);
                    wash.add_color_stop_rgba(0.35, 0.98, 0.45, 0.15, 0.25);
                    wash.add_color_stop_rgba(0.70, 0.60, 0.15, 0.05, 0.10);
                    wash.add_color_stop_rgba(1.00, 0.00, 0.00, 0.00, 0.00);
                }
                _ => { // aurora / liquid
                    wash.add_color_stop_rgba(0.00, 0.30, 0.92, 1.00, 0.48);
                    wash.add_color_stop_rgba(0.35, 0.55, 0.35, 0.95, 0.26);
                    wash.add_color_stop_rgba(0.70, 0.05, 0.45, 0.70, 0.11);
                    wash.add_color_stop_rgba(1.00, 0.00, 0.00, 0.00, 0.00);
                }
            }
            let _ = cr.set_source(&wash);
            let _ = cr.paint();

            let pat = RadialGradient::new(cx, cy, 0.0, cx, cy, max_r * 0.90);

            match theme {
                "heavenly" => {
                    // Drooop Heavenly Pure Incandescent White Bloom & Pearlescent Celestial Aura
                    pat.add_color_stop_rgba(0.00, 1.00, 1.00, 1.00, 1.00); // Pure celestial specular core
                    pat.add_color_stop_rgba(0.18, 1.00, 1.00, 1.00, 1.00); // Sustained intense white brilliance
                    pat.add_color_stop_rgba(0.38, 0.99, 0.99, 1.00, 0.96); // Luminous heavenly pearl white
                    pat.add_color_stop_rgba(0.58, 0.96, 0.98, 1.00, 0.84); // Soft celestial glow
                    pat.add_color_stop_rgba(0.75, 0.92, 0.96, 1.00, 0.58); // Translucent heavenly white mist
                    pat.add_color_stop_rgba(0.88, 0.86, 0.93, 1.00, 0.26); // Outer feather
                    pat.add_color_stop_rgba(0.96, 0.82, 0.88, 1.00, 0.08); // Seamless dissolving edge
                    pat.add_color_stop_rgba(1.00, 0.00, 0.00, 0.00, 0.00);
                }
                "plasma" => {
                    // Cyberpunk Neon Violet / Electric Cyan
                    pat.add_color_stop_rgba(0.00, 1.00, 1.00, 1.00, 1.00);
                    pat.add_color_stop_rgba(0.10, 0.90, 0.95, 1.00, 1.00);
                    pat.add_color_stop_rgba(0.22, 0.40, 0.95, 1.00, 0.98);
                    pat.add_color_stop_rgba(0.40, 0.95, 0.30, 0.98, 0.92);
                    pat.add_color_stop_rgba(0.60, 0.65, 0.15, 0.95, 0.82);
                    pat.add_color_stop_rgba(0.78, 0.20, 0.35, 0.95, 0.60);
                    pat.add_color_stop_rgba(0.92, 0.08, 0.15, 0.70, 0.28);
                    pat.add_color_stop_rgba(1.00, 0.00, 0.00, 0.00, 0.00);
                }
                "solar" => {
                    // Radiant Sunset Gold / Amber / Dusk Crimson
                    pat.add_color_stop_rgba(0.00, 1.00, 1.00, 1.00, 1.00);
                    pat.add_color_stop_rgba(0.10, 1.00, 0.96, 0.85, 1.00);
                    pat.add_color_stop_rgba(0.25, 1.00, 0.82, 0.20, 0.98);
                    pat.add_color_stop_rgba(0.45, 0.98, 0.45, 0.08, 0.92);
                    pat.add_color_stop_rgba(0.65, 0.92, 0.20, 0.12, 0.80);
                    pat.add_color_stop_rgba(0.82, 0.70, 0.08, 0.25, 0.55);
                    pat.add_color_stop_rgba(0.94, 0.40, 0.04, 0.15, 0.25);
                    pat.add_color_stop_rgba(1.00, 0.00, 0.00, 0.00, 0.00);
                }
                "liquid" => {
                    // Pristine Arctic Glacier / Pearlescent Ocean Turquoise
                    pat.add_color_stop_rgba(0.00, 1.00, 1.00, 1.00, 1.00);
                    pat.add_color_stop_rgba(0.12, 0.85, 1.00, 1.00, 1.00);
                    pat.add_color_stop_rgba(0.28, 0.20, 0.95, 0.90, 0.98);
                    pat.add_color_stop_rgba(0.48, 0.08, 0.75, 0.92, 0.90);
                    pat.add_color_stop_rgba(0.68, 0.05, 0.48, 0.85, 0.75);
                    pat.add_color_stop_rgba(0.84, 0.02, 0.25, 0.65, 0.48);
                    pat.add_color_stop_rgba(0.94, 0.01, 0.12, 0.45, 0.22);
                    pat.add_color_stop_rgba(1.00, 0.00, 0.00, 0.00, 0.00);
                }
                _ => { // "aurora" — Tornike Drooop chromatic dispersion: incandescent white -> peach gold -> coral rose -> neon violet -> turquoise -> azure
                    pat.add_color_stop_rgba(0.00, 1.00, 1.00, 1.00, 1.00);
                    pat.add_color_stop_rgba(0.08, 0.98, 0.95, 0.88, 1.00);
                    pat.add_color_stop_rgba(0.18, 0.98, 0.80, 0.35, 0.98);
                    pat.add_color_stop_rgba(0.32, 0.95, 0.38, 0.58, 0.95);
                    pat.add_color_stop_rgba(0.48, 0.74, 0.48, 0.86, 0.90);
                    pat.add_color_stop_rgba(0.65, 0.52, 0.82, 0.82, 0.82);
                    pat.add_color_stop_rgba(0.80, 0.35, 0.65, 0.95, 0.60);
                    pat.add_color_stop_rgba(0.92, 0.18, 0.40, 0.85, 0.30);
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
                "heavenly" => {
                    // Drooop Heavenly White Atmospheric Full-Screen Surge Wave
                    s_pat.add_color_stop_rgba(0.00, 1.00, 1.00, 1.00, 1.00); // Blinding white burst
                    s_pat.add_color_stop_rgba(0.20, 1.00, 1.00, 1.00, 0.98); // Sustained pure white core
                    s_pat.add_color_stop_rgba(0.42, 0.98, 0.99, 1.00, 0.88); // Heavenly pearl bloom
                    s_pat.add_color_stop_rgba(0.68, 0.94, 0.97, 1.00, 0.60); // Ethereal atmospheric wash
                    s_pat.add_color_stop_rgba(0.86, 0.88, 0.94, 1.00, 0.26); // Soft dissolving sky veil
                    s_pat.add_color_stop_rgba(0.96, 0.84, 0.90, 1.00, 0.08);
                    s_pat.add_color_stop_rgba(1.00, 0.00, 0.00, 0.00, 0.00);
                }
                "plasma" => {
                    s_pat.add_color_stop_rgba(0.00, 1.00, 1.00, 1.00, 1.00);
                    s_pat.add_color_stop_rgba(0.12, 0.80, 0.95, 1.00, 0.98);
                    s_pat.add_color_stop_rgba(0.28, 0.95, 0.35, 0.98, 0.92);
                    s_pat.add_color_stop_rgba(0.50, 0.65, 0.18, 0.95, 0.75);
                    s_pat.add_color_stop_rgba(0.72, 0.25, 0.35, 0.90, 0.52);
                    s_pat.add_color_stop_rgba(0.90, 0.10, 0.18, 0.65, 0.22);
                    s_pat.add_color_stop_rgba(1.00, 0.00, 0.00, 0.00, 0.00);
                }
                "solar" => {
                    s_pat.add_color_stop_rgba(0.00, 1.00, 1.00, 1.00, 1.00);
                    s_pat.add_color_stop_rgba(0.12, 1.00, 0.92, 0.75, 0.98);
                    s_pat.add_color_stop_rgba(0.28, 1.00, 0.75, 0.18, 0.92);
                    s_pat.add_color_stop_rgba(0.52, 0.95, 0.40, 0.08, 0.75);
                    s_pat.add_color_stop_rgba(0.75, 0.85, 0.18, 0.12, 0.50);
                    s_pat.add_color_stop_rgba(0.92, 0.45, 0.06, 0.10, 0.20);
                    s_pat.add_color_stop_rgba(1.00, 0.00, 0.00, 0.00, 0.00);
                }
                "liquid" => {
                    s_pat.add_color_stop_rgba(0.00, 1.00, 1.00, 1.00, 1.00);
                    s_pat.add_color_stop_rgba(0.14, 0.80, 1.00, 1.00, 0.98);
                    s_pat.add_color_stop_rgba(0.32, 0.18, 0.90, 0.92, 0.90);
                    s_pat.add_color_stop_rgba(0.55, 0.08, 0.65, 0.90, 0.70);
                    s_pat.add_color_stop_rgba(0.76, 0.04, 0.40, 0.80, 0.45);
                    s_pat.add_color_stop_rgba(0.92, 0.02, 0.20, 0.55, 0.18);
                    s_pat.add_color_stop_rgba(1.00, 0.00, 0.00, 0.00, 0.00);
                }
                _ => { // "aurora" — Full-Screen Radiance Wave on Drop
                    s_pat.add_color_stop_rgba(0.00, 1.00, 1.00, 1.00, 1.00);
                    s_pat.add_color_stop_rgba(0.12, 1.00, 0.95, 0.85, 0.98);
                    s_pat.add_color_stop_rgba(0.28, 1.00, 0.78, 0.35, 0.95);
                    s_pat.add_color_stop_rgba(0.45, 0.98, 0.45, 0.65, 0.88);
                    s_pat.add_color_stop_rgba(0.62, 0.75, 0.48, 0.92, 0.75);
                    s_pat.add_color_stop_rgba(0.78, 0.35, 0.80, 0.98, 0.55);
                    s_pat.add_color_stop_rgba(0.90, 0.15, 0.50, 0.90, 0.30);
                    s_pat.add_color_stop_rgba(0.97, 0.05, 0.25, 0.70, 0.12);
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

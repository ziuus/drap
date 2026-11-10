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
            // 1. Edge Bulb LUT — High Luminance Chromatic Aura with Rich Color Saturation
            let surf = ImageSurface::create(Format::ARgb32, lut_w, lut_h)
                .expect("Failed to create Cairo ImageSurface");
            let cr = Context::new(&surf).expect("Failed to create Cairo context");

            let wash = RadialGradient::new(cx, cy, 0.0, cx, cy, max_r);
            match theme {
                "aurora" => {
                    // Deep cosmic chromatic wash: violet -> neon magenta -> cyan -> deep indigo
                    wash.add_color_stop_rgba(0.00, 0.58, 0.20, 0.95, 0.55);
                    wash.add_color_stop_rgba(0.25, 0.92, 0.15, 0.65, 0.42);
                    wash.add_color_stop_rgba(0.55, 0.05, 0.75, 0.95, 0.26);
                    wash.add_color_stop_rgba(0.80, 0.10, 0.30, 0.85, 0.12);
                    wash.add_color_stop_rgba(1.00, 0.00, 0.00, 0.00, 0.00);
                }
                "plasma" => {
                    // Cyberpunk high-voltage electric neon wash
                    wash.add_color_stop_rgba(0.00, 0.95, 0.15, 0.85, 0.55);
                    wash.add_color_stop_rgba(0.32, 0.55, 0.10, 0.95, 0.38);
                    wash.add_color_stop_rgba(0.65, 0.05, 0.85, 0.98, 0.20);
                    wash.add_color_stop_rgba(1.00, 0.00, 0.00, 0.00, 0.00);
                }
                "solar" => {
                    // Thermonuclear solar flare wash: gold -> vermillion -> ruby crimson
                    wash.add_color_stop_rgba(0.00, 1.00, 0.70, 0.15, 0.55);
                    wash.add_color_stop_rgba(0.30, 0.98, 0.32, 0.08, 0.38);
                    wash.add_color_stop_rgba(0.65, 0.75, 0.08, 0.15, 0.18);
                    wash.add_color_stop_rgba(1.00, 0.00, 0.00, 0.00, 0.00);
                }
                "liquid" => {
                    // Bioluminescent oceanic wash: tropical aqua -> emerald teal -> deep sapphire
                    wash.add_color_stop_rgba(0.00, 0.05, 0.95, 0.85, 0.52);
                    wash.add_color_stop_rgba(0.30, 0.08, 0.72, 0.95, 0.36);
                    wash.add_color_stop_rgba(0.65, 0.12, 0.35, 0.85, 0.18);
                    wash.add_color_stop_rgba(1.00, 0.00, 0.00, 0.00, 0.00);
                }
                _ => {
                    // "heavenly" — Prismatic Iridescent Opal (not flat white!)
                    wash.add_color_stop_rgba(0.00, 0.85, 0.90, 1.00, 0.52);
                    wash.add_color_stop_rgba(0.28, 0.75, 0.45, 0.95, 0.34);
                    wash.add_color_stop_rgba(0.60, 0.25, 0.80, 0.98, 0.18);
                    wash.add_color_stop_rgba(0.85, 0.60, 0.40, 0.90, 0.08);
                    wash.add_color_stop_rgba(1.00, 0.00, 0.00, 0.00, 0.00);
                }
            }
            let _ = cr.set_source(&wash);
            let _ = cr.paint();

            let pat = RadialGradient::new(cx, cy, 0.0, cx, cy, max_r * 0.92);

            match theme {
                "aurora" => {
                    // Iconic Tornike Drooop Chromatic Dispersion Burst:
                    // Hot diamond focus -> sunlit peach-gold -> vivid neon coral-rose -> electric magenta -> deep electric violet -> laser cyan -> azure sapphire
                    pat.add_color_stop_rgba(0.00, 1.00, 0.98, 0.95, 1.00); // Specular focus point
                    pat.add_color_stop_rgba(0.06, 1.00, 0.82, 0.32, 1.00); // Blazing sunlit peach-amber gold
                    pat.add_color_stop_rgba(0.15, 1.00, 0.30, 0.60, 0.98); // Vivid fluorescent coral-rose
                    pat.add_color_stop_rgba(0.28, 0.92, 0.12, 0.88, 0.96); // Electric neon magenta
                    pat.add_color_stop_rgba(0.44, 0.58, 0.18, 0.98, 0.92); // Deep electric violet
                    pat.add_color_stop_rgba(0.62, 0.08, 0.82, 0.98, 0.85); // Laser cyan / crystalline turquoise
                    pat.add_color_stop_rgba(0.78, 0.10, 0.45, 0.98, 0.58); // Rich cosmic sapphire blue
                    pat.add_color_stop_rgba(0.90, 0.28, 0.08, 0.65, 0.24); // Deep amethyst mist
                    pat.add_color_stop_rgba(1.00, 0.00, 0.00, 0.00, 0.00);
                }
                "plasma" => {
                    // Cyberpunk Neon Magenta / Ultraviolet / High-Voltage Laser Cyan
                    pat.add_color_stop_rgba(0.00, 1.00, 1.00, 1.00, 1.00);
                    pat.add_color_stop_rgba(0.06, 0.35, 0.98, 1.00, 1.00);
                    pat.add_color_stop_rgba(0.18, 0.95, 0.15, 0.92, 0.98);
                    pat.add_color_stop_rgba(0.35, 0.70, 0.08, 0.98, 0.94);
                    pat.add_color_stop_rgba(0.55, 0.30, 0.12, 0.95, 0.82);
                    pat.add_color_stop_rgba(0.75, 0.05, 0.78, 0.95, 0.58);
                    pat.add_color_stop_rgba(0.90, 0.08, 0.15, 0.70, 0.22);
                    pat.add_color_stop_rgba(1.00, 0.00, 0.00, 0.00, 0.00);
                }
                "solar" => {
                    // Thermonuclear Supernova Flare: incandescent white -> molten gold -> solar vermillion -> crimson dusk
                    pat.add_color_stop_rgba(0.00, 1.00, 1.00, 0.95, 1.00);
                    pat.add_color_stop_rgba(0.07, 1.00, 0.90, 0.35, 1.00);
                    pat.add_color_stop_rgba(0.20, 1.00, 0.65, 0.10, 0.98);
                    pat.add_color_stop_rgba(0.38, 0.98, 0.32, 0.05, 0.94);
                    pat.add_color_stop_rgba(0.58, 0.90, 0.12, 0.10, 0.82);
                    pat.add_color_stop_rgba(0.78, 0.65, 0.05, 0.20, 0.55);
                    pat.add_color_stop_rgba(0.92, 0.35, 0.02, 0.15, 0.22);
                    pat.add_color_stop_rgba(1.00, 0.00, 0.00, 0.00, 0.00);
                }
                "liquid" => {
                    // Bioluminescent Oceanic Lagoon: pure diamond core -> Caribbean turquoise -> emerald teal -> deep azure
                    pat.add_color_stop_rgba(0.00, 1.00, 1.00, 1.00, 1.00);
                    pat.add_color_stop_rgba(0.08, 0.45, 1.00, 0.95, 1.00);
                    pat.add_color_stop_rgba(0.22, 0.05, 0.92, 0.85, 0.98);
                    pat.add_color_stop_rgba(0.42, 0.05, 0.70, 0.95, 0.90);
                    pat.add_color_stop_rgba(0.62, 0.08, 0.45, 0.90, 0.76);
                    pat.add_color_stop_rgba(0.80, 0.05, 0.22, 0.75, 0.48);
                    pat.add_color_stop_rgba(0.92, 0.02, 0.10, 0.45, 0.20);
                    pat.add_color_stop_rgba(1.00, 0.00, 0.00, 0.00, 0.00);
                }
                _ => {
                    // "heavenly" — Iridescent Pearlescent Opal Flare (diamond core -> champagne gold -> rose quartz -> celestial sky)
                    pat.add_color_stop_rgba(0.00, 1.00, 1.00, 1.00, 1.00);
                    pat.add_color_stop_rgba(0.08, 1.00, 0.94, 0.78, 0.98);
                    pat.add_color_stop_rgba(0.20, 0.96, 0.68, 0.92, 0.95);
                    pat.add_color_stop_rgba(0.38, 0.70, 0.58, 0.98, 0.90);
                    pat.add_color_stop_rgba(0.58, 0.35, 0.85, 0.98, 0.80);
                    pat.add_color_stop_rgba(0.76, 0.25, 0.95, 0.85, 0.52);
                    pat.add_color_stop_rgba(0.90, 0.45, 0.65, 0.95, 0.22);
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
                    // Supernova Chromatic Radiance Wave on Drop
                    s_pat.add_color_stop_rgba(0.00, 1.00, 0.98, 0.92, 1.00);
                    s_pat.add_color_stop_rgba(0.08, 1.00, 0.85, 0.35, 1.00);
                    s_pat.add_color_stop_rgba(0.20, 1.00, 0.30, 0.65, 0.98);
                    s_pat.add_color_stop_rgba(0.38, 0.90, 0.15, 0.90, 0.95);
                    s_pat.add_color_stop_rgba(0.56, 0.45, 0.25, 0.98, 0.88);
                    s_pat.add_color_stop_rgba(0.72, 0.08, 0.80, 0.98, 0.70);
                    s_pat.add_color_stop_rgba(0.86, 0.15, 0.45, 0.92, 0.40);
                    s_pat.add_color_stop_rgba(0.96, 0.25, 0.12, 0.65, 0.15);
                    s_pat.add_color_stop_rgba(1.00, 0.00, 0.00, 0.00, 0.00);
                }
                "plasma" => {
                    s_pat.add_color_stop_rgba(0.00, 1.00, 1.00, 1.00, 1.00);
                    s_pat.add_color_stop_rgba(0.12, 0.35, 0.95, 1.00, 0.98);
                    s_pat.add_color_stop_rgba(0.28, 0.95, 0.18, 0.95, 0.92);
                    s_pat.add_color_stop_rgba(0.50, 0.65, 0.10, 0.98, 0.78);
                    s_pat.add_color_stop_rgba(0.72, 0.15, 0.55, 0.95, 0.55);
                    s_pat.add_color_stop_rgba(0.90, 0.08, 0.20, 0.70, 0.22);
                    s_pat.add_color_stop_rgba(1.00, 0.00, 0.00, 0.00, 0.00);
                }
                "solar" => {
                    s_pat.add_color_stop_rgba(0.00, 1.00, 1.00, 0.90, 1.00);
                    s_pat.add_color_stop_rgba(0.12, 1.00, 0.88, 0.30, 0.98);
                    s_pat.add_color_stop_rgba(0.28, 1.00, 0.55, 0.08, 0.92);
                    s_pat.add_color_stop_rgba(0.52, 0.95, 0.25, 0.05, 0.78);
                    s_pat.add_color_stop_rgba(0.75, 0.80, 0.10, 0.15, 0.52);
                    s_pat.add_color_stop_rgba(0.92, 0.40, 0.04, 0.10, 0.20);
                    s_pat.add_color_stop_rgba(1.00, 0.00, 0.00, 0.00, 0.00);
                }
                "liquid" => {
                    s_pat.add_color_stop_rgba(0.00, 1.00, 1.00, 1.00, 1.00);
                    s_pat.add_color_stop_rgba(0.12, 0.35, 1.00, 0.95, 0.98);
                    s_pat.add_color_stop_rgba(0.30, 0.08, 0.88, 0.92, 0.90);
                    s_pat.add_color_stop_rgba(0.55, 0.08, 0.60, 0.95, 0.72);
                    s_pat.add_color_stop_rgba(0.76, 0.06, 0.35, 0.85, 0.48);
                    s_pat.add_color_stop_rgba(0.92, 0.03, 0.18, 0.60, 0.20);
                    s_pat.add_color_stop_rgba(1.00, 0.00, 0.00, 0.00, 0.00);
                }
                _ => {
                    // heavenly surge
                    s_pat.add_color_stop_rgba(0.00, 1.00, 1.00, 1.00, 1.00);
                    s_pat.add_color_stop_rgba(0.12, 1.00, 0.92, 0.75, 0.98);
                    s_pat.add_color_stop_rgba(0.28, 0.95, 0.60, 0.90, 0.92);
                    s_pat.add_color_stop_rgba(0.48, 0.65, 0.50, 0.98, 0.82);
                    s_pat.add_color_stop_rgba(0.70, 0.35, 0.80, 0.98, 0.58);
                    s_pat.add_color_stop_rgba(0.88, 0.30, 0.95, 0.85, 0.26);
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

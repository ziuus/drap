# tests/test_render_liquid_glass.py
import cairo
import math
import os

def draw_optical_liquid_water_ripple(cr, width, height, progress, edge="right", coord=0.5):
    """
    Renders ultra-realistic optical liquid glass water ripples:
    - Continuous seamless Fresnel specular caustics (zero gaps).
    - Vivid crystalline water meniscus lens body with rich aquatic transparency.
    - Multi-ring physical harmonic undulation (3 distinct water ripples).
    - Meniscus refraction depth shadows lifting water off the monitor glass.
    - Sparkling impact water droplet beads along the bezel.
    """
    if progress <= 0.001 or progress >= 1.0:
        return

    damping = math.pow(max(0.0, 1.0 - progress), 1.45) * math.exp(-1.2 * progress)
    if damping <= 0.002:
        return

    # 1. Determine Origin Coordinates (x0, y0) and Angle Span
    if edge.startswith("corner-"):
        corner = edge.replace("corner-", "")
        if corner == "top-right":
            x0, y0 = width, 0
            start_ang, end_ang = math.pi / 2, math.pi
        elif corner == "bottom-right":
            x0, y0 = width, height
            start_ang, end_ang = math.pi, 3 * math.pi / 2
        elif corner == "top-left":
            x0, y0 = 0, 0
            start_ang, end_ang = 0, math.pi / 2
        else: # bottom-left
            x0, y0 = 0, height
            start_ang, end_ang = 3 * math.pi / 2, 2 * math.pi
    elif edge == "left":
        x0, y0 = 0, coord * height
        start_ang, end_ang = -math.pi / 2, math.pi / 2
    elif edge == "top":
        x0, y0 = coord * width, 0
        start_ang, end_ang = 0, math.pi
    elif edge == "bottom":
        x0, y0 = coord * width, height
        start_ang, end_ang = math.pi, 2 * math.pi
    else: # right
        x0, y0 = width, coord * height
        start_ang, end_ang = math.pi / 2, 3 * math.pi / 2

    max_reach = math.hypot(width, height) * 0.96
    ease = 1.0 - math.pow(1.0 - progress, 2.2)
    r1 = ease * max_reach

    # Wave ring spacing (physical harmonic dispersion)
    wavelength = 62.0
    r2 = max(0.0, r1 - wavelength)
    r3 = max(0.0, r1 - wavelength * 1.85)

    # Ambient overhead light vector (from top-left: -0.65, -0.75)
    lx, ly = -0.65, -0.75
    l_mag = math.hypot(lx, ly)
    lx, ly = lx / l_mag, ly / l_mag

    cr.save()

    # =========================================================================
    # 2. Rich Crystalline Water Fluid Body (Curved Meniscus Lens)
    # =========================================================================
    if r1 > 10:
        body_inner = max(0.0, r1 - wavelength * 1.5)
        body_outer = r1 + 22.0

        cr.new_path()
        cr.arc(x0, y0, body_outer, start_ang, end_ang)
        cr.arc_negative(x0, y0, body_inner, end_ang, start_ang)
        cr.close_path()

        # Multi-stop radial gradient simulating convex water surface lens
        body_grad = cairo.RadialGradient(x0, y0, body_inner, x0, y0, body_outer)
        body_grad.add_color_stop_rgba(0.00, 0.40, 0.85, 1.00, 0.0)
        body_grad.add_color_stop_rgba(0.35, 0.35, 0.80, 0.98, 0.16 * damping)
        body_grad.add_color_stop_rgba(0.65, 0.20, 0.75, 0.95, 0.26 * damping)
        body_grad.add_color_stop_rgba(0.85, 0.70, 0.92, 1.00, 0.32 * damping)
        body_grad.add_color_stop_rgba(1.00, 0.85, 0.96, 1.00, 0.0)
        cr.set_source(body_grad)
        cr.fill()

    # Helper function to create seamless directional specular brush
    def create_specular_gradient(radius, bright_mult=1.0):
        # Creates a smooth directional linear gradient aligned with ambient light vector
        g = cairo.LinearGradient(
            x0 - radius * lx, y0 - radius * ly,
            x0 + radius * lx, y0 + radius * ly
        )
        # Trailing/away from light: soft ambient aquatic tint
        g.add_color_stop_rgba(0.00, 0.60, 0.88, 1.00, 0.35 * bright_mult * damping)
        g.add_color_stop_rgba(0.40, 0.75, 0.94, 1.00, 0.55 * bright_mult * damping)
        # Center peak facing ambient light: brilliant glistening specular highlight
        g.add_color_stop_rgba(0.85, 0.95, 0.99, 1.00, 0.92 * bright_mult * damping)
        g.add_color_stop_rgba(1.00, 1.00, 1.00, 1.00, 1.00 * bright_mult * damping)
        return g

    # =========================================================================
    # 3. Primary Wave Meniscus (Leading Crest, Specular Glint & Shadow)
    # =========================================================================
    if r1 > 8:
        # A. Meniscus Caustic Contact Shadow (3D depth cue)
        cr.save()
        cr.new_path()
        cr.arc(x0, y0, max(1.0, r1 - 8.0), start_ang, end_ang)
        cr.set_source_rgba(0.00, 0.03, 0.08, 0.32 * damping)
        cr.set_line_width(6.0)
        cr.stroke()
        cr.restore()

        # B. Caustic Luminous Glow Halo
        cr.save()
        cr.new_path()
        cr.arc(x0, y0, r1, start_ang, end_ang)
        halo_grad = cairo.RadialGradient(x0, y0, r1 - 10.0, x0, y0, r1 + 10.0)
        halo_grad.add_color_stop_rgba(0.0, 0.40, 0.80, 1.00, 0.0)
        halo_grad.add_color_stop_rgba(0.5, 0.70, 0.92, 1.00, 0.40 * damping)
        halo_grad.add_color_stop_rgba(1.0, 0.40, 0.80, 1.00, 0.0)
        cr.set_source(halo_grad)
        cr.set_line_width(8.0)
        cr.stroke()
        cr.restore()

        # C. Seamless Specular Wave Crest (Pure gleaming light reflection)
        cr.save()
        cr.new_path()
        cr.arc(x0, y0, r1, start_ang, end_ang)
        cr.set_source(create_specular_gradient(r1, bright_mult=1.0))
        cr.set_line_width(3.2)
        cr.stroke()
        cr.restore()

    # =========================================================================
    # 4. Secondary Harmonic Water Ripple (Trailing Wake)
    # =========================================================================
    if r2 > 12:
        # Secondary Caustic Shadow
        cr.save()
        cr.new_path()
        cr.arc(x0, y0, max(1.0, r2 - 6.0), start_ang, end_ang)
        cr.set_source_rgba(0.00, 0.03, 0.08, 0.22 * damping)
        cr.set_line_width(4.5)
        cr.stroke()
        cr.restore()

        # Secondary Specular Highlight
        cr.save()
        cr.new_path()
        cr.arc(x0, y0, r2, start_ang, end_ang)
        cr.set_source(create_specular_gradient(r2, bright_mult=0.68))
        cr.set_line_width(2.2)
        cr.stroke()
        cr.restore()

    # =========================================================================
    # 5. Tertiary Micro-Shimmer Wave (Delicate Trailing Ring)
    # =========================================================================
    if r3 > 16:
        cr.save()
        cr.new_path()
        cr.arc(x0, y0, r3, start_ang, end_ang)
        cr.set_source(create_specular_gradient(r3, bright_mult=0.42))
        cr.set_line_width(1.5)
        cr.stroke()
        cr.restore()

    # =========================================================================
    # 6. Sparkling Impact Droplet Beads along Bezel
    # =========================================================================
    bead_damping = math.pow(max(0.0, 1.0 - progress), 1.8)
    if bead_damping > 0.06:
        droplets = [
            (-22, -45, 6.5),
            (-38, 30, 8.0),
            (-15, 65, 5.5),
            (-45, -20, 7.0),
            (-28, 90, 4.8),
            (-52, 10, 6.2),
            (-18, -80, 5.2)
        ]
        for dx, dy, base_r in droplets:
            if edge == "right":
                bx, by = x0 - abs(dx) - (r1 * 0.05), y0 + dy
            elif edge == "left":
                bx, by = x0 + abs(dx) + (r1 * 0.05), y0 + dy
            elif edge == "top":
                bx, by = x0 + dx, y0 + abs(dy) + (r1 * 0.05)
            elif edge == "bottom":
                bx, by = x0 + dx, y0 - abs(dy) - (r1 * 0.05)
            else:
                bx, by = x0 + (dx if "left" in edge else -abs(dx)), y0 + (abs(dy) if "top" in edge else -abs(dy))

            cur_r = base_r * bead_damping
            if cur_r < 1.2:
                continue

            # Droplet contact shadow
            cr.save()
            cr.new_path()
            cr.arc(bx + cur_r * 0.35, by + cur_r * 0.45, cur_r * 1.05, 0, 2 * math.pi)
            cr.set_source_rgba(0.00, 0.03, 0.08, 0.40 * bead_damping)
            cr.fill()
            cr.restore()

            # Droplet spherical water bead
            cr.save()
            cr.new_path()
            cr.arc(bx, by, cur_r, 0, 2 * math.pi)
            bead_grad = cairo.RadialGradient(
                bx - cur_r * 0.35, by - cur_r * 0.35, cur_r * 0.1,
                bx, by, cur_r
            )
            bead_grad.add_color_stop_rgba(0.00, 1.00, 1.00, 1.00, 0.95 * bead_damping)
            bead_grad.add_color_stop_rgba(0.40, 0.70, 0.92, 1.00, 0.75 * bead_damping)
            bead_grad.add_color_stop_rgba(0.85, 0.25, 0.75, 0.98, 0.50 * bead_damping)
            bead_grad.add_color_stop_rgba(1.00, 0.10, 0.50, 0.90, 0.25 * bead_damping)
            cr.set_source(bead_grad)
            cr.fill()
            cr.restore()

            # Droplet specular glint (tiny pure white dot)
            cr.save()
            cr.new_path()
            cr.arc(bx - cur_r * 0.35, by - cur_r * 0.35, cur_r * 0.32, 0, 2 * math.pi)
            cr.set_source_rgba(1.00, 1.00, 1.00, 0.98 * bead_damping)
            cr.fill()
            cr.restore()

    cr.restore()

if __name__ == "__main__":
    w, h = 1920, 1080
    surface = cairo.ImageSurface(cairo.FORMAT_ARGB32, w, h)
    cr = cairo.Context(surface)

    # Dark background
    cr.set_source_rgb(0.06, 0.07, 0.10)
    cr.paint()

    # Mock desktop window card underneath
    cr.set_source_rgba(0.14, 0.16, 0.21, 0.95)
    cr.rectangle(550, 280, 800, 520)
    cr.fill()
    cr.set_source_rgba(1.0, 1.0, 1.0, 0.85)
    cr.select_font_face("Sans", cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_BOLD)
    cr.set_font_size(24)
    cr.move_to(600, 350)
    cr.show_text("Sample Open Desktop Window Under Clear Water Ripple")

    # Render liquid water ripple at progress = 0.32
    draw_optical_liquid_water_ripple(cr, w, h, progress=0.32, edge="right", coord=0.5)

    out_path = "/home/zius/.config/agentcontrol/profiles/01M502H9CCPDQP9RQR3ARMS4DX/.gemini/antigravity-cli/brain/3e02c353-6505-403c-ae2d-c62c56f18961/test_optical_water_ripple_v2.png"
    surface.write_to_png(out_path)
    print(f"Rendered optical liquid water ripple v2 to {out_path}")

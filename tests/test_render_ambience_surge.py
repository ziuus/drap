# tests/test_render_ambience_surge.py
import cairo
import math

def build_luts():
    luts = {}
    lut_w = 512
    lut_h = 1024
    cx = lut_w
    cy = lut_h / 2
    max_r = lut_w

    for theme in ("aurora", "plasma", "solar", "liquid"):
        surf = cairo.ImageSurface(cairo.FORMAT_ARGB32, lut_w, lut_h)
        cr = cairo.Context(surf)
        pat = cairo.RadialGradient(cx, cy, 0, cx, cy, max_r)

        if theme == "plasma":
            pat.add_color_stop_rgba(0.00, 1.00, 1.00, 1.00, 0.95)
            pat.add_color_stop_rgba(0.12, 0.95, 0.40, 1.00, 0.80)
            pat.add_color_stop_rgba(0.28, 0.75, 0.25, 0.98, 0.60)
            pat.add_color_stop_rgba(0.50, 0.45, 0.15, 0.88, 0.32)
            pat.add_color_stop_rgba(0.75, 0.22, 0.08, 0.60, 0.12)
            pat.add_color_stop_rgba(0.92, 0.10, 0.04, 0.35, 0.02)
            pat.add_color_stop_rgba(1.00, 0.00, 0.00, 0.00, 0.00)
        elif theme == "solar":
            pat.add_color_stop_rgba(0.00, 1.00, 0.99, 0.94, 0.95)
            pat.add_color_stop_rgba(0.14, 1.00, 0.82, 0.35, 0.82)
            pat.add_color_stop_rgba(0.32, 0.98, 0.55, 0.20, 0.58)
            pat.add_color_stop_rgba(0.55, 0.90, 0.35, 0.15, 0.30)
            pat.add_color_stop_rgba(0.78, 0.75, 0.18, 0.08, 0.10)
            pat.add_color_stop_rgba(0.92, 0.50, 0.10, 0.04, 0.02)
            pat.add_color_stop_rgba(1.00, 0.00, 0.00, 0.00, 0.00)
        elif theme == "liquid":
            pat.add_color_stop_rgba(0.00, 1.00, 1.00, 1.00, 1.00)
            pat.add_color_stop_rgba(0.18, 0.96, 1.00, 1.00, 0.95)
            pat.add_color_stop_rgba(0.35, 0.35, 0.95, 0.98, 0.75)
            pat.add_color_stop_rgba(0.55, 0.15, 0.80, 0.92, 0.48)
            pat.add_color_stop_rgba(0.75, 0.08, 0.55, 0.78, 0.22)
            pat.add_color_stop_rgba(0.90, 0.03, 0.30, 0.50, 0.06)
            pat.add_color_stop_rgba(1.00, 0.00, 0.00, 0.00, 0.00)
        else: # aurora
            pat.add_color_stop_rgba(0.00, 1.00, 1.00, 1.00, 1.00)
            pat.add_color_stop_rgba(0.58, 1.00, 1.00, 1.00, 0.99)
            pat.add_color_stop_rgba(0.66, 1.00, 0.94, 0.72, 0.96)
            pat.add_color_stop_rgba(0.74, 1.00, 0.65, 0.75, 0.88)
            pat.add_color_stop_rgba(0.82, 0.82, 0.62, 0.98, 0.65)
            pat.add_color_stop_rgba(0.90, 0.45, 0.78, 0.98, 0.38)
            pat.add_color_stop_rgba(0.96, 0.22, 0.38, 0.88, 0.14)
            pat.add_color_stop_rgba(1.00, 0.00, 0.00, 0.00, 0.00)

        cr.set_source(pat)
        cr.paint()
        luts[theme] = surf
    return luts

def draw_ambience_surge(cr, width, height, progress, luts, theme="aurora", edge="right", coord=0.5):
    if progress <= 0.001 or progress >= 1.0:
        return

    surf = luts.get(theme, luts["aurora"])
    lut_w = 512
    lut_h = 1024

    ease = 1.0 - math.pow(1.0 - progress, 2.5)
    damping = math.pow(max(0.0, 1.0 - progress), 1.35)
    if damping <= 0.005:
        return

    # Full screen expansion reach
    max_reach = math.hypot(width, height) * 1.15
    radius_x = 350.0 + ease * (max_reach - 350.0)
    radius_y = max(radius_x * 1.15, height * 1.6)

    # Theme atmospheric wash colors
    if theme == "plasma":
        tr, tg, tb = 0.65, 0.25, 0.95
    elif theme == "solar":
        tr, tg, tb = 1.00, 0.55, 0.15
    else: # aurora / liquid
        tr, tg, tb = 0.25, 0.75, 0.98

    cr.save()

    # Transformation & Alignment
    if edge.startswith("corner-"):
        corner = edge.replace("corner-", "")
        if corner == "top-right":
            cr.translate(width, 0)
            cr.rotate(3 * math.pi / 4)
        elif corner == "bottom-right":
            cr.translate(width, height)
            cr.rotate(-3 * math.pi / 4)
        elif corner == "top-left":
            cr.translate(0, 0)
            cr.rotate(math.pi / 4)
        elif corner == "bottom-left":
            cr.translate(0, height)
            cr.rotate(-math.pi / 4)
    elif edge == "left":
        cr.translate(0, coord * height)
        cr.rotate(math.pi)
    elif edge == "top":
        cr.translate(coord * width, 0)
        cr.rotate(-math.pi / 2)
    elif edge == "bottom":
        cr.translate(coord * width, height)
        cr.rotate(math.pi / 2)
    else: # "right"
        cr.translate(width, coord * height)

    # 1. Tier 1: Full-Screen Ethereal Atmospheric Wash
    wash_r = radius_x * 1.08
    wash_pat = cairo.RadialGradient(0, 0, 10, 0, 0, wash_r)
    wash_pat.add_color_stop_rgba(0.00, tr, tg, tb, 0.38 * damping)
    wash_pat.add_color_stop_rgba(0.35, tr, tg, tb, 0.20 * damping)
    wash_pat.add_color_stop_rgba(0.70, tr, tg, tb, 0.08 * damping)
    wash_pat.add_color_stop_rgba(1.00, 0.0, 0.0, 0.0, 0.0)
    cr.set_source(wash_pat)
    cr.arc(0, 0, wash_r, 0, 2 * math.pi)
    cr.fill()

    # 2. Tier 2: Massive Chromatic Volumetric Ambience Texture (Sub-millisecond blit)
    cr.save()
    cr.scale(radius_x / lut_w, radius_y / (lut_h / 2))
    cr.translate(-lut_w, -lut_h / 2)

    pat = cairo.SurfacePattern(surf)
    pat.set_filter(cairo.Filter.BILINEAR)
    cr.set_source(pat)
    cr.paint_with_alpha(damping * 0.95)
    cr.restore()

    # 3. Tier 3: Incandescent Origin Core Flash
    core_r = max(20.0, 180.0 * (1.0 - progress))
    core_pat = cairo.RadialGradient(0, 0, 0, 0, 0, core_r)
    core_pat.add_color_stop_rgba(0.00, 1.0, 1.0, 1.0, 0.95 * damping)
    core_pat.add_color_stop_rgba(0.45, 1.0, 0.95, 0.85, 0.65 * damping)
    core_pat.add_color_stop_rgba(1.00, 0.0, 0.0, 0.0, 0.0)
    cr.set_source(core_pat)
    cr.arc(0, 0, core_r, 0, 2 * math.pi)
    cr.fill()

    cr.restore()

if __name__ == "__main__":
    w, h = 1920, 1080
    surface = cairo.ImageSurface(cairo.FORMAT_ARGB32, w, h)
    cr = cairo.Context(surface)

    # Dark background desktop
    cr.set_source_rgb(0.07, 0.08, 0.11)
    cr.paint()

    # Desktop window underneath
    cr.set_source_rgba(0.14, 0.16, 0.22, 0.95)
    cr.rectangle(550, 280, 800, 520)
    cr.fill()
    cr.set_source_rgba(1.0, 1.0, 1.0, 0.85)
    cr.select_font_face("Sans", cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_BOLD)
    cr.set_font_size(24)
    cr.move_to(600, 350)
    cr.show_text("Sample Desktop Window Bathed in Full-Screen Ambience Surge")

    luts = build_luts()
    draw_ambience_surge(cr, w, h, progress=0.28, luts=luts, theme="aurora", edge="right", coord=0.5)

    out_path = "/home/zius/.config/agentcontrol/profiles/01M502H9CCPDQP9RQR3ARMS4DX/.gemini/antigravity-cli/brain/3e02c353-6505-403c-ae2d-c62c56f18961/test_ambience_surge_preview.png"
    surface.write_to_png(out_path)
    print(f"Rendered ambience surge preview to {out_path}")

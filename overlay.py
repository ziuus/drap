#!/usr/bin/env python3
"""
drap - Native Linux Spatial Transfer Overlay (Hyprland / Wayland)
Full-screen (1920x1080) click-through layer-shell overlay.
Features:
- Authentic Drooop atmospheric volumetric light leak (spanning 800-1100px).
- Multi-spectral chromatic aura (incandescent core, chartreuse halo, twilight lavender veil).
- Real-time bezel portal crossing: cards peek out from the desktop bezel as pushed from phone.
- Full-screen chromatic radiance wash on drop confirmation.
- High-performance, zero-lag Cairo rendering with 100% idle transparency (0.0% CPU).
"""

import os
import sys
import json
import time
import math
import threading
from pathlib import Path

# Ensure GTK4 Layer Shell preload is active
if "libgtk4-layer-shell.so" not in os.environ.get("LD_PRELOAD", ""):
    if os.path.exists("/usr/lib/libgtk4-layer-shell.so"):
        os.environ["LD_PRELOAD"] = "/usr/lib/libgtk4-layer-shell.so"

import gi
gi.require_version('Gtk', '4.0')
gi.require_version('Gdk', '4.0')
gi.require_version('Gtk4LayerShell', '1.0')
gi.require_version('Pango', '1.0')
gi.require_version('PangoCairo', '1.0')
from gi.repository import Gtk, Gdk, Gtk4LayerShell, GLib, Pango, PangoCairo
import cairo
from websockets.sync.client import connect

WS_URL = "ws://127.0.0.1:8080/ws"

def rounded_rectangle(cr, x, y, width, height, radius):
    """Draw a smooth rounded rectangle in Cairo."""
    cr.new_sub_path()
    cr.arc(x + width - radius, y + radius, radius, -math.pi / 2, 0)
    cr.arc(x + width - radius, y + height - radius, radius, 0, math.pi / 2)
    cr.arc(x + radius, y + height - radius, radius, math.pi / 2, math.pi)
    cr.arc(x + radius, y + radius, radius, math.pi, 3 * math.pi / 2)
    cr.close_path()

class DrapOverlay:
    def __init__(self):
        self.running = True
        self.target_y = 0.5
        self.current_y = 0.5
        self.target_intensity = 0.0
        self.current_intensity = 0.0
        self.target_pressure = 0.5
        self.current_pressure = 0.5
        self.edge_proximity = 0.0
        self.effect_theme = "liquid"

        # Time & Inactivity Watchdog
        self.start_time = time.time()
        self.last_tick = time.time()
        self.last_interaction_time = 0.0
        self.was_drawing = False

        # Real-time Bezel Peeking Card State (Portal crossing from phone)
        self.peek_active = False
        self.target_peek_depth = 0.0
        self.current_peek_depth = 0.0
        self.peek_title = ""
        self.peek_size = ""
        self.peek_type = "photo"
        self.peek_theme = "blue"

        # Drop Confirmation Card State
        self.card_active = False
        self.card_progress = 0.0
        self.card_x = 1920
        self.card_y = 0.5
        self.card_filename = ""
        self.card_size_str = ""
        self.card_start_time = 0.0
        self.card_duration = 2.8

        # Full-Screen Drop Confirmation Radiance Wave
        self.confirm_active = False
        self.confirm_progress = 0.0
        self.confirm_y = 0.5

        # Video continuity ripple state
        self.ripple_active = False
        self.ripple_progress = 0.0
        self.ripple_y = 0.5

        self._setup_window()
        self._start_ws_client()

    def _setup_window(self):
        # GTK4 CSS: Total background transparency
        css_provider = Gtk.CssProvider()
        css_provider.load_from_string("""
            window {
                background-color: transparent;
                background: none;
            }
        """)
        Gtk.StyleContext.add_provider_for_display(
            Gdk.Display.get_default(),
            css_provider,
            Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
        )

        self.window = Gtk.Window()
        self.window.set_title("drap Spatial Overlay")

        # Initialize Full-Screen Layer Shell
        Gtk4LayerShell.init_for_window(self.window)
        Gtk4LayerShell.set_layer(self.window, Gtk4LayerShell.Layer.OVERLAY)
        Gtk4LayerShell.set_namespace(self.window, "drap-aurora")

        # Anchor to ALL four edges -> Full Screen 1920x1080 (No edge clipping!)
        Gtk4LayerShell.set_anchor(self.window, Gtk4LayerShell.Edge.TOP, True)
        Gtk4LayerShell.set_anchor(self.window, Gtk4LayerShell.Edge.BOTTOM, True)
        Gtk4LayerShell.set_anchor(self.window, Gtk4LayerShell.Edge.LEFT, True)
        Gtk4LayerShell.set_anchor(self.window, Gtk4LayerShell.Edge.RIGHT, True)

        Gtk4LayerShell.set_exclusive_zone(self.window, 0)
        Gtk4LayerShell.set_keyboard_mode(self.window, Gtk4LayerShell.KeyboardMode.NONE)

        # Select primary monitor eDP-1 if available
        display = Gdk.Display.get_default()
        monitors = display.get_monitors()
        for i in range(monitors.get_n_items()):
            mon = monitors.get_item(i)
            if mon.get_connector() == "eDP-1":
                Gtk4LayerShell.set_monitor(self.window, mon)
                break

        # Fast Cairo Drawing Area
        self.drawing_area = Gtk.DrawingArea()
        self.drawing_area.set_draw_func(self._on_draw)
        self.drawing_area.add_tick_callback(self._on_tick)
        self.window.set_child(self.drawing_area)

        self.window.realize()

        # Crucial: 100% click-through by setting an empty input region
        surface = self.window.get_native().get_surface()
        empty_region = cairo.Region()
        surface.set_input_region(empty_region)

        self.window.present()
        print("[drap Overlay] Full-Screen GTK4 Layer Shell initialized (Zero clipping, full click-through).")

    def _start_ws_client(self):
        t = threading.Thread(target=self._ws_loop, daemon=True)
        t.start()

    def _ws_loop(self):
        while self.running:
            try:
                print(f"[drap Overlay] Connecting to WebSocket gateway {WS_URL}...")
                with connect(WS_URL) as ws:
                    print("[drap Overlay] Connected to gateway.")
                    while self.running:
                        message = ws.recv()
                        if not message:
                            continue
                        try:
                            data = json.loads(message)
                            GLib.idle_add(self._handle_ws_message, data)
                        except Exception as e:
                            print(f"[drap Overlay] WS parse error: {e}")
            except Exception as e:
                time.sleep(1.5)

    def _handle_ws_message(self, data: dict):
        msg_type = data.get("type", "")

        if msg_type == "drag_move":
            self.last_interaction_time = time.time()
            if "y" in data:
                self.target_y = float(data["y"])
                self.current_y += (self.target_y - self.current_y) * 0.55

            proximity = float(data.get("proximity", 0.0))
            pressure = float(data.get("pressure", 0.5))
            peek = float(data.get("peek", 0.0))

            self.edge_proximity = proximity
            self.target_pressure = pressure
            self.current_pressure += (pressure - self.current_pressure) * 0.45
            self.target_intensity = max(0.0, min(1.0, proximity)) if proximity > 0.02 else 0.0
            self.current_intensity += (self.target_intensity - self.current_intensity) * 0.45

            # Bezel peeking card state
            self.peek_title = data.get("title", "")
            self.peek_size = data.get("size", "")
            self.peek_type = data.get("item_type", "photo")
            self.peek_theme = data.get("theme", "blue")
            self.target_peek_depth = peek

            if peek > 0.02 or proximity > 0.15:
                self.peek_active = True
            else:
                self.peek_active = False

            self.drawing_area.queue_draw()

        elif msg_type == "drag_edge_enter":
            self.last_interaction_time = time.time()
            if "y" in data:
                self.target_y = float(data["y"])
                self.current_y = self.target_y
            self.target_intensity = 0.85
            self.current_intensity = 0.85
            self.edge_proximity = 0.85
            self.drawing_area.queue_draw()

        elif msg_type == "drag_edge_leave":
            self.target_intensity = 0.0
            self.edge_proximity = 0.0
            self.target_pressure = 0.5
            self.peek_active = False
            self.target_peek_depth = 0.0
            self.drawing_area.queue_draw()

        elif msg_type == "drag_drop" or msg_type == "file_uploaded":
            if "y" in data:
                self.target_y = float(data["y"])
            filename = data.get("filename", "Transferred File")
            size_bytes = data.get("size", 0)
            if size_bytes >= 1024 * 1024:
                size_str = f"{size_bytes / (1024 * 1024):.1f} MB"
            elif size_bytes >= 1024:
                size_str = f"{size_bytes / 1024:.0f} KB"
            else:
                size_str = f"{size_bytes} B"

            # 1. Trigger Full-Screen Confirmation Radiance Wave
            self.confirm_active = True
            self.confirm_progress = 0.0
            self.confirm_y = self.target_y

            # 2. Trigger Confirmation Card
            self.peek_active = False
            self.target_peek_depth = 0.0
            self.trigger_drop_card(filename, size_str, self.target_y)
            self.target_intensity = 0.0
            self.drawing_area.queue_draw()

        elif msg_type == "video_resume":
            if "y" in data:
                self.target_y = float(data["y"])
            self.trigger_video_ripple(self.target_y)

        elif msg_type == "set_effect":
            theme = data.get("theme", "liquid").lower()
            if theme in ("liquid", "aurora", "plasma", "solar"):
                self.effect_theme = theme
                print(f"[drap Overlay] Ambient effect switched to: {self.effect_theme}")

    def trigger_drop_card(self, filename: str, size_str: str, y: float):
        self.card_active = True
        self.card_filename = filename
        self.card_size_str = size_str
        self.card_y = max(0.12, min(0.88, y))
        self.card_start_time = time.time()
        self.card_progress = 0.0

    def trigger_video_ripple(self, y: float):
        self.ripple_active = True
        self.ripple_y = max(0.12, min(0.88, y))
        self.ripple_progress = 0.0

    def _on_tick(self, widget, frame_clock, *args):
        now = time.time()
        dt = max(0.001, min(0.05, now - self.last_tick))
        self.last_tick = now

        # Strict 250ms Inactivity Watchdog: Auto-decay if finger lifted
        if (now - self.last_interaction_time > 0.25):
            self.target_intensity = 0.0
            self.edge_proximity = 0.0
            self.peek_active = False
            self.target_peek_depth = 0.0

        # Silky spring tracking
        self.current_y += (self.target_y - self.current_y) * 0.45

        if self.target_intensity <= 0.001:
            self.current_intensity *= 0.65
            if self.current_intensity < 0.004:
                self.current_intensity = 0.0
        else:
            self.current_intensity += (self.target_intensity - self.current_intensity) * 0.35

        self.current_pressure += (self.target_pressure - self.current_pressure) * 0.25

        # Spring follower for peeking card
        if not self.peek_active:
            self.current_peek_depth *= 0.65
            if self.current_peek_depth < 0.005:
                self.current_peek_depth = 0.0
        else:
            self.current_peek_depth += (self.target_peek_depth - self.current_peek_depth) * 0.40

        needs_draw = False

        if self.current_intensity > 0.001 or self.target_intensity > 0.001 or self.current_peek_depth > 0.005:
            needs_draw = True
            self.was_drawing = True
        elif self.was_drawing:
            # Final clearing pass to guarantee 100% transparent buffer
            self.was_drawing = False
            needs_draw = True

        # Full-Screen Confirmation Radiance Wave Progress
        if self.confirm_active:
            needs_draw = True
            self.confirm_progress += dt * 1.3
            if self.confirm_progress >= 1.0:
                self.confirm_active = False
                self.confirm_progress = 0.0

        # Video continuity shockwave
        if self.ripple_active:
            needs_draw = True
            self.ripple_progress += dt * 1.5
            if self.ripple_progress >= 1.0:
                self.ripple_active = False
                self.ripple_progress = 0.0

        # Drop card animation progress
        if self.card_active:
            needs_draw = True
            elapsed = now - self.card_start_time
            if elapsed >= self.card_duration:
                self.card_active = False
                self.card_progress = 0.0
            else:
                norm = elapsed / self.card_duration
                self.card_progress = norm
                screen_w = 1920
                if norm < 0.22:
                    t = norm / 0.22
                    c1 = 1.70158
                    c3 = c1 + 1
                    ease_in = 1 + c3 * math.pow(t - 1, 3) + c1 * math.pow(t - 1, 2)
                    self.card_x = screen_w - (ease_in * 320)
                elif norm < 0.78:
                    self.card_x = screen_w - 320
                else:
                    t = (norm - 0.78) / 0.22
                    self.card_x = (screen_w - 320) + (t * t * 340)

        if needs_draw:
            widget.queue_draw()

        return GLib.SOURCE_CONTINUE

    def _on_draw(self, area, cr, width, height, *args):
        # 1. Total wipe to 100% transparent pixels
        cr.set_source_rgba(0, 0, 0, 0)
        cr.set_operator(cairo.Operator.CLEAR)
        cr.paint()
        cr.set_operator(cairo.Operator.OVER)

        t_sec = time.time() - self.start_time
        y_pos = self.current_y * height

        # 2. Draw Magnificent Atmospheric Volumetric Light Leak
        if self.current_intensity > 0.004:
            self._draw_drooop_spatial_wave(cr, width, height, y_pos, self.current_intensity, t_sec)

        # 3. Draw Real-Time Bezel Peeking Card (Emerging from edge as pushed on phone)
        if self.current_peek_depth > 0.01:
            self._draw_bezel_peeking_card(cr, width, height, y_pos, self.current_peek_depth)

        # 4. Full-Screen Confirmation Radiance Wave (When file share is confirmed)
        if self.confirm_active:
            self._draw_fullscreen_confirm_wave(cr, width, height, self.confirm_y * height, self.confirm_progress)

        # 5. Video Continuity Shockwave
        if self.ripple_active:
            self._draw_video_portal_shockwave(cr, width, height, self.ripple_y * height, self.ripple_progress)

        # 6. Dropped File Confirmation Card
        if self.card_active:
            self._draw_drop_card(cr, width, height)

    def _draw_drooop_spatial_wave(self, cr, width, height, y_pos, intensity, t_sec):
        """
        Magnificent Drooop atmospheric light leak and fluid meniscus:
        Spans 850px-1100px across the desktop with multi-spectral chromatic dispersion:
        - Warm incandescent pearlescent core
        - Glowing chartreuse / amber-gold halo
        - Radiant seafoam transition zone
        - Dreamy twilight lavender / violet veil
        """
        cr.save()

        pressure_factor = 0.80 + self.current_pressure * 1.15
        # Meniscus bulge from bezel
        bulge_depth = (120 + intensity * 280) * pressure_factor
        wave_height = (260 + intensity * 340) * pressure_factor

        # Fluid harmonic breathing wobble
        wobble = math.sin(t_sec * 3.6) * 14.0 * intensity
        bulge_depth += wobble

        # 1. Vast Atmospheric Volumetric Light Leak (Covers 40-50% of screen horizontally)
        glow_radius_x = 950 * intensity
        glow_radius_y = 650 * intensity

        cr.save()
        cr.translate(width, y_pos)
        cr.scale(1.0, glow_radius_y / max(1.0, glow_radius_x))

        ambient_pat = cairo.RadialGradient(0, 0, 10, 0, 0, glow_radius_x)
        # Multi-spectral dispersion matching Tornike's demo video:
        ambient_pat.add_color_stop_rgba(0.00, 1.0, 0.99, 0.95, 0.90 * intensity) # Warm pearlescent core
        ambient_pat.add_color_stop_rgba(0.18, 0.96, 0.98, 0.78, 0.52 * intensity) # Luminous chartreuse halo
        ambient_pat.add_color_stop_rgba(0.42, 0.55, 0.94, 0.85, 0.30 * intensity) # Radiant seafoam zone
        ambient_pat.add_color_stop_rgba(0.70, 0.72, 0.58, 0.94, 0.16 * intensity) # Dreamy twilight lavender veil
        ambient_pat.add_color_stop_rgba(1.00, 0.0, 0.0, 0.0, 0.0)

        cr.set_source(ambient_pat)
        cr.arc(0, 0, glow_radius_x, 0, 2 * math.pi)
        cr.fill()
        cr.restore()

        # 2. Organic Bézier Fluid Meniscus along Bezel
        y_top = y_pos - wave_height / 2
        y_bot = y_pos + wave_height / 2
        peak_x = width - bulge_depth

        cr.new_path()
        cr.move_to(width, y_top)
        cr.curve_to(
            width - (bulge_depth * 0.28), y_top + wave_height * 0.22,
            peak_x, y_pos - wave_height * 0.20,
            peak_x, y_pos
        )
        cr.curve_to(
            peak_x, y_pos + wave_height * 0.20,
            width - (bulge_depth * 0.28), y_bot - wave_height * 0.22,
            width, y_bot
        )
        cr.line_to(width, y_top)
        cr.close_path()

        # Viscous luminous fluid body
        fluid_pat = cairo.RadialGradient(width, y_pos, 5, width - bulge_depth * 0.45, y_pos, bulge_depth * 1.15)
        fluid_pat.add_color_stop_rgba(0.00, 1.0, 1.0, 1.0, 0.90 * intensity)
        fluid_pat.add_color_stop_rgba(0.28, 0.95, 0.98, 0.80, 0.70 * intensity)
        fluid_pat.add_color_stop_rgba(0.65, 0.45, 0.90, 0.95, 0.40 * intensity)
        fluid_pat.add_color_stop_rgba(1.00, 0.0, 0.0, 0.0, 0.0)

        cr.set_source(fluid_pat)
        cr.fill_preserve()

        # 3. Luminous Specular Meniscus Rim
        rim_pat = cairo.LinearGradient(peak_x, y_pos, width, y_pos)
        rim_pat.add_color_stop_rgba(0.0, 1.0, 1.0, 1.0, 0.98 * intensity)
        rim_pat.add_color_stop_rgba(0.65, 0.55, 0.98, 0.95, 0.75 * intensity)
        rim_pat.add_color_stop_rgba(1.0, 0.2, 0.6, 0.9, 0.0)
        cr.set_source(rim_pat)
        cr.set_line_width(3.2)
        cr.stroke()

        cr.restore()

    def _draw_bezel_peeking_card(self, cr, width, height, y_pos, peek_depth):
        """
        The Portal Crossing:
        Draws the card emerging from the laptop's right display bezel in real-time
        as the user pushes it off the phone screen.
        """
        cr.save()

        card_w = 280
        card_h = 76
        # Slide card out from bezel proportional to finger push
        peek_px = min(card_w - 20, peek_depth * 230)
        card_x = width - peek_px
        card_y = max(40, min(height - card_h - 40, y_pos - card_h / 2))

        alpha = min(1.0, peek_depth * 1.8)

        # Deep ambient drop shadow casting onto desktop
        shadow_pat = cairo.RadialGradient(
            card_x + 80, card_y + card_h / 2 + 10, 10,
            card_x + 80, card_y + card_h / 2 + 10, card_w
        )
        shadow_pat.add_color_stop_rgba(0.0, 0.0, 0.0, 0.0, 0.55 * alpha)
        shadow_pat.add_color_stop_rgba(1.0, 0.0, 0.0, 0.0, 0.0)
        cr.set_source(shadow_pat)
        cr.rectangle(card_x - 30, card_y - 20, card_w + 40, card_h + 50)
        cr.fill()

        # Frosted glass card body
        rounded_rectangle(cr, card_x, card_y, card_w, card_h, 16)
        card_bg = cairo.LinearGradient(card_x, card_y, card_x + card_w, card_y + card_h)
        card_bg.add_color_stop_rgba(0.0, 0.08, 0.12, 0.18, 0.94 * alpha)
        card_bg.add_color_stop_rgba(1.0, 0.04, 0.06, 0.10, 0.98 * alpha)
        cr.set_source(card_bg)
        cr.fill_preserve()

        # Glowing specular glass rim
        border_pat = cairo.LinearGradient(card_x, card_y, card_x + card_w, card_y + card_h)
        border_pat.add_color_stop_rgba(0.0, 0.40, 0.85, 1.0, 0.85 * alpha)
        border_pat.add_color_stop_rgba(0.5, 0.80, 0.95, 0.40, 0.55 * alpha)
        border_pat.add_color_stop_rgba(1.0, 1.0, 1.0, 1.0, 0.80 * alpha)
        cr.set_source(border_pat)
        cr.set_line_width(1.8)
        cr.stroke()

        # Card Icon Badge
        icon_cx = card_x + 30
        icon_cy = card_y + card_h / 2
        icon_r = 18

        cr.arc(icon_cx, icon_cy, icon_r, 0, 2 * math.pi)
        icon_bg = cairo.LinearGradient(icon_cx - icon_r, icon_cy - icon_r, icon_cx + icon_r, icon_cy + icon_r)
        if self.peek_type == "document":
            icon_bg.add_color_stop_rgba(0.0, 0.05, 0.50, 0.95, 0.95 * alpha)
            icon_bg.add_color_stop_rgba(1.0, 0.02, 0.35, 0.80, 0.95 * alpha)
        elif self.peek_type == "video":
            icon_bg.add_color_stop_rgba(0.0, 0.85, 0.25, 0.55, 0.95 * alpha)
            icon_bg.add_color_stop_rgba(1.0, 0.60, 0.15, 0.85, 0.95 * alpha)
        else: # photo
            icon_bg.add_color_stop_rgba(0.0, 0.15, 0.85, 0.70, 0.95 * alpha)
            icon_bg.add_color_stop_rgba(1.0, 0.05, 0.55, 0.95, 0.95 * alpha)
        cr.set_source(icon_bg)
        cr.fill()

        # Inner Icon Glyph
        cr.set_source_rgba(1.0, 1.0, 1.0, 0.95 * alpha)
        if self.peek_type == "document":
            # Bar chart glyph
            for i, bh in enumerate([8, 14, 11, 18]):
                cr.rectangle(icon_cx - 8 + i * 4.5, icon_cy + 8 - bh, 3, bh)
            cr.fill()
        elif self.peek_type == "video":
            # Play triangle
            cr.move_to(icon_cx - 4, icon_cy - 7)
            cr.line_to(icon_cx + 7, icon_cy)
            cr.line_to(icon_cx - 4, icon_cy + 7)
            cr.close_path()
            cr.fill()
        else:
            # Photo camera / landscape diamond
            cr.arc(icon_cx, icon_cy, 6, 0, 2 * math.pi)
            cr.set_line_width(2.0)
            cr.stroke()

        # Pango Text: Filename
        title_text = self.peek_title if self.peek_title else "Receiving File..."
        layout = PangoCairo.create_layout(cr)
        layout.set_text(title_text, -1)
        font_title = Pango.font_description_from_string("Plus Jakarta Sans Bold 10")
        layout.set_font_description(font_title)
        layout.set_width(Pango.units_from_double(card_w - 75))
        layout.set_ellipsize(Pango.EllipsizeMode.MIDDLE)
        cr.move_to(card_x + 60, card_y + 18)
        cr.set_source_rgba(0.98, 0.99, 1.0, 0.98 * alpha)
        PangoCairo.show_layout(cr, layout)

        # Pango Text: Subtitle
        sub_layout = PangoCairo.create_layout(cr)
        sub_layout.set_text(f"Release to drop • {self.peek_size}", -1)
        font_sub = Pango.font_description_from_string("Plus Jakarta Sans 8")
        sub_layout.set_font_description(font_sub)
        sub_layout.set_width(Pango.units_from_double(card_w - 75))
        sub_layout.set_ellipsize(Pango.EllipsizeMode.END)
        cr.move_to(card_x + 60, card_y + 42)
        cr.set_source_rgba(0.65, 0.78, 0.92, 0.85 * alpha)
        PangoCairo.show_layout(cr, sub_layout)

        cr.restore()

    def _draw_fullscreen_confirm_wave(self, cr, width, height, y_pos, progress):
        """
        Full-screen chromatic wave blooming across the entire monitor when a transfer is confirmed.
        """
        cr.save()
        # Radius sweeps up to 2400px, engulfing the entire 1920x1080 display
        max_r = 2400
        radius = progress * max_r
        alpha = max(0.0, (1.0 - progress)) * 0.70

        wave_pat = cairo.RadialGradient(width, y_pos, max(0, radius - 480), width, y_pos, radius)
        wave_pat.add_color_stop_rgba(0.0, 0.0, 0.0, 0.0, 0.0)
        wave_pat.add_color_stop_rgba(0.4, 0.94, 0.98, 0.78, 0.45 * alpha)
        wave_pat.add_color_stop_rgba(0.75, 0.35, 0.85, 0.98, 0.55 * alpha)
        wave_pat.add_color_stop_rgba(0.92, 0.75, 0.55, 0.95, 0.35 * alpha)
        wave_pat.add_color_stop_rgba(1.0, 1.0, 1.0, 1.0, 0.0)

        cr.set_source(wave_pat)
        cr.rectangle(0, 0, width, height)
        cr.fill()
        cr.restore()

    def _draw_video_portal_shockwave(self, cr, width, height, y_pos, progress):
        """Chromatic portal ring expanding on video handoff."""
        cr.save()
        radius = progress * 750
        alpha = max(0.0, (1.0 - progress)) * 0.85

        cr.translate(width, y_pos)
        rip_pat = cairo.RadialGradient(0, 0, max(0, radius - 90), 0, 0, radius + 15)
        rip_pat.add_color_stop_rgba(0.0, 0.0, 0.0, 0.0, 0.0)
        rip_pat.add_color_stop_rgba(0.55, 0.1, 0.85, 0.95, alpha)
        rip_pat.add_color_stop_rgba(0.85, 0.9, 0.3, 0.9, alpha * 0.8)
        rip_pat.add_color_stop_rgba(1.0, 1.0, 1.0, 1.0, 0.0)
        cr.set_source(rip_pat)
        cr.arc(0, 0, radius + 15, 0, 2 * math.pi)
        cr.fill()
        cr.restore()

    def _draw_drop_card(self, cr, width, height):
        """Clean Apple-grade frosted confirmation card."""
        card_w = 280
        card_h = 76
        card_x = self.card_x
        card_y = max(50, min(height - card_h - 50, self.card_y * height - card_h / 2))

        alpha = 1.0
        if self.card_progress > 0.78:
            alpha = max(0.0, (1.0 - self.card_progress) / 0.22)

        cr.save()

        # Shadow
        shadow_pat = cairo.RadialGradient(
            card_x + card_w / 2, card_y + card_h / 2 + 8, 20,
            card_x + card_w / 2, card_y + card_h / 2 + 8, card_w / 1.4
        )
        shadow_pat.add_color_stop_rgba(0.0, 0.0, 0.0, 0.0, 0.45 * alpha)
        shadow_pat.add_color_stop_rgba(1.0, 0.0, 0.0, 0.0, 0.0)
        cr.set_source(shadow_pat)
        cr.rectangle(card_x - 30, card_y - 20, card_w + 60, card_h + 60)
        cr.fill()

        # Frosted Glass Card Body
        rounded_rectangle(cr, card_x, card_y, card_w, card_h, 16)
        card_bg = cairo.LinearGradient(card_x, card_y, card_x + card_w, card_y + card_h)
        card_bg.add_color_stop_rgba(0.0, 0.08, 0.12, 0.18, 0.94 * alpha)
        card_bg.add_color_stop_rgba(1.0, 0.04, 0.07, 0.12, 0.98 * alpha)
        cr.set_source(card_bg)
        cr.fill_preserve()

        # Subtle Chromatic Edge Border
        border_pat = cairo.LinearGradient(card_x, card_y, card_x + card_w, card_y + card_h)
        border_pat.add_color_stop_rgba(0.0, 0.2, 0.85, 1.0, 0.85 * alpha)
        border_pat.add_color_stop_rgba(0.5, 0.85, 0.95, 0.4, 0.65 * alpha)
        border_pat.add_color_stop_rgba(1.0, 0.95, 0.7, 0.9, 0.75 * alpha)
        cr.set_source(border_pat)
        cr.set_line_width(1.6)
        cr.stroke()

        # Icon Circle
        icon_cx = card_x + 30
        icon_cy = card_y + card_h / 2
        icon_r = 18
        cr.arc(icon_cx, icon_cy, icon_r, 0, 2 * math.pi)
        icon_bg = cairo.LinearGradient(icon_cx - icon_r, icon_cy - icon_r, icon_cx + icon_r, icon_cy + icon_r)
        icon_bg.add_color_stop_rgba(0.0, 0.0, 0.85, 0.6, 0.95 * alpha)
        icon_bg.add_color_stop_rgba(1.0, 0.0, 0.55, 0.95, 0.95 * alpha)
        cr.set_source(icon_bg)
        cr.fill()

        # Checkmark Icon
        cr.set_source_rgba(1.0, 1.0, 1.0, 0.95 * alpha)
        cr.set_line_width(2.4)
        cr.set_line_cap(cairo.LineCap.ROUND)
        cr.set_line_join(cairo.LineJoin.ROUND)
        cr.move_to(icon_cx - 6, icon_cy)
        cr.line_to(icon_cx - 2, icon_cy + 5)
        cr.line_to(icon_cx + 7, icon_cy - 5)
        cr.stroke()

        # Pango Text: Filename
        layout = PangoCairo.create_layout(cr)
        layout.set_text(self.card_filename, -1)
        font_title = Pango.font_description_from_string("Plus Jakarta Sans Bold 10")
        layout.set_font_description(font_title)
        layout.set_width(Pango.units_from_double(card_w - 75))
        layout.set_ellipsize(Pango.EllipsizeMode.MIDDLE)
        cr.move_to(card_x + 60, card_y + 18)
        cr.set_source_rgba(0.98, 0.99, 1.0, 0.98 * alpha)
        PangoCairo.show_layout(cr, layout)

        # Pango Text: Subtitle
        sub_layout = PangoCairo.create_layout(cr)
        sub_layout.set_text(f"Saved to ~/Downloads • {self.card_size_str}", -1)
        font_sub = Pango.font_description_from_string("Plus Jakarta Sans 8")
        sub_layout.set_font_description(font_sub)
        sub_layout.set_width(Pango.units_from_double(card_w - 75))
        sub_layout.set_ellipsize(Pango.EllipsizeMode.END)
        cr.move_to(card_x + 60, card_y + 42)
        cr.set_source_rgba(0.65, 0.78, 0.92, 0.85 * alpha)
        PangoCairo.show_layout(cr, sub_layout)

        cr.restore()

def main():
    Gtk.init()
    DrapOverlay()
    loop = GLib.MainLoop()
    try:
        loop.run()
    except KeyboardInterrupt:
        pass

if __name__ == "__main__":
    main()

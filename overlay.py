#!/usr/bin/env python3
"""
drap - Native Linux Spatial Transfer Overlay (Hyprland / Wayland)
Full-screen (1920x1080) click-through layer-shell overlay.

Features:
- Full suite of vibrant spatial effects:
    1. Aurora: Multi-spectral northern lights ribbons (cyan, lime, magenta, violet).
    2. Plasma: Cyberpunk neon electric plasma with crackling lightning tendrils.
    3. Solar: Molten solar flare with thermonuclear embers.
    4. Liquid: Alive fluid bubble with surface tension wobble and 3D specular highlight.
- Full-screen canvas (1920x1080) with 100% click-through (cairo.Region() input mask).
- Full-screen chromatic radiance wash on file drop confirmation.
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
        self.effect_theme = "aurora"  # Default: "aurora", "plasma", "solar", "liquid"

        # Time & Inactivity Watchdog
        self.start_time = time.time()
        self.last_tick = time.time()
        self.last_interaction_time = 0.0
        self.was_drawing = False

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

        # Anchor to ALL four edges -> Full Screen 1920x1080 (Zero edge clipping)
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
        print(f"[drap Overlay] Full-Screen GTK4 Layer Shell initialized with theme: {self.effect_theme}")

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

            self.edge_proximity = proximity
            self.target_pressure = pressure
            self.current_pressure += (pressure - self.current_pressure) * 0.45
            self.target_intensity = max(0.0, min(1.0, proximity)) if proximity > 0.02 else 0.0
            self.current_intensity += (self.target_intensity - self.current_intensity) * 0.45

            if "theme" in data:
                t = data["theme"].lower()
                if t in ("aurora", "plasma", "solar", "liquid"):
                    self.effect_theme = t

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
            self.drawing_area.queue_draw()

        elif msg_type == "set_effect":
            theme = data.get("theme", "aurora").lower()
            if theme in ("aurora", "plasma", "solar", "liquid"):
                self.effect_theme = theme
                print(f"[drap Overlay] Active effect theme changed to: {self.effect_theme}")
                self.target_intensity = 0.85
                self.current_intensity = 0.85
                self.last_interaction_time = time.time()
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
            self.trigger_drop_card(filename, size_str, self.target_y)
            self.target_intensity = 0.0
            self.drawing_area.queue_draw()

        elif msg_type == "video_resume":
            if "y" in data:
                self.target_y = float(data["y"])
            self.trigger_video_ripple(self.target_y)

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

        # Silky spring tracking
        self.current_y += (self.target_y - self.current_y) * 0.45

        if self.target_intensity <= 0.001:
            self.current_intensity *= 0.65
            if self.current_intensity < 0.004:
                self.current_intensity = 0.0
        else:
            self.current_intensity += (self.target_intensity - self.current_intensity) * 0.35

        self.current_pressure += (self.target_pressure - self.current_pressure) * 0.25

        needs_draw = False

        if self.current_intensity > 0.001 or self.target_intensity > 0.001:
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
        active_intensity = self.current_intensity

        # 2. Draw Active Spatial Edge Aura
        if active_intensity > 0.004:
            # Ambient sink glow
            self._draw_ambient_sink(cr, width, height, y_pos, active_intensity, t_sec)

            # Selected distinct thematic effect
            if self.effect_theme == "plasma":
                self._draw_plasma_effect(cr, width, y_pos, active_intensity, t_sec)
            elif self.effect_theme == "solar":
                self._draw_solar_effect(cr, width, y_pos, active_intensity, t_sec)
            elif self.effect_theme == "liquid":
                self._draw_liquid_effect(cr, width, y_pos, active_intensity, t_sec)
            else: # "aurora"
                self._draw_aurora_effect(cr, width, y_pos, active_intensity, t_sec)

        # 3. Full-Screen Confirmation Radiance Wave (When file share is confirmed)
        if self.confirm_active:
            self._draw_fullscreen_confirm_wave(cr, width, height, self.confirm_y * height, self.confirm_progress)

        # 4. Video Continuity Shockwave
        if self.ripple_active:
            self._draw_video_portal_shockwave(cr, width, height, self.ripple_y * height, self.ripple_progress)

        # 5. Dropped File Confirmation Card
        if self.card_active:
            self._draw_drop_card(cr, width, height)

    def _draw_ambient_sink(self, cr, width, height, y_pos, active_intensity, t_sec):
        """Soft, ethereal volumetric ambient edge wash across monitor without clipping."""
        cr.save()
        pressure_scale = 0.70 + self.current_pressure * 1.20
        sink_reach = (380 + active_intensity * 480) * pressure_scale

        cr.save()
        cr.translate(width, y_pos)
        cr.scale(1.0, 1.65)

        vol_pat = cairo.RadialGradient(0, 0, 15, 0, 0, sink_reach)
        if self.effect_theme == "liquid":
            vol_pat.add_color_stop_rgba(0.00, 0.15, 0.96, 0.90, 0.35 * active_intensity)
            vol_pat.add_color_stop_rgba(0.35, 0.08, 0.78, 0.88, 0.22 * active_intensity)
            vol_pat.add_color_stop_rgba(0.70, 0.04, 0.50, 0.75, 0.08 * active_intensity)
            vol_pat.add_color_stop_rgba(1.00, 0.0, 0.0, 0.0, 0.0)
        elif self.effect_theme == "plasma":
            vol_pat.add_color_stop_rgba(0.00, 0.95, 0.35, 0.95, 0.38 * active_intensity)
            vol_pat.add_color_stop_rgba(0.35, 0.65, 0.25, 0.90, 0.24 * active_intensity)
            vol_pat.add_color_stop_rgba(0.70, 0.20, 0.40, 0.75, 0.10 * active_intensity)
            vol_pat.add_color_stop_rgba(1.00, 0.0, 0.0, 0.0, 0.0)
        elif self.effect_theme == "solar":
            vol_pat.add_color_stop_rgba(0.00, 1.00, 0.85, 0.30, 0.38 * active_intensity)
            vol_pat.add_color_stop_rgba(0.35, 0.98, 0.48, 0.12, 0.24 * active_intensity)
            vol_pat.add_color_stop_rgba(0.70, 0.75, 0.18, 0.05, 0.08 * active_intensity)
            vol_pat.add_color_stop_rgba(1.00, 0.0, 0.0, 0.0, 0.0)
        else: # aurora
            vol_pat.add_color_stop_rgba(0.00, 0.30, 0.90, 1.00, 0.38 * active_intensity)
            vol_pat.add_color_stop_rgba(0.35, 0.85, 0.40, 0.92, 0.24 * active_intensity)
            vol_pat.add_color_stop_rgba(0.70, 0.25, 0.65, 0.85, 0.10 * active_intensity)
            vol_pat.add_color_stop_rgba(1.00, 0.0, 0.0, 0.0, 0.0)

        cr.set_source(vol_pat)
        cr.arc(0, 0, sink_reach, 0, 2 * math.pi)
        cr.fill()
        cr.restore()
        cr.restore()

    def _draw_aurora_effect(self, cr, width, y_pos, active_intensity, t_sec):
        """Vibrant multi-spectral Northern Lights ribbons and fluid meniscus."""
        cr.save()
        t_slow = t_sec * 0.90
        cr.translate(width, y_pos)
        cr.scale(1.0, 1.70)

        pressure_scale = 0.70 + self.current_pressure * 1.30
        outer_radius = (140 + active_intensity * 360) * pressure_scale + math.sin(t_slow * 2.8) * 14
        radial_pat = cairo.RadialGradient(0, 0, 5, 0, 0, outer_radius)

        radial_pat.add_color_stop_rgba(0.00, 1.0, 1.0, 1.0, 0.85 * active_intensity)
        radial_pat.add_color_stop_rgba(0.15, 1.0, 0.88, 0.35, 0.70 * active_intensity)
        radial_pat.add_color_stop_rgba(0.35, 0.95, 0.35, 0.75, 0.50 * active_intensity)
        radial_pat.add_color_stop_rgba(0.60, 0.55, 0.45, 0.98, 0.30 * active_intensity)
        radial_pat.add_color_stop_rgba(0.85, 0.08, 0.80, 0.95, 0.12 * active_intensity)
        radial_pat.add_color_stop_rgba(1.00, 0.0, 0.0, 0.0, 0.0)

        cr.set_source(radial_pat)
        cr.arc(0, 0, outer_radius, 0, 2 * math.pi)
        cr.fill()
        cr.restore()

        # Authentic Drooop Bézier fluid meniscus along bezel
        cr.save()
        wave_height = (220 + active_intensity * 240) * pressure_scale
        bulge_depth = (90 + active_intensity * 240) * pressure_scale + math.sin(t_sec * 3.4) * 12.0 * active_intensity
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

        fluid_pat = cairo.RadialGradient(width, y_pos, 5, width - bulge_depth * 0.45, y_pos, bulge_depth * 1.15)
        fluid_pat.add_color_stop_rgba(0.00, 1.0, 1.0, 1.0, 0.92 * active_intensity)
        fluid_pat.add_color_stop_rgba(0.25, 1.0, 0.88, 0.38, 0.72 * active_intensity)
        fluid_pat.add_color_stop_rgba(0.60, 0.88, 0.30, 0.82, 0.45 * active_intensity)
        fluid_pat.add_color_stop_rgba(0.85, 0.35, 0.78, 0.95, 0.18 * active_intensity)
        fluid_pat.add_color_stop_rgba(1.00, 0.0, 0.0, 0.0, 0.0)
        cr.set_source(fluid_pat)
        cr.fill_preserve()

        # Specular glowing rim stroke
        rim_stroke = cairo.LinearGradient(peak_x, y_pos, width, y_pos)
        rim_stroke.add_color_stop_rgba(0.0, 1.0, 1.0, 1.0, 0.98 * active_intensity)
        rim_stroke.add_color_stop_rgba(0.65, 0.45, 0.92, 1.0, 0.75 * active_intensity)
        rim_stroke.add_color_stop_rgba(1.0, 0.10, 0.50, 0.90, 0.0)
        cr.set_source(rim_stroke)
        cr.set_line_width(2.8)
        cr.stroke()
        cr.restore()

    def _draw_plasma_effect(self, cr, width, y_pos, active_intensity, t_sec):
        """Cyberpunk Neon Plasma with vivid crackling electric lightning tendrils."""
        cr.save()
        cr.translate(width, y_pos)

        pressure_scale = 0.70 + self.current_pressure * 1.50
        r_aura = (160 + active_intensity * 420) * pressure_scale
        plasma_pat = cairo.RadialGradient(0, 0, 5, 0, 0, r_aura)
        plasma_pat.add_color_stop_rgba(0.00, 1.0, 1.0, 1.0, 0.98 * active_intensity)
        plasma_pat.add_color_stop_rgba(0.22, 0.72, 0.35, 0.98, 0.88 * active_intensity)
        plasma_pat.add_color_stop_rgba(0.55, 0.98, 0.28, 0.60, 0.65 * active_intensity)
        plasma_pat.add_color_stop_rgba(1.00, 0.10, 0.05, 0.20, 0.0)
        cr.set_source(plasma_pat)
        cr.scale(1.0, 1.65)
        cr.arc(0, 0, r_aura, 0, 2 * math.pi)
        cr.fill()
        cr.restore()

        # Crackling electric lightning tendrils
        cr.save()
        cr.set_line_cap(cairo.LineCap.ROUND)
        for branch in range(5):
            cr.new_path()
            cr.move_to(width, y_pos)
            curr_x = width
            curr_y = y_pos
            length = (140 + active_intensity * 320) * (0.7 + 0.3 * math.sin(t_sec * 12.0 + branch * 1.5)) * pressure_scale
            segs = 10
            for s in range(segs):
                curr_x -= length / segs
                jitter = math.sin(t_sec * 25.0 + s * 4.0 + branch * 3.0) * 24.0 * pressure_scale
                curr_y += jitter
                cr.line_to(curr_x, curr_y)

            cr.set_line_width((2.4 + (branch == 0) * 1.8) * pressure_scale)
            cr.set_source_rgba(0.35, 0.96, 1.0, 0.92 * active_intensity)
            cr.stroke()
        cr.restore()

    def _draw_solar_effect(self, cr, width, y_pos, active_intensity, t_sec):
        """Molten Solar Flare & Thermonuclear Embers."""
        cr.save()
        cr.translate(width, y_pos)
        cr.scale(1.0, 1.75)

        pressure_scale = 0.70 + self.current_pressure * 1.50
        r_solar = (150 + active_intensity * 400) * pressure_scale + math.sin(t_sec * 5.0) * 16
        solar_pat = cairo.RadialGradient(0, 0, 5, 0, 0, r_solar)
        solar_pat.add_color_stop_rgba(0.00, 1.0, 1.0, 0.90, 0.98 * active_intensity)
        solar_pat.add_color_stop_rgba(0.18, 1.0, 0.78, 0.12, 0.92 * active_intensity)
        solar_pat.add_color_stop_rgba(0.45, 0.96, 0.38, 0.06, 0.82 * active_intensity)
        solar_pat.add_color_stop_rgba(0.75, 0.72, 0.12, 0.05, 0.52 * active_intensity)
        solar_pat.add_color_stop_rgba(1.00, 0.15, 0.02, 0.02, 0.0)

        cr.set_source(solar_pat)
        cr.arc(0, 0, r_solar, 0, 2 * math.pi)
        cr.fill()
        cr.restore()

        # Rising embers
        cr.save()
        for idx in range(8):
            phase = idx * 1.1
            ember_y = y_pos - ((t_sec * 70 + phase * 40) % 240) + 60
            ember_x = width - (20 + idx * 18 + math.sin(t_sec * 3.0 + phase) * 16) * active_intensity * pressure_scale
            ember_r = (2.2 + (idx % 3)) * active_intensity * pressure_scale
            cr.arc(ember_x, ember_y, ember_r, 0, 2 * math.pi)
            cr.set_source_rgba(1.0, 0.88, 0.35, 0.95 * active_intensity)
            cr.fill()
        cr.restore()

    def _draw_liquid_effect(self, cr, width, y_pos, active_intensity, t_sec):
        """Alive, organic fluid bubble with lively surface tension wobble and 3D highlight."""
        cr.save()
        pressure_scale = 0.70 + self.current_pressure * 1.25
        base_radius = (110 + active_intensity * 260) * pressure_scale

        cr.save()
        cr.translate(width, y_pos)
        cr.new_path()
        steps = 48
        for i in range(steps + 1):
            theta = (math.pi / 2.0) + (math.pi * i / steps)
            w1 = 0.065 * math.sin(theta * 2.5 + t_sec * 3.4)
            w2 = 0.035 * math.sin(theta * 4.5 - t_sec * 2.1)
            w3 = 0.020 * math.cos(theta * 1.5 + t_sec * 1.2)
            wobble = (w1 + w2 + w3) * (0.35 + 0.65 * active_intensity)
            r = base_radius * (1.0 + wobble)
            x = r * math.cos(theta)
            y = r * math.sin(theta) * (1.45 + 0.12 * math.sin(t_sec * 2.4))
            if i == 0:
                cr.move_to(x, y)
            else:
                cr.line_to(x, y)
        cr.line_to(0, base_radius * 1.55)
        cr.close_path()

        # Viscous, vibrant cyan-teal liquid gradient
        liquid_pat = cairo.RadialGradient(0, 0, 8, 0, 0, base_radius * 1.15)
        liquid_pat.add_color_stop_rgba(0.00, 0.98, 1.00, 1.00, 0.80 * active_intensity)
        liquid_pat.add_color_stop_rgba(0.22, 0.25, 0.95, 0.88, 0.65 * active_intensity)
        liquid_pat.add_color_stop_rgba(0.50, 0.08, 0.75, 0.92, 0.45 * active_intensity)
        liquid_pat.add_color_stop_rgba(0.80, 0.03, 0.45, 0.75, 0.18 * active_intensity)
        liquid_pat.add_color_stop_rgba(1.00, 0.0, 0.0, 0.0, 0.0)

        cr.set_source(liquid_pat)
        cr.fill()

        # Specular 3D fluid core highlight
        core_r = base_radius * 0.48
        core_pat = cairo.RadialGradient(-core_r * 0.35, 0, 5, 0, 0, core_r)
        core_pat.add_color_stop_rgba(0.00, 1.0, 1.0, 1.0, 0.85 * active_intensity)
        core_pat.add_color_stop_rgba(0.25, 0.60, 1.0, 0.95, 0.65 * active_intensity)
        core_pat.add_color_stop_rgba(0.60, 0.12, 0.85, 0.80, 0.25 * active_intensity)
        core_pat.add_color_stop_rgba(1.00, 0.0, 0.0, 0.0, 0.0)
        cr.set_source(core_pat)
        cr.scale(1.0, 1.35)
        cr.arc(0, 0, core_r, 0, 2 * math.pi)
        cr.fill()
        cr.restore()

        # Glowing rim meniscus along bezel
        cr.save()
        rim_pat = cairo.LinearGradient(width - 5, 0, width, 0)
        rim_pat.add_color_stop_rgba(0.0, 0.1, 0.9, 0.8, 0.0)
        rim_pat.add_color_stop_rgba(1.0, 0.95, 1.0, 1.0, 0.95 * active_intensity)
        cr.set_source(rim_pat)
        rim_h = 240 * pressure_scale
        cr.rectangle(width - 4, y_pos - rim_h / 2, 4, rim_h)
        cr.fill()
        cr.restore()
        cr.restore()

    def _draw_fullscreen_confirm_wave(self, cr, width, height, y_pos, progress):
        """Full-screen chromatic wave blooming across entire monitor on confirmation."""
        cr.save()
        max_r = 2400
        radius = progress * max_r
        alpha = max(0.0, (1.0 - progress)) * 0.70

        wave_pat = cairo.RadialGradient(width, y_pos, max(0, radius - 480), width, y_pos, radius)
        wave_pat.add_color_stop_rgba(0.0, 0.0, 0.0, 0.0, 0.0)
        if self.effect_theme == "plasma":
            wave_pat.add_color_stop_rgba(0.4, 0.95, 0.25, 0.85, 0.45 * alpha)
            wave_pat.add_color_stop_rgba(0.75, 0.45, 0.25, 0.98, 0.60 * alpha)
        elif self.effect_theme == "solar":
            wave_pat.add_color_stop_rgba(0.4, 1.0, 0.75, 0.15, 0.50 * alpha)
            wave_pat.add_color_stop_rgba(0.75, 0.95, 0.35, 0.05, 0.60 * alpha)
        else: # aurora & liquid
            wave_pat.add_color_stop_rgba(0.4, 0.15, 0.92, 0.98, 0.45 * alpha)
            wave_pat.add_color_stop_rgba(0.75, 0.85, 0.35, 0.95, 0.55 * alpha)
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

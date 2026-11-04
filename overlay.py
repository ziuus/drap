#!/usr/bin/env python3
"""
Drooop for Linux (Hyprland/Wayland) - Hyprland Edge Aurora Overlay
Draws an iridescent chromatic radial glow and drop animation on the right monitor edge (eDP-1)
using gtk4-layer-shell + Cairo.
"""

import os
import sys
import time
import math
import json
import threading
import subprocess
from pathlib import Path

# Ensure D-Bus session bus is available for notifications
if os.environ.get("DBUS_SESSION_BUS_ADDRESS") in (None, "", "disabled:"):
    bus_path = f"/run/user/{os.getuid()}/bus"
    if os.path.exists(bus_path):
        os.environ["DBUS_SESSION_BUS_ADDRESS"] = f"unix:path={bus_path}"

import gi
gi.require_version('Gtk', '4.0')
gi.require_version('Gtk4LayerShell', '1.0')
gi.require_version('Pango', '1.0')
gi.require_version('PangoCairo', '1.0')
from gi.repository import Gtk, Gdk, Gtk4LayerShell, GLib, Pango, PangoCairo
import cairo
from websockets.sync.client import connect

OVERLAY_WIDTH = 950
WS_URL = "ws://127.0.0.1:8080/ws"

def rounded_rectangle(cr, x, y, width, height, radius):
    """Draw a smooth rounded rectangle path in Cairo."""
    cr.new_sub_path()
    cr.arc(x + width - radius, y + radius, radius, -math.pi / 2, 0)
    cr.arc(x + width - radius, y + height - radius, radius, 0, math.pi / 2)
    cr.arc(x + radius, y + height - radius, radius, math.pi / 2, math.pi)
    cr.arc(x + radius, y + radius, radius, math.pi, 3 * math.pi / 2)
    cr.close_path()

class DrooopOverlay:
    def __init__(self):
        self.running = True
        self.target_y = 0.5
        self.current_y = 0.5
        self.target_intensity = 0.0
        self.current_intensity = 0.0
        self.target_pressure = 0.5
        self.current_pressure = 0.5
        self.edge_proximity = 0.0
        self.item_type = "file"
        self.effect_theme = "liquid"  # Options: "liquid", "aurora", "plasma", "solar"
        
        # Drop Card Animation State
        self.card_active = False
        self.card_progress = 0.0      # 0.0 to 1.0 (phase: in, hold, out)
        self.card_x = OVERLAY_WIDTH
        self.card_y = 0.5
        self.card_filename = ""
        self.card_size_str = ""
        self.card_start_time = 0.0
        self.card_duration = 3.2      # seconds
        
        # Video continuity ripple state
        self.ripple_active = False
        self.ripple_progress = 0.0
        self.ripple_y = 0.5
        
        # Time tracking
        self.start_time = time.time()
        self.last_tick = time.time()
        self.last_interaction_time = 0.0
        self.is_interacting = False
        self.was_drawing = False

        self._setup_window()
        self._start_ws_client()

    def _setup_window(self):
        # Configure GTK4 CSS for zero background opacity
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
        self.window.set_title("Drooop Aurora Overlay")

        # Initialize Layer Shell
        Gtk4LayerShell.init_for_window(self.window)
        Gtk4LayerShell.set_layer(self.window, Gtk4LayerShell.Layer.OVERLAY)
        Gtk4LayerShell.set_namespace(self.window, "drooop-aurora")

        # Anchor to right edge, covering full height
        Gtk4LayerShell.set_anchor(self.window, Gtk4LayerShell.Edge.TOP, True)
        Gtk4LayerShell.set_anchor(self.window, Gtk4LayerShell.Edge.BOTTOM, True)
        Gtk4LayerShell.set_anchor(self.window, Gtk4LayerShell.Edge.RIGHT, True)
        Gtk4LayerShell.set_anchor(self.window, Gtk4LayerShell.Edge.LEFT, False)

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

        self.window.set_default_size(OVERLAY_WIDTH, 1080)

        # Cairo Drawing Area
        self.drawing_area = Gtk.DrawingArea()
        self.drawing_area.set_draw_func(self._on_draw)
        self.drawing_area.add_tick_callback(self._on_tick)
        self.window.set_child(self.drawing_area)

        self.window.realize()
        # Enable full mouse click-through
        surface = self.window.get_native().get_surface()
        empty_region = cairo.Region()
        surface.set_input_region(empty_region)

        self.window.present()
        print("[Drooop Overlay] GTK4 Layer Shell Overlay initialized on right bezel.")

    def _start_ws_client(self):
        t = threading.Thread(target=self._ws_loop, daemon=True)
        t.start()

    def _ws_loop(self):
        while self.running:
            try:
                with connect(WS_URL) as ws:
                    print(f"[Drooop Overlay] Connected to signaling daemon at {WS_URL}")
                    while self.running:
                        msg_str = ws.recv()
                        try:
                            data = json.loads(msg_str)
                            GLib.idle_add(self._handle_ws_message, data)
                        except json.JSONDecodeError:
                            continue
            except Exception as e:
                time.sleep(1.0)

    def _handle_ws_message(self, data):
        msg_type = data.get("type", "")

        if msg_type == "drag_move":
            self.last_interaction_time = time.time()
            self.is_interacting = True
            if "y" in data:
                self.target_y = float(data["y"])
                # Silky critically-damped spring follow (buttery smooth and responsive)
                self.current_y += (self.target_y - self.current_y) * 0.65

            proximity = float(data.get("proximity", 0.0))
            pressure = float(data.get("pressure", 0.5))
            self.edge_proximity = proximity
            self.target_pressure = pressure
            self.current_pressure += (pressure - self.current_pressure) * 0.50
            # Target intensity is strictly 0 when not dragging or when proximity is minimal
            self.target_intensity = max(0.0, min(1.0, proximity)) if proximity > 0.02 else 0.0
            self.current_intensity += (self.target_intensity - self.current_intensity) * 0.45
            self.item_type = data.get("item_type", "file")
            self.drawing_area.queue_draw()

        elif msg_type == "drag_edge_enter":
            self.last_interaction_time = time.time()
            self.is_interacting = True
            if "y" in data:
                self.target_y = float(data["y"])
                self.current_y = self.target_y
            self.target_intensity = 0.85
            self.current_intensity = 0.85
            self.edge_proximity = 0.85
            self.drawing_area.queue_draw()

        elif msg_type == "drag_edge_leave":
            self.is_interacting = False
            self.target_intensity = 0.0
            self.edge_proximity = 0.0
            self.target_pressure = 0.5
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

            self.trigger_drop_card(filename, size_str, self.target_y)
            # Brief chromatic flare on drop
            self.target_intensity = 1.0
            GLib.timeout_add(300, lambda: setattr(self, "target_intensity", 0.0))

        elif msg_type == "set_effect":
            theme = data.get("theme", "liquid").lower()
            if theme in ("liquid", "aurora", "plasma", "solar"):
                self.effect_theme = theme
                print(f"[Drooop Overlay] Switched ambient effect theme to: {self.effect_theme}")

        elif msg_type == "video_resume":
            if "y" in data:
                self.target_y = float(data["y"])
            self.trigger_video_ripple(self.target_y)

    def trigger_drop_card(self, filename: str, size_str: str, y: float):
        self.card_active = True
        self.card_filename = filename
        self.card_size_str = size_str
        self.card_y = max(0.1, min(0.9, y))
        self.card_start_time = time.time()
        self.card_progress = 0.0

    def trigger_video_ripple(self, y: float):
        self.ripple_active = True
        self.ripple_y = max(0.1, min(0.9, y))
        self.ripple_progress = 0.0

    def _on_tick(self, widget, frame_clock, *args):
        now = time.time()
        dt = max(0.001, min(0.1, now - self.last_tick))
        self.last_tick = now

        # Inactivity watchdog: if no drag_move received for > 0.35s and not in special drop/ripple animation, reset target_intensity
        if self.is_interacting and (now - self.last_interaction_time > 0.35):
            self.is_interacting = False
            self.target_intensity = 0.0
            self.edge_proximity = 0.0

        # Butter-smooth critically damped tracking
        self.current_y += (self.target_y - self.current_y) * 0.45
        
        if self.target_intensity <= 0.001:
            # Quick decay to zero when idle/released
            self.current_intensity *= 0.80
            if self.current_intensity < 0.005:
                self.current_intensity = 0.0
        else:
            self.current_intensity += (self.target_intensity - self.current_intensity) * 0.25

        self.current_pressure += (self.target_pressure - self.current_pressure) * 0.22

        needs_draw = False

        if self.current_intensity > 0.001 or self.target_intensity > 0.001:
            needs_draw = True
            self.was_drawing = True
        elif self.was_drawing:
            # One final frame to completely clear the surface to 100% transparency
            self.was_drawing = False
            needs_draw = True

        # Drop card animation progress
        if self.card_active:
            needs_draw = True
            elapsed = now - self.card_start_time
            if elapsed >= self.card_duration:
                self.card_active = False
                self.card_progress = 0.0
            else:
                # 3 Phases: In (0.0 -> 0.25), Hold (0.25 -> 0.8), Out (0.8 -> 1.0)
                norm = elapsed / self.card_duration
                self.card_progress = norm
                if norm < 0.25:
                    # Ease-out back / bounce in
                    t = norm / 0.25
                    c1 = 1.70158
                    c3 = c1 + 1
                    ease_in = 1 + c3 * math.pow(t - 1, 3) + c1 * math.pow(t - 1, 2)
                    self.card_x = OVERLAY_WIDTH - (ease_in * 300)
                elif norm < 0.80:
                    self.card_x = OVERLAY_WIDTH - 300
                else:
                    # Ease-out fade away
                    t = (norm - 0.80) / 0.20
                    self.card_x = (OVERLAY_WIDTH - 300) + (t * t * 320)

        # Video continuity ripple
        if self.ripple_active:
            needs_draw = True
            self.ripple_progress += dt * 1.5
            if self.ripple_progress >= 1.0:
                self.ripple_active = False
                self.ripple_progress = 0.0

        if needs_draw:
            widget.queue_draw()

        return GLib.SOURCE_CONTINUE

    def _on_draw(self, area, cr, width, height, *args):
        # Clear background completely
        cr.set_source_rgba(0, 0, 0, 0)
        cr.set_operator(cairo.Operator.CLEAR)
        cr.paint()
        cr.set_operator(cairo.Operator.OVER)

        t_sec = time.time() - self.start_time
        y_pos = self.current_y * height

        # 1. Draw Active Ambient Bezel Effect (Liquid, Aurora, Plasma, or Solar)
        if self.current_intensity > 0.005:
            intensity = self.current_intensity
            shimmer = math.sin(t_sec * 6.0) * 0.06
            active_intensity = max(0.0, min(1.0, intensity + shimmer))

            # Draw giant volumetric ambient wash so display sinks into the effect
            self._draw_ambient_sink(cr, width, height, y_pos, active_intensity, t_sec)

            if self.effect_theme == "liquid":
                self._draw_liquid_effect(cr, width, y_pos, active_intensity, t_sec)
            elif self.effect_theme == "plasma":
                self._draw_plasma_effect(cr, width, y_pos, active_intensity, t_sec)
            elif self.effect_theme == "solar":
                self._draw_solar_effect(cr, width, y_pos, active_intensity, t_sec)
            else:
                self._draw_aurora_effect(cr, width, y_pos, active_intensity, t_sec)

        # 2. Draw Video Continuity Portal Shockwave
        if self.ripple_active:
            r_y = self.ripple_y * height
            rip_radius = self.ripple_progress * 280
            alpha = max(0.0, (1.0 - self.ripple_progress)) * 0.8

            cr.save()
            cr.translate(width, r_y)
            rip_pat = cairo.RadialGradient(0, 0, max(0, rip_radius - 35), 0, 0, rip_radius + 5)
            rip_pat.add_color_stop_rgba(0.0, 0.0, 0.0, 0.0, 0.0)
            rip_pat.add_color_stop_rgba(0.6, 0.2, 0.8, 1.0, alpha)
            rip_pat.add_color_stop_rgba(0.85, 0.9, 0.3, 0.8, alpha * 0.9)
            rip_pat.add_color_stop_rgba(1.0, 1.0, 1.0, 1.0, 0.0)
            cr.set_source(rip_pat)
            cr.arc(0, 0, rip_radius + 5, 0, 2 * math.pi)
            cr.fill()
            cr.restore()

        # 3. Draw Drop Confirmation Card
        if self.card_active:
            card_w = 275
            card_h = 76
            card_x = self.card_x
            card_y = max(40, min(height - card_h - 40, self.card_y * height - card_h / 2))

            # Opacity fade during exit
            alpha = 1.0
            if self.card_progress > 0.80:
                alpha = max(0.0, (1.0 - self.card_progress) / 0.20)

            cr.save()
            # Drop shadow
            shadow_pat = cairo.RadialGradient(card_x + card_w / 2, card_y + card_h / 2 + 6, 20,
                                              card_x + card_w / 2, card_y + card_h / 2 + 6, card_w / 1.5)
            shadow_pat.add_color_stop_rgba(0.0, 0.0, 0.0, 0.0, 0.45 * alpha)
            shadow_pat.add_color_stop_rgba(1.0, 0.0, 0.0, 0.0, 0.0)
            cr.set_source(shadow_pat)
            cr.rectangle(card_x - 30, card_y - 20, card_w + 60, card_h + 60)
            cr.fill()

            # Frosted glass card body
            rounded_rectangle(cr, card_x, card_y, card_w, card_h, 16)
            card_bg = cairo.LinearGradient(card_x, card_y, card_x + card_w, card_y + card_h)
            card_bg.add_color_stop_rgba(0.0, 0.08, 0.12, 0.18, 0.92 * alpha)
            card_bg.add_color_stop_rgba(1.0, 0.04, 0.07, 0.12, 0.96 * alpha)
            cr.set_source(card_bg)
            cr.fill_preserve()

            # Glass chromatic border highlight
            border_pat = cairo.LinearGradient(card_x, card_y, card_x + card_w, card_y + card_h)
            border_pat.add_color_stop_rgba(0.0, 0.2, 0.85, 1.0, 0.8 * alpha)
            border_pat.add_color_stop_rgba(0.5, 0.85, 0.3, 0.9, 0.6 * alpha)
            border_pat.add_color_stop_rgba(1.0, 0.95, 0.7, 0.2, 0.8 * alpha)
            cr.set_source(border_pat)
            cr.set_line_width(1.5)
            cr.stroke()

            # Icon circle on the left
            icon_cx = card_x + 28
            icon_cy = card_y + card_h / 2
            icon_r = 18
            cr.arc(icon_cx, icon_cy, icon_r, 0, 2 * math.pi)
            icon_bg = cairo.LinearGradient(icon_cx - icon_r, icon_cy - icon_r, icon_cx + icon_r, icon_cy + icon_r)
            icon_bg.add_color_stop_rgba(0.0, 0.0, 0.85, 0.6, 0.9 * alpha)
            icon_bg.add_color_stop_rgba(1.0, 0.0, 0.55, 0.95, 0.9 * alpha)
            cr.set_source(icon_bg)
            cr.fill()

            # Draw Checkmark / Arrow glyph
            cr.set_source_rgba(1.0, 1.0, 1.0, 0.95 * alpha)
            cr.set_line_width(2.4)
            cr.set_line_cap(cairo.LineCap.ROUND)
            cr.set_line_join(cairo.LineJoin.ROUND)
            cr.move_to(icon_cx - 6, icon_cy)
            cr.line_to(icon_cx - 2, icon_cy + 5)
            cr.line_to(icon_cx + 7, icon_cy - 5)
            cr.stroke()

            # Filename Label using Pango
            layout = PangoCairo.create_layout(cr)
            layout.set_text(self.card_filename, -1)
            font_title = Pango.font_description_from_string("Inter Bold 10")
            layout.set_font_description(font_title)
            layout.set_width(Pango.units_from_double(card_w - 75))
            layout.set_ellipsize(Pango.EllipsizeMode.MIDDLE)
            cr.move_to(card_x + 58, card_y + 16)
            cr.set_source_rgba(0.95, 0.97, 1.0, 0.98 * alpha)
            PangoCairo.show_layout(cr, layout)

            # Subtitle & Size
            sub_layout = PangoCairo.create_layout(cr)
            sub_layout.set_text(f"Saved to ~/Downloads • {self.card_size_str}", -1)
            font_sub = Pango.font_description_from_string("Inter 8")
            sub_layout.set_font_description(font_sub)
            sub_layout.set_width(Pango.units_from_double(card_w - 75))
            sub_layout.set_ellipsize(Pango.EllipsizeMode.END)
            cr.move_to(card_x + 58, card_y + 40)
            cr.set_source_rgba(0.60, 0.70, 0.85, 0.85 * alpha)
            PangoCairo.show_layout(cr, sub_layout)

            cr.restore()

    def _draw_ambient_sink(self, cr, width, height, y_pos, active_intensity, t_sec):
        """Massive volumetric ambient wash sinking deep into the display wallpaper."""
        cr.save()
        t_slow = t_sec * 0.85
        pressure_scale = 0.70 + self.current_pressure * 1.60
        sink_reach = min(width - 15, int(400 + active_intensity * 500 * pressure_scale))

        # Giant Volumetric Soft Ambient Radiance (sweeping up to 900px across the desktop)
        cr.save()
        cr.translate(width, y_pos)
        cr.scale(1.0, 1.85)

        vol_radius = sink_reach * 0.95
        vol_pat = cairo.RadialGradient(0, 0, 15, 0, 0, vol_radius)

        if self.effect_theme == "liquid":
            # Rich oceanic teal & luminous cyan fluid radiance
            vol_pat.add_color_stop_rgba(0.00, 0.15, 0.96, 0.90, 0.52 * active_intensity)
            vol_pat.add_color_stop_rgba(0.25, 0.08, 0.78, 0.88, 0.38 * active_intensity)
            vol_pat.add_color_stop_rgba(0.55, 0.04, 0.50, 0.75, 0.22 * active_intensity)
            vol_pat.add_color_stop_rgba(0.85, 0.02, 0.25, 0.45, 0.08 * active_intensity)
            vol_pat.add_color_stop_rgba(1.00, 0.0, 0.0, 0.0, 0.0)
        elif self.effect_theme == "plasma":
            vol_pat.add_color_stop_rgba(0.00, 0.95, 0.35, 0.95, 0.55 * active_intensity)
            vol_pat.add_color_stop_rgba(0.30, 0.65, 0.25, 0.90, 0.38 * active_intensity)
            vol_pat.add_color_stop_rgba(0.65, 0.20, 0.40, 0.75, 0.18 * active_intensity)
            vol_pat.add_color_stop_rgba(1.00, 0.0, 0.0, 0.0, 0.0)
        elif self.effect_theme == "solar":
            vol_pat.add_color_stop_rgba(0.00, 1.00, 0.85, 0.30, 0.55 * active_intensity)
            vol_pat.add_color_stop_rgba(0.30, 0.98, 0.48, 0.12, 0.40 * active_intensity)
            vol_pat.add_color_stop_rgba(0.65, 0.75, 0.18, 0.05, 0.18 * active_intensity)
            vol_pat.add_color_stop_rgba(1.00, 0.0, 0.0, 0.0, 0.0)
        else: # aurora
            vol_pat.add_color_stop_rgba(0.00, 0.30, 0.90, 1.00, 0.55 * active_intensity)
            vol_pat.add_color_stop_rgba(0.28, 0.85, 0.40, 0.92, 0.38 * active_intensity)
            vol_pat.add_color_stop_rgba(0.60, 0.25, 0.65, 0.85, 0.20 * active_intensity)
            vol_pat.add_color_stop_rgba(1.00, 0.0, 0.0, 0.0, 0.0)

        cr.set_source(vol_pat)
        cr.arc(0, 0, vol_radius, 0, 2 * math.pi)
        cr.fill()
        cr.restore()
        cr.restore()

    def _draw_aurora_effect(self, cr, width, y_pos, active_intensity, t_sec):
        cr.save()
        t_slow = t_sec * 0.85
        cr.translate(width, y_pos)
        cr.scale(1.0, 1.85)

        pressure_scale = 0.70 + self.current_pressure * 1.60
        outer_radius = (140 + active_intensity * 380) * pressure_scale + math.sin(t_slow * 2.8) * 12
        radial_pat = cairo.RadialGradient(0, 0, 5, 0, 0, outer_radius)

        radial_pat.add_color_stop_rgba(0.00, 1.0, 1.0, 1.0, 0.75 * active_intensity)
        radial_pat.add_color_stop_rgba(0.12, 1.0, 0.85, 0.35, 0.65 * active_intensity)
        radial_pat.add_color_stop_rgba(0.30, 0.95, 0.35, 0.75, 0.55 * active_intensity)
        radial_pat.add_color_stop_rgba(0.55, 0.55, 0.45, 0.98, 0.38 * active_intensity)
        radial_pat.add_color_stop_rgba(0.80, 0.08, 0.80, 0.95, 0.20 * active_intensity)
        radial_pat.add_color_stop_rgba(1.00, 0.0, 0.0, 0.0, 0.0)

        cr.set_source(radial_pat)
        cr.arc(0, 0, outer_radius, 0, 2 * math.pi)
        cr.fill()
        cr.restore()

        # Dynamic Bezel rim light
        rim_pat = cairo.LinearGradient(width - 4, 0, width, 0)
        rim_pat.add_color_stop_rgba(0.0, 0.2, 0.8, 1.0, 0.0)
        rim_pat.add_color_stop_rgba(1.0, 1.0, 1.0, 1.0, 0.85 * active_intensity)
        cr.set_source(rim_pat)
        rim_h = 240 * pressure_scale
        cr.rectangle(width - 3, y_pos - rim_h / 2, 3, rim_h)
        cr.fill()

    def _draw_liquid_effect(self, cr, width, y_pos, active_intensity, t_sec):
        """Alive, organic fluid bubble with lively surface tension wobble and massive desktop reach."""
        cr.save()
        pressure_scale = 0.70 + self.current_pressure * 1.60
        base_radius = (150 + active_intensity * 440) * pressure_scale

        # 1. Lively organic fluid meniscus path with harmonious liquid wobble
        cr.save()
        cr.translate(width, y_pos)
        cr.new_path()
        steps = 64
        for i in range(steps + 1):
            theta = (math.pi / 2.0) + (math.pi * i / steps)
            # Three harmonic ripples creating an organic living liquid wave (alive without chaotic jitter)
            w1 = 0.075 * math.sin(theta * 2.5 + t_sec * 3.4)
            w2 = 0.040 * math.sin(theta * 4.5 - t_sec * 2.1)
            w3 = 0.025 * math.cos(theta * 1.5 + t_sec * 1.2)
            wobble = (w1 + w2 + w3) * (0.35 + 0.65 * active_intensity)
            r = base_radius * (1.0 + wobble)
            x = r * math.cos(theta)
            # Dynamic vertical stretch flexing with movement
            y = r * math.sin(theta) * (1.45 + 0.12 * math.sin(t_sec * 2.4))
            if i == 0:
                cr.move_to(x, y)
            else:
                cr.line_to(x, y)
        cr.line_to(0, base_radius * 1.55)
        cr.close_path()

        # Viscous, vibrant cyan-teal liquid gradient
        liquid_pat = cairo.RadialGradient(0, 0, 8, 0, 0, base_radius * 1.15)
        liquid_pat.add_color_stop_rgba(0.00, 0.98, 1.00, 1.00, 0.75 * active_intensity)
        liquid_pat.add_color_stop_rgba(0.20, 0.25, 0.95, 0.88, 0.62 * active_intensity)
        liquid_pat.add_color_stop_rgba(0.48, 0.08, 0.75, 0.92, 0.45 * active_intensity)
        liquid_pat.add_color_stop_rgba(0.78, 0.03, 0.45, 0.75, 0.22 * active_intensity)
        liquid_pat.add_color_stop_rgba(1.00, 0.0, 0.0, 0.0, 0.0)

        cr.set_source(liquid_pat)
        cr.fill()

        # Specular 3D fluid core highlight
        core_r = base_radius * 0.52
        core_pat = cairo.RadialGradient(-core_r * 0.35, 0, 5, 0, 0, core_r)
        core_pat.add_color_stop_rgba(0.00, 1.0, 1.0, 1.0, 0.85 * active_intensity)
        core_pat.add_color_stop_rgba(0.22, 0.60, 1.0, 0.95, 0.70 * active_intensity)
        core_pat.add_color_stop_rgba(0.58, 0.12, 0.85, 0.80, 0.32 * active_intensity)
        core_pat.add_color_stop_rgba(1.00, 0.0, 0.0, 0.0, 0.0)
        cr.set_source(core_pat)
        cr.scale(1.0, 1.35)
        cr.arc(0, 0, core_r, 0, 2 * math.pi)
        cr.fill()
        cr.restore()

        # 2. Glowing rim meniscus along bezel
        cr.save()
        rim_pat = cairo.LinearGradient(width - 5, 0, width, 0)
        rim_pat.add_color_stop_rgba(0.0, 0.1, 0.9, 0.8, 0.0)
        rim_pat.add_color_stop_rgba(1.0, 0.95, 1.0, 1.0, 0.90 * active_intensity)
        cr.set_source(rim_pat)
        rim_h = 240 * pressure_scale
        cr.rectangle(width - 4, y_pos - rim_h / 2, 4, rim_h)
        cr.fill()
        cr.restore()

        cr.restore()

    def _draw_plasma_effect(self, cr, width, y_pos, active_intensity, t_sec):
        """Cyberpunk Neon Plasma / High-Voltage Lightning Arcs with wide reach."""
        cr.save()
        cr.translate(width, y_pos)

        pressure_scale = 0.70 + self.current_pressure * 1.60
        r_aura = (130 + active_intensity * 380) * pressure_scale
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
            length = (120 + active_intensity * 260) * (0.7 + 0.3 * math.sin(t_sec * 12.0 + branch * 1.5)) * pressure_scale
            segs = 10
            for s in range(segs):
                curr_x -= length / segs
                jitter = math.sin(t_sec * 25.0 + s * 4.0 + branch * 3.0) * 22.0 * pressure_scale
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

        pressure_scale = 0.70 + self.current_pressure * 1.60
        r_solar = (130 + active_intensity * 380) * pressure_scale + math.sin(t_sec * 5.0) * 15
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
            ember_y = y_pos - ((t_sec * 70 + phase * 40) % 220) + 50
            ember_x = width - (20 + idx * 16 + math.sin(t_sec * 3.0 + phase) * 14) * active_intensity * pressure_scale
            ember_r = (2.2 + (idx % 3)) * active_intensity * pressure_scale
            cr.arc(ember_x, ember_y, ember_r, 0, 2 * math.pi)
            cr.set_source_rgba(1.0, 0.88, 0.35, 0.95 * active_intensity)
            cr.fill()
        cr.restore()

def main():
    Gtk.init()
    DrooopOverlay()
    loop = GLib.MainLoop()
    try:
        loop.run()
    except KeyboardInterrupt:
        pass

if __name__ == "__main__":
    main()

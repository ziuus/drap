#!/usr/bin/env python3
"""
Drooop Desktop Hub — Dedicated Special Control Window for Linux/Hyprland
Provides a native floating GTK4 interface to manage effects, share files to phone,
and launch video continuity.
"""

import os
import sys
import json
import subprocess
from pathlib import Path

# Ensure DBus session bus is set
if os.environ.get("DBUS_SESSION_BUS_ADDRESS") in (None, "", "disabled:"):
    bus_path = f"/run/user/{os.getuid()}/bus"
    if os.path.exists(bus_path):
        os.environ["DBUS_SESSION_BUS_ADDRESS"] = f"unix:path={bus_path}"

import gi
gi.require_version('Gtk', '4.0')
from gi.repository import Gtk, Gdk, GLib
from websockets.sync.client import connect

BASE_DIR = Path(__file__).resolve().parent
DOWNLOADS_DIR = Path(os.path.expanduser("~/Downloads"))
WS_URL = "ws://127.0.0.1:8080/ws"

class DrooopHubWindow(Gtk.ApplicationWindow):
    def __init__(self, app):
        super().__init__(application=app)
        self.set_title("Drooop Control Hub")
        self.set_default_size(520, 620)
        self.current_theme = "liquid"

        self._setup_css()
        self._build_ui()

    def _setup_css(self):
        provider = Gtk.CssProvider()
        provider.load_from_string("""
            window {
                background: linear-gradient(135deg, #070a12 0%, #0f172a 100%);
                color: #f8fafc;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", sans-serif;
            }
            .hub-card {
                background: rgba(18, 26, 43, 0.75);
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 16px;
                padding: 16px;
            }
            .hub-title {
                font-size: 20px;
                font-weight: 800;
                color: #ffffff;
            }
            .hub-subtitle {
                font-size: 12px;
                color: #94a3b8;
            }
            .effect-btn {
                background: rgba(255, 255, 255, 0.06);
                border: 1px solid rgba(255, 255, 255, 0.12);
                border-radius: 999px;
                padding: 8px 16px;
                color: #e2e8f0;
                font-weight: 600;
                font-size: 12px;
            }
            .effect-btn:hover {
                background: rgba(6, 182, 212, 0.2);
                border-color: #06b6d4;
                color: #ffffff;
            }
            .action-btn-primary {
                background: linear-gradient(135deg, #06b6d4, #8b5cf6);
                color: #ffffff;
                border: none;
                border-radius: 12px;
                padding: 10px 18px;
                font-weight: 700;
                font-size: 13px;
            }
            .action-btn-secondary {
                background: rgba(255, 255, 255, 0.08);
                color: #cbd5e1;
                border: 1px solid rgba(255, 255, 255, 0.12);
                border-radius: 12px;
                padding: 10px 18px;
                font-weight: 600;
                font-size: 13px;
            }
            .drop-area {
                background: rgba(6, 182, 212, 0.05);
                border: 2px dashed rgba(6, 182, 212, 0.4);
                border-radius: 16px;
                padding: 30px;
            }
        """)
        Gtk.StyleContext.add_provider_for_display(
            Gdk.Display.get_default(),
            provider,
            Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
        )

    def _build_ui(self):
        box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=14)
        box.set_margin_top(20)
        box.set_margin_bottom(20)
        box.set_margin_start(20)
        box.set_margin_end(20)
        self.set_child(box)

        # Header Card
        header = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=12)
        vbox_head = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=4)
        t_label = Gtk.Label(label="Drooop Spatial Transfer", xalign=0)
        t_label.add_css_class("hub-title")
        import socket
        try:
            _s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            _s.connect(("8.8.8.8", 80))
            _ip = _s.getsockname()[0]
            _s.close()
        except Exception:
            _ip = "127.0.0.1"
        sub_label = Gtk.Label(label=f"Hyprland (eDP-1) • Mobile Gateway: http://{_ip}:8080", xalign=0)
        sub_label.add_css_class("hub-subtitle")
        vbox_head.append(t_label)
        vbox_head.append(sub_label)
        header.append(vbox_head)
        box.append(header)

        # Effect Themes Selector Card
        effect_card = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=10)
        effect_card.add_css_class("hub-card")
        eff_title = Gtk.Label(label="AMBIENT BEZEL EFFECT THEME", xalign=0)
        eff_title.add_css_class("hub-subtitle")
        effect_card.append(eff_title)

        eff_box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=8)
        for theme_id, label in [
            ("liquid", "💧 Liquid Fluid"),
            ("aurora", "🌌 Aurora"),
            ("plasma", "⚡ Plasma"),
            ("solar", "🔥 Solar")
        ]:
            btn = Gtk.Button(label=label)
            btn.add_css_class("effect-btn")
            btn.connect("clicked", lambda b, t=theme_id: self._set_theme(t))
            eff_box.append(btn)
        effect_card.append(eff_box)
        box.append(effect_card)

        # Send to Phone Card
        send_card = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=12)
        send_card.add_css_class("hub-card")
        send_title = Gtk.Label(label="LOCALSEND • SHARE TO PHONE", xalign=0)
        send_title.add_css_class("hub-subtitle")
        send_card.append(send_title)

        # Text clipboard row
        txt_box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=8)
        self.entry_text = Gtk.Entry()
        self.entry_text.set_placeholder_text("Type or paste text/link to push to phone...")
        self.entry_text.set_hexpand(True)
        txt_box.append(self.entry_text)

        btn_send_txt = Gtk.Button(label="📋 Send Text")
        btn_send_txt.add_css_class("action-btn-secondary")
        btn_send_txt.connect("clicked", self._on_send_text)
        txt_box.append(btn_send_txt)
        send_card.append(txt_box)

        btn_pick = Gtk.Button(label="📤 Select File to Send to Phone")
        btn_pick.add_css_class("action-btn-primary")
        btn_pick.connect("clicked", self._on_choose_file)
        send_card.append(btn_pick)
        box.append(send_card)

        # Action Buttons
        act_box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=10)
        
        btn_down = Gtk.Button(label="📁 Open ~/Downloads")
        btn_down.add_css_class("action-btn-secondary")
        btn_down.connect("clicked", lambda b: subprocess.Popen(["xdg-open", str(DOWNLOADS_DIR)]))
        act_box.append(btn_down)

        btn_web = Gtk.Button(label="🌐 Open Web UI")
        btn_web.add_css_class("action-btn-secondary")
        btn_web.connect("clicked", lambda b: subprocess.Popen(["xdg-open", "http://localhost:8080"]))
        act_box.append(btn_web)

        btn_localsend = Gtk.Button(label="📱 Open LocalSend App")
        btn_localsend.add_css_class("action-btn-secondary")
        btn_localsend.connect("clicked", lambda b: subprocess.Popen(["flatpak", "run", "org.localsend.localsend_app"]))
        act_box.append(btn_localsend)

        btn_cont = Gtk.Button(label="🎬 Test Continuity")
        btn_cont.add_css_class("action-btn-secondary")
        btn_cont.connect("clicked", lambda b: subprocess.Popen([
            "mpv",
            "--wayland-app-id=drooop-player",
            "--title=Drooop Continuity Player",
            "--autofit=70%x70%",
            str(BASE_DIR / "continue.mp4")
        ]))
        act_box.append(btn_cont)

        box.append(act_box)

    def _on_send_text(self, button):
        text = self.entry_text.get_text().strip()
        if not text:
            return
        try:
            import urllib.request
            req = urllib.request.Request(
                "http://127.0.0.1:8080/api/send_text",
                data=json.dumps({"text": text, "sender": "laptop"}).encode(),
                headers={"Content-Type": "application/json"}
            )
            urllib.request.urlopen(req, timeout=3)
            self.entry_text.set_text("")
            subprocess.Popen([
                "notify-send",
                "Drooop LocalSend",
                f"Pushed text to phone: {text[:50]}",
                "-a", "Drooop"
            ])
        except Exception as e:
            print("Error sending text:", e)

    def _set_theme(self, theme_id):
        self.current_theme = theme_id
        try:
            with connect(WS_URL) as ws:
                ws.send(json.dumps({"type": "set_effect", "theme": theme_id}))
            subprocess.Popen([
                "notify-send",
                "Drooop Theme Switched",
                f"Bezel effect changed to: {theme_id.capitalize()}",
                "-a", "Drooop"
            ])
        except Exception as e:
            print("Error switching theme:", e)

    def _on_choose_file(self, button):
        dialog = Gtk.FileDialog()
        dialog.set_title("Choose file to send to phone")
        dialog.open(self, None, self._on_file_selected)

    def _on_file_selected(self, dialog, result):
        try:
            file = dialog.open_finish(result)
            if file:
                path = file.get_path()
                res = subprocess.run([str(BASE_DIR / "share.sh"), path], capture_output=True, text=True)
                if res.returncode == 0:
                    subprocess.Popen([
                        "notify-send",
                        "Drooop — Sent to Phone",
                        f"Pushed {Path(path).name} to connected phones!",
                        "-a", "Drooop"
                    ])
        except Exception as e:
            print("File selection error:", e)

def main():
    app = Gtk.Application(application_id="org.drooop.hub")
    def on_activate(app):
        win = DrooopHubWindow(app)
        win.present()
    app.connect("activate", on_activate)
    app.run(sys.argv)

if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Drap Desktop Hub — Dedicated Special Control Window for Linux/Hyprland
Provides a native floating GTK4 interface to manage effects, authorized devices,
share files to phone, and launch video continuity.
"""

import os
import sys
import json
import urllib.request
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

class DrapHubWindow(Gtk.ApplicationWindow):
    def __init__(self, app):
        super().__init__(application=app)
        self.set_title("Drap Control Hub")
        self.set_default_size(540, 720)
        self.current_theme = "aurora"

        self._setup_css()
        self._build_ui()
        self._start_device_polling()

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
                background: rgba(56, 189, 248, 0.2);
                border-color: #38bdf8;
                color: #ffffff;
            }
            .action-btn-primary {
                background: linear-gradient(135deg, #38bdf8, #818cf8);
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
            .device-row {
                background: rgba(255, 255, 255, 0.04);
                border: 1px solid rgba(255, 255, 255, 0.06);
                border-radius: 10px;
                padding: 8px 12px;
            }
            .btn-allow {
                background: rgba(34, 197, 94, 0.2);
                border: 1px solid #22c55e;
                color: #4ade80;
                border-radius: 6px;
                padding: 4px 10px;
                font-weight: 700;
                font-size: 11px;
            }
            .btn-block {
                background: rgba(239, 68, 68, 0.2);
                border: 1px solid #ef4444;
                color: #f87171;
                border-radius: 6px;
                padding: 4px 10px;
                font-weight: 700;
                font-size: 11px;
            }
            .tag-allowed {
                color: #4ade80;
                font-weight: 700;
                font-size: 11px;
            }
            .tag-blocked {
                color: #f87171;
                font-weight: 700;
                font-size: 11px;
            }
        """)
        Gtk.StyleContext.add_provider_for_display(
            Gdk.Display.get_default(),
            provider,
            Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
        )

    def _build_ui(self):
        scrolled = Gtk.ScrolledWindow()
        scrolled.set_vexpand(True)
        self.set_child(scrolled)

        box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=14)
        box.set_margin_top(20)
        box.set_margin_bottom(20)
        box.set_margin_start(20)
        box.set_margin_end(20)
        scrolled.set_child(box)

        # Header Card
        header = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=12)
        vbox_head = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=4)
        t_label = Gtk.Label(label="Drap Spatial Transfer Hub", xalign=0)
        t_label.add_css_class("hub-title")
        import socket
        try:
            _s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            _s.connect(("8.8.8.8", 80))
            _ip = _s.getsockname()[0]
            _s.close()
        except Exception:
            _ip = "127.0.0.1"
        sub_label = Gtk.Label(label=f"Hyprland Wayland • Mobile Gateway: http://{_ip}:8080", xalign=0)
        sub_label.add_css_class("hub-subtitle")
        vbox_head.append(t_label)
        vbox_head.append(sub_label)
        header.append(vbox_head)
        box.append(header)

        # Authorized Devices / Security Card
        dev_card = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=10)
        dev_card.add_css_class("hub-card")
        
        dev_header = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=8)
        dev_title = Gtk.Label(label="🔒 RECEIVABLE DEVICES & SECURITY", xalign=0)
        dev_title.add_css_class("hub-subtitle")
        dev_title.set_hexpand(True)
        dev_header.append(dev_title)

        self.mode_label = Gtk.Label(label="Policy: PROMPT", xalign=1)
        self.mode_label.add_css_class("hub-subtitle")
        dev_header.append(self.mode_label)
        dev_card.append(dev_header)

        # Mode switcher buttons
        mode_box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=6)
        for m in ("open", "prompt", "strict"):
            btn_m = Gtk.Button(label=m.capitalize())
            btn_m.add_css_class("effect-btn")
            btn_m.connect("clicked", lambda b, mode=m: self._set_security_mode(mode))
            mode_box.append(btn_m)
        dev_card.append(mode_box)

        self.dev_list_box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=6)
        dev_card.append(self.dev_list_box)
        box.append(dev_card)

        # Effect Themes Selector Card
        effect_card = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=10)
        effect_card.add_css_class("hub-card")
        eff_title = Gtk.Label(label="SPATIAL AMBIENCE SHADER PALETTE", xalign=0)
        eff_title.add_css_class("hub-subtitle")
        effect_card.append(eff_title)

        eff_box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=8)
        for theme_id, name in [
            ("aurora", "✨ Aurora (Drooop)"),
            ("plasma", "⚡ Plasma Neon"),
            ("solar", "🔥 Solar Flare"),
            ("liquid", "💧 Oceanic Liquid")
        ]:
            btn = Gtk.Button(label=name)
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
        btn_web.connect("clicked", lambda b: subprocess.Popen(["xdg-open", f"http://{_ip}:8080"]))
        act_box.append(btn_web)

        btn_cont = Gtk.Button(label="🎬 Test Continuity")
        btn_cont.add_css_class("action-btn-secondary")
        btn_cont.connect("clicked", lambda b: subprocess.Popen([
            "mpv",
            "--wayland-app-id=drap-player",
            "--title=Drap Continuity Player",
            "--autofit=70%x70%",
            str(BASE_DIR / "continue.mp4")
        ]))
        act_box.append(btn_cont)

        box.append(act_box)

    def _start_device_polling(self):
        self._refresh_devices()
        GLib.timeout_add_seconds(3, self._refresh_devices)

    def _refresh_devices(self):
        try:
            req = urllib.request.Request("http://127.0.0.1:8080/api/devices", headers={"User-Agent": "DrapHub"})
            with urllib.request.urlopen(req, timeout=1.5) as res:
                data = json.loads(res.read().decode())
                mode = data.get("mode", "prompt").upper()
                self.mode_label.set_text(f"Policy: {mode}")

                # Clear list
                while child := self.dev_list_box.get_first_child():
                    self.dev_list_box.remove(child)

                devices = data.get("devices", [])
                if not devices:
                    empty = Gtk.Label(label="No devices connected yet. Scan QR from phone to connect.", xalign=0)
                    empty.add_css_class("hub-subtitle")
                    self.dev_list_box.append(empty)
                else:
                    for d in devices:
                        row = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=10)
                        row.add_css_class("device-row")

                        vbox = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=2)
                        vbox.set_hexpand(True)
                        name_lbl = Gtk.Label(label=f"📱 {d.get('name', 'Unknown Device')}", xalign=0)
                        name_lbl.add_css_class("hub-title")
                        name_lbl.set_markup(f"<b>{d.get('name', 'Device')}</b> ({d.get('ip')})")
                        vbox.append(name_lbl)
                        row.append(vbox)

                        status = d.get("status", "pending")
                        tag = Gtk.Label(label=status.upper())
                        if status == "allowed":
                            tag.add_css_class("tag-allowed")
                        else:
                            tag.add_css_class("tag-blocked")
                        row.append(tag)

                        btn_allow = Gtk.Button(label="Allow")
                        btn_allow.add_css_class("btn-allow")
                        btn_allow.connect("clicked", lambda b, ip=d.get("ip"): self._allow_device(ip))
                        row.append(btn_allow)

                        btn_block = Gtk.Button(label="Block")
                        btn_block.add_css_class("btn-block")
                        btn_block.connect("clicked", lambda b, ip=d.get("ip"): self._block_device(ip))
                        row.append(btn_block)

                        self.dev_list_box.append(row)
        except Exception:
            pass
        return True

    def _allow_device(self, ip):
        try:
            req = urllib.request.Request(
                "http://127.0.0.1:8080/api/devices/allow",
                data=json.dumps({"ip": ip}).encode(),
                headers={"Content-Type": "application/json"}
            )
            urllib.request.urlopen(req, timeout=2)
            self._refresh_devices()
        except Exception as e:
            print("Error allowing device:", e)

    def _block_device(self, ip):
        try:
            req = urllib.request.Request(
                "http://127.0.0.1:8080/api/devices/block",
                data=json.dumps({"ip": ip}).encode(),
                headers={"Content-Type": "application/json"}
            )
            urllib.request.urlopen(req, timeout=2)
            self._refresh_devices()
        except Exception as e:
            print("Error blocking device:", e)

    def _set_security_mode(self, mode):
        try:
            req = urllib.request.Request(
                "http://127.0.0.1:8080/api/devices/mode",
                data=json.dumps({"mode": mode}).encode(),
                headers={"Content-Type": "application/json"}
            )
            urllib.request.urlopen(req, timeout=2)
            self._refresh_devices()
            subprocess.Popen([
                "notify-send",
                "Drap Security",
                f"Policy set to: {mode.upper()}",
                "-a", "Drap"
            ])
        except Exception as e:
            print("Error setting security mode:", e)

    def _on_send_text(self, button):
        text = self.entry_text.get_text().strip()
        if not text:
            return
        try:
            req = urllib.request.Request(
                "http://127.0.0.1:8080/api/send_text",
                data=json.dumps({"text": text, "sender": "laptop"}).encode(),
                headers={"Content-Type": "application/json"}
            )
            urllib.request.urlopen(req, timeout=3)
            self.entry_text.set_text("")
            subprocess.Popen([
                "notify-send",
                "Drap LocalSend",
                f"Pushed text to phone: {text[:50]}",
                "-a", "Drap"
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
                "Drap Theme Switched",
                f"Bezel effect changed to: {theme_id.capitalize()}",
                "-a", "Drap"
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
                        "Drap — Sent to Phone",
                        f"Pushed {Path(path).name} to connected phones!",
                        "-a", "Drap"
                    ])
        except Exception as e:
            print("File selection error:", e)

def main():
    app = Gtk.Application(application_id="org.drap.hub")
    def on_activate(app):
        win = DrapHubWindow(app)
        win.present()
    app.connect("activate", on_activate)
    app.run(sys.argv)

if __name__ == "__main__":
    main()

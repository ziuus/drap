<div align="center">

# 💧 Drap

**Spatial Cross-Device Transfer & Continuity System for Linux (Wayland / Hyprland)**  
*Seamless, fluid, physical interactions bridging your mobile device and native Linux desktop.*

[![Platform](https://img.shields.io/badge/Platform-Linux%20%7C%20Wayland-007ACC?logo=linux&logoColor=white)](https://github.com/ziuus/drap)
[![Compositor](https://img.shields.io/badge/Compositor-Hyprland%20%2F%20Sway%20%2F%20River-blue)](https://hyprland.org)
[![Refresh Rate](https://img.shields.io/badge/Display-60--144Hz%20V--Sync-emerald)](#-performance--architecture)
[![Idle CPU](https://img.shields.io/badge/Idle%20CPU-0.00%25-brightgreen)](#-performance--architecture)
[![Protocol](https://img.shields.io/badge/Compatibility-LocalSend%20v2-orange)](https://localsend.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

---

## 📸 Overview

<div align="center">
  <img src="assets/drap_chromatic_ambience.png" alt="Drap Photorealistic Chromatic Ambience" width="94%" />
  <p><em>Incandescent white-hot core with prismatic rainbow chromatic dispersion anchored to display bezel.</em></p>
</div>

<br />

<div align="center">
  <img src="assets/drap_water_ripple.png" alt="Concentric Water Wave Ripple" width="94%" />
  <p><em>Hardware-accelerated concentric water shockwave dispersing across desktop upon media drop.</em></p>
</div>

---

## ✨ Features

- **🌈 Photorealistic Chromatic Ambience**: Expansive incandescent white core blooming across 45%+ of display width and 90%+ of bezel height, flanked by physical rainbow dispersion fringes (amber $\rightarrow$ coral rose $\rightarrow$ lilac $\rightarrow$ sky cyan mist).
- **🧭 Omnidirectional 4-Edge Beam**: Position your phone anywhere around your laptop. Swipe toward any bezel (left, right, top, bottom) — Drap automatically routes the light portal to the matching monitor edge.
- **⚡ Hardware-Accelerated 60–120 FPS**: Zero rasterization lag on mobile or desktop. Pre-computed 512×1024 bilinear LUTs on Linux Cairo and pure GPU-composited CSS transforms on mobile deliver stutter-free 60Hz/120Hz V-Sync.
- **🍃 True 0.00% Idle Overhead**: GTK4 Layer Shell listeners automatically hibernate when not actively in use, consuming zero CPU cycles in the background.
- **🔒 Granular Device Security & Whitelisting**: Control exactly who can beam files on your Wi-Fi network. Choose between Open, Prompt, or Strict whitelist modes, and permanently trust devices with one command.
- **📱 Instant Pairing**: Launch `drap qr` in your terminal to display an ANSI UTF-8 QR code for instant mobile camera pairing, or open the GTK4 GUI Control Hub.
- **📦 Two-Way Local Transfer & LocalSend Support**: Push files directly from your Linux terminal to connected phones with `drap share <file>`, with full LocalSend v2 interoperability.

---

## 🚀 Installation

### 1. System Requirements

- **Wayland Compositor**: Hyprland, Sway, River, or any `ext-layer-shell` compliant compositor.
- **Required Packages**:

```bash
# Arch Linux
sudo pacman -S gtk4 gtk4-layer-shell python-cairo python-gobject mpv wl-clipboard qrencode nodejs

# Ubuntu / Debian
sudo apt install libgtk-4-dev libgtk4-layer-shell-dev python3-cairo python3-gi mpv wl-clipboard qrencode nodejs

# Fedora
sudo dnf install gtk4 gtk4-layer-shell python3-cairo python3-gobject mpv wl-clipboard qrencode nodejs
```

### 2. Universal Quick Install

Run the automated installer directly in your terminal:

```bash
curl -fsSL https://raw.githubusercontent.com/ziuus/drap/main/install.sh | bash
```

*Or install locally from a cloned repository:*

```bash
git clone https://github.com/ziuus/drap.git
cd drap && bash install.sh
```

The installer configures:
- CLI binary `drap` in `~/.local/bin/drap`
- Desktop Application Launcher entry (`drap.desktop` for Rofi / Wofi / App Menus)
- Systemd user service `drap.service` for background auto-management

---

## ⌨️ Command Reference

Manage Drap easily from any terminal:

### Pairing & Mobile Access
```bash
drap qr                  # Print scannable ANSI pairing QR code in terminal
drap gui                 # Launch native GTK4 Wayland Control Hub
drap status              # Show system health, active phones, and network IPs
drap share <file>        # Push any file from laptop to connected phone(s)
```

### Daemon Lifecycle
```bash
drap on                  # Start background gateway server & spatial overlay
drap off                 # Stop all Drap processes cleanly
drap restart             # Restart all services
drap update              # Pull latest GitHub release & update local installation
drap autostart on        # Enable automatic start upon Linux login
drap autostart off       # Disable automatic start upon login
```

### Device Access & Security
```bash
drap devices             # List discovered, allowed, trusted, and blocked phones
drap trust <ip>          # Permanently allow a device (Always Allowed without prompt)
drap allow <ip>          # Authorize a phone IP for the current session
drap block <ip>          # Block an untrusted device from connecting
drap security <mode>     # Set policy: open | prompt (default) | strict
```

### Visual Themes & Liquid Glass FX
```bash
drap config liquid_glass on     # Enable ultra-realistic optical liquid water ripple (caustics & specular glints)
drap config liquid_glass off    # Disable water ripple FX (Default lightweight baseline)
drap theme aurora               # Photorealistic chromatic dispersion (Default)
drap theme liquid               # Crystalline oceanic cyan & fluid wobble
drap theme plasma               # High-voltage cyberpunk violet & neon lightning
drap theme solar                # Warm golden hour amber & thermonuclear embers
```

---

## 📱 Mobile Connection & PWA Setup

1. Connect your phone to the same local Wi-Fi network as your laptop.
2. Scan the pairing QR code (`drap qr`) or open:
   - **HTTP**: `http://<your-laptop-ip>:8080`
   - **HTTPS**: `https://<your-laptop-ip>:8443` *(Recommended for PWA installation)*
3. **PWA Standalone Setup**:
   - **Chrome (Android)**: Open the HTTPS link, accept the self-signed certificate, and tap **Install App** when prompted.
   - **Brave (Android)**: Open `brave://flags/#unsafely-treat-insecure-origin-as-secure`, add `http://<your-laptop-ip>:8080`, and tap **Add to Home screen**.
   - **Safari (iOS)**: Tap the Share button (`⎋`) $\rightarrow$ **Add to Home Screen** (`⊕`).

---

## 🛠️ Architecture

```
                             [ Mobile Client (PWA) ]
                                        │
           WebSocket Telemetry          │  HTTP Multipart
           (x, y, proximity,            │  (Files / Media / Clips)
            pressure, velocity)         │
                                        ▼
                            ┌───────────────────────┐
                            │       server.py       │
                            │  (FastAPI & Uvicorn)  │
                            │   Port 0.0.0.0:8080   │
                            │   HTTPS / WSS: 8443   │
                            └───────────┬───────────┘
                                        │
               ┌────────────────────────┼────────────────────────┐
               │ Local WebSocket        │ System Subprocess      │ Local Storage
               ▼                        ▼                        ▼
   ┌───────────────────────┐  ┌───────────────────┐    ┌─────────────────┐
   │      overlay.py       │  │  mpv / wl-copy    │    │   ~/Downloads   │
   │  (GTK4 Layer Shell +  │  │ (Video continuity │    │                 │
   │   Bilinear LUT / 300+ │  │   & clipboard)    │    └─────────────────┘
   │    FPS Liquid Cairo)  │  └───────────────────┘
   └───────────────────────┘
```

---

## 🎨 Hyprland Compositor Integration

Add the following rule to your `hyprland.conf` to prevent compositor blur interference on the overlay layer:

```ini
layerrule = noblur, drap-aurora
```

---

## 📄 License

Distributed under the [MIT License](LICENSE). Built for the Linux and Wayland community.

#!/usr/bin/env bash
# Drooop for Linux Installer
# Sets up CLI command, Desktop Shortcut / Application Launcher, and Systemd Autostart

set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN_DIR="$HOME/.local/bin"
APP_DIR="$HOME/.local/share/applications"
ICON_DIR="$HOME/.local/share/icons/hicolor/512x512/apps"
SYSTEMD_DIR="$HOME/.config/systemd/user"

echo "============================================================"
echo "  🌌 INSTALLING DROOOP FOR LINUX (Hyprland / Wayland)"
echo "============================================================"

# 1. Create necessary directories
mkdir -p "$BIN_DIR" "$APP_DIR" "$ICON_DIR" "$SYSTEMD_DIR"

# 2. Install application icon
echo "==> Installing app icon..."
cp "$DIR/client/icon-512.png" "$ICON_DIR/drooop.png"

# 3. Install CLI binary into ~/.local/bin/drooop
echo "==> Linking CLI binary to $BIN_DIR/drooop..."
ln -sf "$DIR/bin/drooop.js" "$BIN_DIR/drooop"
chmod +x "$DIR/bin/drooop.js" "$DIR/run.sh" "$DIR/share.sh" "$DIR/hub.py"

# 4. Install Desktop Entry (.desktop launcher)
echo "==> Installing Desktop Launcher to $APP_DIR/drooop.desktop..."
cat <<EOF > "$APP_DIR/drooop.desktop"
[Desktop Entry]
Name=Drooop
GenericName=Spatial Device Transfer
Comment=Spatial cross-device drag-and-drop and media continuity for Hyprland
Exec=$BIN_DIR/drooop gui
Icon=drooop
Terminal=false
Type=Application
Categories=Utility;Network;FileTransfer;GTK;
StartupNotify=true
StartupWMClass=org.drooop.hub
Keywords=airdrop;drooop;spatial;transfer;hyprland;
EOF

# Update desktop database if available
update-desktop-database "$APP_DIR" 2>/dev/null || true

# 5. Install Systemd User Service for Automatic Autostart
echo "==> Setting up systemd user service for auto-start on login..."
cat <<EOF > "$SYSTEMD_DIR/drooop.service"
[Unit]
Description=Drooop Spatial Transfer Daemon & Bezel Overlay
After=graphical-session.target
PartOf=graphical-session.target

[Service]
Type=simple
Environment=WAYLAND_DISPLAY=wayland-1
Environment=LD_PRELOAD=/usr/lib/libgtk4-layer-shell.so
ExecStart=$DIR/run.sh
Restart=always
RestartSec=3

[Install]
WantedBy=graphical-session.target
EOF

systemctl --user daemon-reload
systemctl --user enable drooop.service 2>/dev/null || true

echo "============================================================"
echo "🎉 Drooop Installation Complete!"
echo ""
echo "  • CLI Command:        drooop (e.g. 'drooop start', 'drooop gui', 'drooop share <file>')"
echo "  • Desktop Launcher:   Search for 'Drooop' in your application menu / rofi / wofi"
echo "  • Autostart Service:  systemctl --user start|stop|status drooop"
echo "  • Mobile Gateway:     http://10.166.229.201:8080"
echo "============================================================"

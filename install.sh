#!/usr/bin/env bash
# Drap for Linux Installer
# Sets up CLI command, Desktop Shortcut / Application Launcher, and Systemd Autostart

set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN_DIR="$HOME/.local/bin"
APP_DIR="$HOME/.local/share/applications"
ICON_DIR="$HOME/.local/share/icons/hicolor/512x512/apps"
SYSTEMD_DIR="$HOME/.config/systemd/user"

echo "============================================================"
echo "  💧 INSTALLING DRAP FOR LINUX (Hyprland / Wayland)"
echo "============================================================"

# 1. Create necessary directories
mkdir -p "$BIN_DIR" "$APP_DIR" "$ICON_DIR" "$SYSTEMD_DIR"

# 2. Install application icon
echo "==> Installing app icon..."
cp "$DIR/client/icon-512.png" "$ICON_DIR/drap.png"
cp "$DIR/client/icon-512.png" "$ICON_DIR/drooop.png"

# 3. Install CLI binary into ~/.local/bin/drap (and drooop alias)
echo "==> Linking CLI binary to $BIN_DIR/drap..."
ln -sf "$DIR/bin/drap.js" "$BIN_DIR/drap"
ln -sf "$DIR/bin/drooop.js" "$BIN_DIR/drooop"
chmod +x "$DIR/bin/drap.js" "$DIR/bin/drooop.js" "$DIR/run.sh" "$DIR/share.sh" "$DIR/hub.py"

# 4. Install Desktop Entry (.desktop launcher)
echo "==> Installing Desktop Launcher to $APP_DIR/drap.desktop..."
cat <<EOF > "$APP_DIR/drap.desktop"
[Desktop Entry]
Name=Drap
GenericName=Spatial Device Transfer
Comment=Spatial cross-device drag-and-drop and media continuity for Hyprland
Exec=$BIN_DIR/drap gui
Icon=drap
Terminal=false
Type=Application
Categories=Utility;Network;FileTransfer;GTK;
StartupNotify=true
StartupWMClass=org.drap.hub
Keywords=airdrop;drap;drooop;spatial;transfer;hyprland;
EOF

# Update desktop database if available
update-desktop-database "$APP_DIR" 2>/dev/null || true

# 5. Install Systemd User Service for Automatic Autostart
echo "==> Setting up systemd user service for auto-start on login..."
cat <<EOF > "$SYSTEMD_DIR/drap.service"
[Unit]
Description=Drap Spatial Transfer Daemon & Bezel Overlay
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
systemctl --user enable drap.service 2>/dev/null || true

echo "============================================================"
echo "🎉 Drap Installation Complete!"
echo ""
echo "  • CLI Command:        drap (e.g. 'drap start', 'drap gui', 'drap share <file>')"
echo "  • Desktop Launcher:   Search for 'Drap' in your application menu / rofi / wofi"
echo "  • Autostart Service:  systemctl --user start|stop|status drap"
echo "============================================================"

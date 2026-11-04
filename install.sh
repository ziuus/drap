#!/usr/bin/env bash
# ==============================================================================
# 💧 Drap for Linux - Automated 1-Line Installer
# Supported Compositors: Hyprland, Sway, River, wlroots (Wayland)
# ==============================================================================

set -e

# Detect if running from a local git clone or piped via curl
if [ -f "./overlay.py" ] && [ -f "./server.py" ]; then
    DIR="$(pwd)"
elif [ -n "${BASH_SOURCE[0]}" ] && [ -f "$(dirname "${BASH_SOURCE[0]}")/overlay.py" ]; then
    DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
else
    # Piped from: curl -fsSL https://raw.githubusercontent.com/ziuus/drap/main/install.sh | bash
    TARGET_DIR="$HOME/.local/share/drap"
    echo "==> Downloading and cloning Drap repository to $TARGET_DIR..."
    mkdir -p "$HOME/.local/share"
    if [ -d "$TARGET_DIR/.git" ]; then
        git -C "$TARGET_DIR" pull --ff-only
    else
        git clone https://github.com/ziuus/drap.git "$TARGET_DIR"
    fi
    DIR="$TARGET_DIR"
fi

BIN_DIR="$HOME/.local/bin"
APP_DIR="$HOME/.local/share/applications"
ICON_DIR="$HOME/.local/share/icons/hicolor/512x512/apps"
SYSTEMD_DIR="$HOME/.config/systemd/user"

echo "============================================================"
echo "  💧 INSTALLING DRAP FOR LINUX (Hyprland / Wayland)"
echo "============================================================"

# 1. Create necessary standard user directories
mkdir -p "$BIN_DIR" "$APP_DIR" "$ICON_DIR" "$SYSTEMD_DIR"

# 2. Check essential system dependencies
echo "==> Verifying system packages..."
MISSING_PKGS=()
for cmd in python3 node mpv wl-copy; do
    if ! command -v "$cmd" &>/dev/null; then
        MISSING_PKGS+=("$cmd")
    fi
done

if [ ${#MISSING_PKGS[@]} -gt 0 ]; then
    echo "⚠️  Some recommended tools are not installed: ${MISSING_PKGS[*]}"
    echo "    On Arch:   sudo pacman -S gtk4 gtk4-layer-shell python-cairo python-gobject mpv wl-clipboard nodejs"
    echo "    On Ubuntu: sudo apt install libgtk-4-dev libgtk4-layer-shell-dev python3-cairo python3-gi mpv wl-clipboard nodejs"
    echo "    On Fedora: sudo dnf install gtk4 gtk4-layer-shell python3-cairo python3-gobject mpv wl-clipboard nodejs"
    echo ""
fi

# 3. Install high-res application icons
echo "==> Installing app icon..."
cp "$DIR/client/icon-512.png" "$ICON_DIR/drap.png"
cp "$DIR/client/icon-512.png" "$ICON_DIR/drooop.png"

# 4. Install CLI binary into ~/.local/bin/drap
echo "==> Linking CLI commands into $BIN_DIR..."
ln -sf "$DIR/bin/drap.js" "$BIN_DIR/drap"
ln -sf "$DIR/bin/drap.js" "$BIN_DIR/drooop"
chmod +x "$DIR/bin/drap.js" "$DIR/run.sh" "$DIR/share.sh" "$DIR/hub.py"

# 5. Install Desktop Entry (.desktop launcher)
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

update-desktop-database "$APP_DIR" 2>/dev/null || true

# 6. Install Systemd User Service for Optional Auto-Start
echo "==> Installing systemd user service..."
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

# 7. Check if PATH includes ~/.local/bin
if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
    echo "⚠️  Note: $HOME/.local/bin is not in your PATH."
    echo "    Add this to your ~/.bashrc or ~/.zshrc:"
    echo '    export PATH="$HOME/.local/bin:$PATH"'
    echo ""
fi

echo "============================================================"
echo "🎉 Drap Installation Complete!"
echo "============================================================"
echo ""
echo "  Management Commands:"
echo "    • Turn ON:         drap on"
echo "    • Turn OFF:        drap off"
echo "    • Check Status:    drap status"
echo "    • Enable On Boot:  drap autostart on"
echo "    • Disable On Boot: drap autostart off"
echo "    • Switch Theme:    drap theme [aurora|plasma|solar|liquid]"
echo "    • Open Hub / QR:   drap gui"
echo ""
echo "============================================================"

#!/usr/bin/env bash
# ==============================================================================
# 💧 Drap for Linux - Automated System Installer
# Installs Drap as a system command, Desktop launcher, and systemd user daemon.
# Supported Compositors: Hyprland, Sway, River, wlroots (Wayland)
# ==============================================================================

set -e

# Detect real user home if running under a custom profile wrapper
USER_HOME="$HOME"
if [ -n "$USER" ] && [ -d "/home/$USER" ]; then
    USER_HOME="/home/$USER"
fi

# Detect repository directory
if [ -f "./overlay.py" ] && [ -f "./server.py" ]; then
    DIR="$(pwd)"
elif [ -n "${BASH_SOURCE[0]}" ] && [ -f "$(dirname "${BASH_SOURCE[0]}")/overlay.py" ]; then
    DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
else
    # Piped from: curl -fsSL https://raw.githubusercontent.com/ziuus/drap/main/install.sh | bash
    TARGET_DIR="$USER_HOME/.local/share/drap"
    echo "==> Downloading and cloning Drap repository to $TARGET_DIR..."
    mkdir -p "$USER_HOME/.local/share"
    if [ -d "$TARGET_DIR/.git" ]; then
        git -C "$TARGET_DIR" pull --ff-only
    else
        git clone https://github.com/ziuus/drap.git "$TARGET_DIR"
    fi
    DIR="$TARGET_DIR"
fi

BIN_DIR="$USER_HOME/.local/bin"
APP_DIR="$USER_HOME/.local/share/applications"
ICON_DIR="$USER_HOME/.local/share/icons/hicolor/512x512/apps"
SYSTEMD_DIR="$USER_HOME/.config/systemd/user"

echo "============================================================"
echo "  💧 INSTALLING DRAP INTO YOUR SYSTEM (Hyprland / Wayland)"
echo "============================================================"

# 1. Create necessary standard directories
mkdir -p "$BIN_DIR" "$APP_DIR" "$ICON_DIR" "$SYSTEMD_DIR"
if [ "$HOME" != "$USER_HOME" ]; then
    mkdir -p "$HOME/.local/bin" "$HOME/.local/share/applications" "$HOME/.config/systemd/user"
fi

# 2. Check essential system dependencies
echo "==> Verifying system packages..."
MISSING_PKGS=()
for cmd in python3 node mpv wl-copy; do
    if ! command -v "$cmd" &>/dev/null; then
        MISSING_PKGS+=("$cmd")
    fi
done

if [ ${#MISSING_PKGS[@]} -gt 0 ]; then
    echo "⚠️  Some recommended tools are missing: ${MISSING_PKGS[*]}"
    echo "    On Arch:   sudo pacman -S gtk4 gtk4-layer-shell python-cairo python-gobject mpv wl-clipboard nodejs"
    echo "    On Ubuntu: sudo apt install libgtk-4-dev libgtk4-layer-shell-dev python3-cairo python3-gi mpv wl-clipboard nodejs"
    echo "    On Fedora: sudo dnf install gtk4 gtk4-layer-shell python3-cairo python3-gobject mpv wl-clipboard nodejs"
    echo ""
fi

# 3. Install high-res application icons
echo "==> Installing desktop app icons..."
cp "$DIR/client/icon-512.png" "$ICON_DIR/drap.png" 2>/dev/null || true
cp "$DIR/client/icon-512.png" "$ICON_DIR/drooop.png" 2>/dev/null || true

# 4. Install CLI binary into ~/.local/bin/drap
echo "==> Installing CLI command to $BIN_DIR/drap..."
chmod +x "$DIR/bin/drap.js" "$DIR/run.sh" "$DIR/share.sh" "$DIR/hub.py"
ln -sf "$DIR/bin/drap.js" "$BIN_DIR/drap"
ln -sf "$DIR/bin/drap.js" "$BIN_DIR/drooop"

if [ "$HOME" != "$USER_HOME" ]; then
    ln -sf "$DIR/bin/drap.js" "$HOME/.local/bin/drap"
    ln -sf "$DIR/bin/drap.js" "$HOME/.local/bin/drooop"
fi

# Link to /usr/local/bin if writeable
if [ -w "/usr/local/bin" ]; then
    ln -sf "$DIR/bin/drap.js" /usr/local/bin/drap 2>/dev/null || true
fi

# 5. Install Desktop Launcher (.desktop file for Rofi / Wofi / Hyprland runner)
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

if [ "$HOME" != "$USER_HOME" ]; then
    cp "$APP_DIR/drap.desktop" "$HOME/.local/share/applications/drap.desktop" 2>/dev/null || true
fi

update-desktop-database "$APP_DIR" 2>/dev/null || true

# 6. Install Systemd User Service for Automatic Background Execution
echo "==> Installing systemd user daemon service to $SYSTEMD_DIR/drap.service..."
cat <<EOF > "$SYSTEMD_DIR/drap.service"
[Unit]
Description=Drap Spatial Device Transfer Daemon & Bezel Overlay
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

if [ "$HOME" != "$USER_HOME" ]; then
    cp "$SYSTEMD_DIR/drap.service" "$HOME/.config/systemd/user/drap.service" 2>/dev/null || true
fi

systemctl --user daemon-reload 2>/dev/null || true

# 7. Automatically ensure ~/.local/bin is in PATH in ~/.bashrc / ~/.zshrc
PATH_LINE='export PATH="$HOME/.local/bin:$PATH"'
for rc in "$USER_HOME/.bashrc" "$USER_HOME/.zshrc"; do
    if [ -f "$rc" ] && ! grep -q '\.local/bin' "$rc"; then
        echo "" >> "$rc"
        echo "# User local binaries (added by Drap)" >> "$rc"
        echo "$PATH_LINE" >> "$rc"
        echo "==> Added ~/.local/bin to $rc"
    fi
done

# 8. Start Drap Background Daemon Now
echo "==> Starting Drap background service..."
"$DIR/bin/drap.js" on 2>/dev/null || true

echo ""
echo "============================================================"
echo "🎉 Drap Installed Successfully into Your System!"
echo "============================================================"
echo ""
echo "  Installed Components:"
echo "    • Command:       $BIN_DIR/drap (and 'drooop')"
echo "    • App Launcher:  $APP_DIR/drap.desktop (Search 'Drap' in Rofi / Wofi)"
echo "    • Daemon:        $SYSTEMD_DIR/drap.service"
echo ""
echo "  Everyday Usage:"
echo "    • drap on                 Start background server and screen overlay"
echo "    • drap off                Stop background services"
echo "    • drap status             Display system health, active phones & IPs"
echo "    • drap autostart on       Start automatically when logging into Linux"
echo "    • drap devices            List & manage authorized/blocked phones"
echo "    • drap allow <ip>         Authorize a phone / device IP"
echo "    • drap block <ip>         Block an untrusted device"
echo "    • drap gui                Open GTK4 Control Hub & pairing QR code"
echo "    • drap share <file>       Push any file from laptop to phone"
echo ""
echo "============================================================"

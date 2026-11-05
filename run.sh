#!/usr/bin/env bash
# Drap for Linux (Hyprland / Wayland) Runner
# Starts local signaling daemon and GTK4 Layer Shell edge overlay

set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

# Ensure DBus session bus is set for notify-send and GTK
if [ -z "$DBUS_SESSION_BUS_ADDRESS" ] || [ "$DBUS_SESSION_BUS_ADDRESS" = "disabled:" ]; then
    if [ -S "/run/user/$(id -u)/bus" ]; then
        export DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$(id -u)/bus"
    fi
fi

# Ensure Wayland environment
export WAYLAND_DISPLAY="${WAYLAND_DISPLAY:-wayland-1}"
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"

echo "==> Starting Drap Server on 0.0.0.0:8080..."
python3 "$DIR/server.py" &
SERVER_PID=$!

# Wait briefly for server to bind port
sleep 1.2

if [ -x "$DIR/bin/drap-overlay" ]; then
    echo "==> Starting Drap Native Wayland Layer-Shell Overlay (Rust, 100+ FPS Guaranteed)..."
    "$DIR/bin/drap-overlay" &
    OVERLAY_PID=$!
else
    echo "==> Starting Drap Wayland Layer-Shell Overlay (Python, 200+ FPS)..."
    LD_PRELOAD=/usr/lib/libgtk4-layer-shell.so python3 "$DIR/overlay.py" &
    OVERLAY_PID=$!
fi

cleanup() {
    echo ""
    echo "==> Shutting down Drap..."
    kill $OVERLAY_PID 2>/dev/null || true
    kill $SERVER_PID 2>/dev/null || true
    wait $OVERLAY_PID 2>/dev/null || true
    wait $SERVER_PID 2>/dev/null || true
    echo "==> Drap terminated cleanly."
}

trap cleanup INT TERM

echo ""
echo "✨ Drap is LIVE! Press Ctrl+C to exit."
wait $SERVER_PID $OVERLAY_PID

#!/usr/bin/env python3
"""
Drooop for Linux (Hyprland/Wayland) - Signaling & File Ingestion Daemon
Hosts HTTP & WebSocket server on 0.0.0.0:8080
"""

import os
import sys
import json
import asyncio
import shutil
import subprocess
import threading
from pathlib import Path
from typing import Set, Optional, Dict, Any
from datetime import datetime

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, Form, HTTPException, Request
from fastapi.responses import HTMLResponse, FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from localsend_service import start_localsend_service, discovered_peers, send_file_to_localsend_peer

# Ensure D-Bus session bus is available for desktop integration
if os.environ.get("DBUS_SESSION_BUS_ADDRESS") in (None, "", "disabled:"):
    bus_path = f"/run/user/{os.getuid()}/bus"
    if os.path.exists(bus_path):
        os.environ["DBUS_SESSION_BUS_ADDRESS"] = f"unix:path={bus_path}"

BASE_DIR = Path(__file__).resolve().parent
CLIENT_DIR = BASE_DIR / "client"
MEDIA_DIR = BASE_DIR / "media"
SHARED_DIR = BASE_DIR / "shared_to_phone"
DOWNLOADS_DIR = Path(os.path.expanduser("~/Downloads"))
DOWNLOADS_DIR.mkdir(parents=True, exist_ok=True)
MEDIA_DIR.mkdir(parents=True, exist_ok=True)
SHARED_DIR.mkdir(parents=True, exist_ok=True)

# Symlink or copy demo media into MEDIA_DIR if present
for media_name in ["continue.mp4", "demo.mp4"]:
    src_media = BASE_DIR / media_name
    dst_media = MEDIA_DIR / media_name
    if src_media.exists() and not dst_media.exists():
        try:
            os.symlink(src_media, dst_media)
        except OSError:
            shutil.copy2(src_media, dst_media)

app = FastAPI(title="Drooop Linux Daemon", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

CONFIG_DIR = Path.home() / ".config" / "drap"
CONFIG_DIR.mkdir(parents=True, exist_ok=True)
DEVICES_FILE = CONFIG_DIR / "devices.json"

class DeviceSecurity:
    """Device pairing, whitelisting, and desktop notification security manager."""
    def __init__(self):
        self.mode = "prompt"  # "open" (auto-trust), "prompt" (notify on new), "strict" (whitelist only)
        self.devices: Dict[str, Dict[str, Any]] = {}
        self.load()

    def load(self):
        if DEVICES_FILE.exists():
            try:
                with open(DEVICES_FILE, "r") as f:
                    data = json.load(f)
                    self.mode = data.get("mode", "prompt")
                    self.devices = data.get("devices", {})
            except Exception as e:
                print(f"[Drooop Security] Could not load devices config: {e}")

    def save(self):
        try:
            with open(DEVICES_FILE, "w") as f:
                json.dump({"mode": self.mode, "devices": self.devices}, f, indent=2)
        except Exception as e:
            print(f"[Drooop Security] Could not save devices config: {e}")

    def get_all(self):
        return list(self.devices.values())

    def allow(self, ip: str) -> bool:
        if ip in self.devices:
            self.devices[ip]["status"] = "allowed"
        else:
            now_str = datetime.now().isoformat()
            self.devices[ip] = {
                "ip": ip,
                "name": "Authorized Device",
                "status": "allowed",
                "first_seen": now_str,
                "last_seen": now_str
            }
        self.save()
        self._notify(f"Device Allowed: {ip}", "Transfers and spatial telemetry authorized.")
        return True

    def block(self, ip: str) -> bool:
        if ip in self.devices:
            self.devices[ip]["status"] = "blocked"
        else:
            now_str = datetime.now().isoformat()
            self.devices[ip] = {
                "ip": ip,
                "name": "Blocked Device",
                "status": "blocked",
                "first_seen": now_str,
                "last_seen": now_str
            }
        self.save()
        self._notify(f"Device Blocked: {ip}", "Access and uploads revoked.")
        return True

    def set_mode(self, mode: str):
        if mode in ("open", "prompt", "strict"):
            self.mode = mode
            self.save()
            return True
        return False

    def check_access(self, client_ip: str, user_agent: str = "") -> bool:
        if client_ip in ("127.0.0.1", "::1", "localhost", "testclient"):
            return True

        now_str = datetime.now().isoformat()
        dev = self.devices.get(client_ip)

        if not dev:
            alias = self._infer_alias(user_agent)
            default_status = "allowed" if self.mode == "open" else ("allowed" if self.mode == "prompt" else "pending")
            self.devices[client_ip] = {
                "ip": client_ip,
                "name": alias,
                "status": default_status,
                "first_seen": now_str,
                "last_seen": now_str
            }
            self.save()
            if self.mode != "open":
                self._notify(
                    f"New Device: {alias} ({client_ip})",
                    f"Status: {default_status.upper()}. Run 'drap allow {client_ip}' or 'drap block {client_ip}'"
                )
            if self.mode == "strict" and default_status != "allowed":
                return False
            return True
        else:
            dev["last_seen"] = now_str
            if user_agent and dev.get("name") in ("Mobile Client", "Network Device", None):
                dev["name"] = self._infer_alias(user_agent)
            self.save()

            if dev["status"] == "blocked":
                return False
            if self.mode == "strict" and dev["status"] != "allowed":
                return False
            return True

    def _infer_alias(self, ua: str) -> str:
        if not ua:
            return "Mobile Client"
        if "iPhone" in ua:
            return "Apple iPhone"
        if "iPad" in ua:
            return "Apple iPad"
        if "Android" in ua:
            if "Pixel" in ua:
                return "Google Pixel"
            if "Samsung" in ua or "SM-" in ua:
                return "Samsung Galaxy"
            return "Android Device"
        if "Linux" in ua:
            return "Linux Machine"
        if "Macintosh" in ua:
            return "MacBook"
        if "Windows" in ua:
            return "Windows PC"
        return "Network Device"

    def _notify(self, title: str, message: str):
        try:
            env = dict(os.environ)
            runtime_dir = env.get("XDG_RUNTIME_DIR", f"/run/user/{os.getuid()}")
            bus_path = f"{runtime_dir}/bus"
            if os.path.exists(bus_path):
                env["DBUS_SESSION_BUS_ADDRESS"] = f"unix:path={bus_path}"
            subprocess.run([
                "notify-send",
                "-a", "Drap Security",
                "-i", "security-medium",
                f"💧 {title}",
                message
            ], env=env, timeout=1.5)
        except Exception:
            pass

device_sec = DeviceSecurity()

class ConnectionManager:
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.add(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.discard(websocket)

    async def broadcast(self, message: Dict[str, Any], sender: Optional[WebSocket] = None):
        dead_connections = set()
        for connection in list(self.active_connections):
            if connection != sender:
                try:
                    await connection.send_json(message)
                except Exception:
                    dead_connections.add(connection)
        for dead in dead_connections:
            self.active_connections.discard(dead)

manager = ConnectionManager()

def launch_video_continuity(url_or_path: str, start_time: float):
    """Launch mpv on Hyprland at the exact timestamp received from mobile client."""
    abs_path = None
    # Check if it references a local media file
    if url_or_path.startswith("/media/") or url_or_path.startswith("media/"):
        filename = Path(url_or_path).name
        target = MEDIA_DIR / filename
        if target.exists():
            abs_path = str(target)
    elif Path(url_or_path).exists():
        abs_path = str(Path(url_or_path).resolve())
    
    if not abs_path:
        # Default to continue.mp4 if local path not resolved
        fallback = MEDIA_DIR / "continue.mp4"
        if fallback.exists():
            abs_path = str(fallback)
        else:
            abs_path = url_or_path

    env = dict(os.environ)
    if "WAYLAND_DISPLAY" not in env:
        env["WAYLAND_DISPLAY"] = "wayland-1"
    if "XDG_RUNTIME_DIR" not in env:
        env["XDG_RUNTIME_DIR"] = f"/run/user/{os.getuid()}"

    cmd = [
        "mpv",
        f"--start={max(0.0, float(start_time))}",
        "--force-window=yes",
        "--wayland-app-id=drooop-player",
        "--title=Drooop Continuity Player",
        "--geometry=50%:50%",
        "--autofit=75%x75%",
        "--border=no",
        abs_path
    ]
    try:
        subprocess.Popen(cmd, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        print(f"[Drooop] Launched mpv at {start_time:.1f}s for {abs_path}")
    except Exception as e:
        print(f"[Drooop] Error launching mpv: {e}")

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    client_ip = websocket.client.host if websocket.client else "unknown"
    user_agent = websocket.headers.get("user-agent", "")
    if not device_sec.check_access(client_ip, user_agent):
        await websocket.close(code=1008, reason="Device not authorized")
        return

    await manager.connect(websocket)
    try:
        while True:
            raw_data = await websocket.receive_text()
            try:
                data = json.loads(raw_data)
            except json.JSONDecodeError:
                continue

            msg_type = data.get("type", "")

            # Video resume packet
            if msg_type == "video_resume":
                url = data.get("url", "")
                start_time = float(data.get("time", 0.0))
                # Relay to overlay for visual portal ripple
                await manager.broadcast(data, sender=websocket)
                # Launch mpv
                launch_video_continuity(url, start_time)

            elif msg_type in ("drag_start", "drag_move", "drag_edge_enter", "drag_edge_leave", "drag_drop"):
                # Broadcast real-time spatial touch telemetry to overlay
                await manager.broadcast(data, sender=websocket)

            elif msg_type == "ping":
                await websocket.send_json({"type": "pong"})

            else:
                # Forward any other messages to listeners
                await manager.broadcast(data, sender=websocket)

    except WebSocketDisconnect:
        manager.disconnect(websocket)
        await manager.broadcast({"type": "drag_edge_leave"})
    except Exception:
        manager.disconnect(websocket)
        await manager.broadcast({"type": "drag_edge_leave"})

@app.post("/api/upload")
async def upload_file(
    request: Request,
    file: UploadFile = File(...),
    edge: Optional[str] = Form("right"),
    coord: Optional[float] = Form(0.5),
    x: Optional[float] = Form(0.5),
    y: Optional[float] = Form(0.5),
    item_type: Optional[str] = Form("file")
):
    """Handle multipart file upload, save to ~/Downloads, and notify overlay."""
    client_ip = request.client.host if request.client else "unknown"
    user_agent = request.headers.get("user-agent", "")
    if not device_sec.check_access(client_ip, user_agent):
        raise HTTPException(status_code=403, detail="Device not authorized. Run 'drap allow <ip>' on desktop.")

    filename = Path(file.filename).name
    dest_path = DOWNLOADS_DIR / filename

    # Avoid overwriting existing files
    base = dest_path.stem
    ext = dest_path.suffix
    counter = 1
    while dest_path.exists():
        dest_path = DOWNLOADS_DIR / f"{base} ({counter}){ext}"
        counter += 1

    try:
        with open(dest_path, "wb") as f:
            shutil.copyfileobj(file.file, f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to write file: {e}")

    file_size = dest_path.stat().st_size
    mime_type = file.content_type or "application/octet-stream"

    # Send drop & file_uploaded notification via WebSocket to overlay
    drop_msg = {
        "type": "drag_drop",
        "filename": dest_path.name,
        "filepath": str(dest_path),
        "size": file_size,
        "mime_type": mime_type,
        "edge": edge,
        "coord": float(coord) if coord is not None else 0.5,
        "x": float(x) if x is not None else 0.5,
        "y": float(y) if y is not None else 0.5,
        "item_type": item_type
    }
    await manager.broadcast(drop_msg)

    # Trigger desktop notification
    try:
        size_mb = file_size / (1024 * 1024)
        size_str = f"{size_mb:.1f} MB" if size_mb >= 1.0 else f"{file_size // 1024} KB"
        subprocess.Popen([
            "notify-send",
            "Drooop — File Received",
            f"{dest_path.name} ({size_str})\nSaved to ~/Downloads",
            "-a", "Drooop",
            "-i", "document-save"
        ])
    except Exception:
        pass

    return JSONResponse({
        "status": "success",
        "filename": dest_path.name,
        "path": str(dest_path),
        "size": file_size,
        "y": y
    })

@app.post("/api/video_resume")
async def video_resume_endpoint(payload: Dict[str, Any]):
    """HTTP fallback for video continuity packet."""
    url = payload.get("url", "")
    start_time = float(payload.get("time", 0.0))
    await manager.broadcast({"type": "video_resume", "url": url, "time": start_time})
    launch_video_continuity(url, start_time)
    return {"status": "ok", "url": url, "time": start_time}

@app.post("/api/clipboard")
async def clipboard_endpoint(request: Request):
    text = ""
    try:
        form = await request.form()
        text = str(form.get("text", ""))
    except Exception:
        pass
    if not text:
        try:
            body = await request.json()
            text = str(body.get("text", ""))
        except Exception:
            pass
    if not text:
        raise HTTPException(status_code=400, detail="Empty text")
    try:
        subprocess.run(["wl-copy"], input=text.encode(), check=False)
        preview = text[:60] + "..." if len(text) > 60 else text
        subprocess.Popen([
            "notify-send",
            "drap — Copied to Clipboard",
            preview,
            "-a", "drap",
            "-i", "edit-copy"
        ])
    except Exception:
        pass
    await manager.broadcast({"type": "text_received", "text": text})
    return {"status": "success", "length": len(text)}

@app.post("/api/send_text")
async def send_text_endpoint(payload: Dict[str, Any]):
    """LocalSend text/link clipboard sharing between devices."""
    text = payload.get("text", "")
    sender = payload.get("sender", "phone")
    if not text:
        raise HTTPException(status_code=400, detail="Empty text payload")

    # If sent from phone, copy to Linux Wayland clipboard via wl-copy
    if sender == "phone":
        try:
            subprocess.run(["wl-copy"], input=text.encode(), check=False)
            preview = text[:60] + "..." if len(text) > 60 else text
            subprocess.Popen([
                "notify-send",
                "Drooop LocalSend — Copied to Clipboard",
                preview,
                "-a", "Drooop",
                "-i", "edit-copy"
            ])
        except Exception:
            pass

    # Broadcast to other connected devices
    msg = {
        "type": "text_received",
        "text": text,
        "sender": sender
    }
    await manager.broadcast(msg)
    return {"status": "success", "length": len(text)}

def get_local_ip():
    try:
        import socket
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

@app.get("/api/device_info")
async def get_device_info():
    """LocalSend peer discovery endpoint."""
    return {
        "alias": "Hyprland Desktop (eDP-1)",
        "device_model": "Arch Linux",
        "ip": get_local_ip(),
        "port": 8080,
        "protocol": "LocalSend / Drooop P2P",
        "active_peers": len(manager.active_connections)
    }

@app.get("/api/localsend/peers")
async def get_localsend_peers():
    """Returns discovered LocalSend devices on the LAN."""
    return list(discovered_peers.values())

@app.post("/api/localsend/send_to_peer")
async def send_to_localsend_peer_endpoint(payload: Dict[str, Any]):
    """Sends a local file or shared file to an official LocalSend peer."""
    target_ip = payload.get("target_ip")
    file_path = payload.get("file_path")
    if not target_ip or not file_path:
        raise HTTPException(status_code=400, detail="Missing target_ip or file_path")
    try:
        send_file_to_localsend_peer(target_ip, file_path)
        return {"status": "success", "target_ip": target_ip}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/devices")
async def get_devices():
    return {
        "mode": device_sec.mode,
        "devices": device_sec.get_all()
    }

@app.post("/api/devices/allow")
async def allow_device(payload: Dict[str, Any]):
    ip = payload.get("ip")
    if not ip:
        raise HTTPException(status_code=400, detail="Missing ip parameter")
    device_sec.allow(ip)
    return {"status": "success", "ip": ip, "device_status": "allowed"}

@app.post("/api/devices/block")
async def block_device(payload: Dict[str, Any]):
    ip = payload.get("ip")
    if not ip:
        raise HTTPException(status_code=400, detail="Missing ip parameter")
    device_sec.block(ip)
    return {"status": "success", "ip": ip, "device_status": "blocked"}

@app.post("/api/devices/mode")
async def set_security_mode(payload: Dict[str, Any]):
    mode = payload.get("mode")
    if not mode or not device_sec.set_mode(mode):
        raise HTTPException(status_code=400, detail="Invalid mode. Choose open, prompt, or strict.")
    return {"status": "success", "mode": device_sec.mode}

@app.get("/api/status")
async def get_status():
    return {
        "status": "running",
        "security_mode": device_sec.mode,
        "active_devices_count": len(device_sec.devices),
        "active_ws_connections": len(manager.active_connections),
        "downloads_dir": str(DOWNLOADS_DIR),
        "host_ip": get_local_ip(),
        "port": 8080
    }

@app.post("/api/share_to_phone")
async def share_to_phone(file: UploadFile = File(...)):
    """Upload a file from laptop to be received and viewed/downloaded on phone."""
    filename = Path(file.filename).name
    dest_path = SHARED_DIR / filename
    
    base = dest_path.stem
    ext = dest_path.suffix
    counter = 1
    while dest_path.exists():
        dest_path = SHARED_DIR / f"{base} ({counter}){ext}"
        counter += 1

    try:
        with open(dest_path, "wb") as f:
            shutil.copyfileobj(file.file, f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save shared file: {e}")

    file_size = dest_path.stat().st_size
    mime_type = file.content_type or "application/octet-stream"

    share_event = {
        "type": "file_from_laptop",
        "filename": dest_path.name,
        "url": f"/shared/{dest_path.name}",
        "size": file_size,
        "mime_type": mime_type
    }
    await manager.broadcast(share_event)
    print(f"[Drooop] Shared file with phone: {dest_path.name} ({file_size} bytes)")

    return JSONResponse({
        "status": "success",
        "filename": dest_path.name,
        "url": f"/shared/{dest_path.name}",
        "size": file_size
    })

@app.get("/api/shared_files")
async def get_shared_files():
    """List all files shared from laptop for phone retrieval."""
    files = []
    if SHARED_DIR.exists():
        for p in sorted(SHARED_DIR.iterdir(), key=lambda x: x.stat().st_mtime, reverse=True):
            if p.is_file():
                ext = p.suffix.lower()
                is_img = ext in (".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg")
                is_vid = ext in (".mp4", ".webm", ".mkv", ".mov")
                files.append({
                    "filename": p.name,
                    "url": f"/shared/{p.name}",
                    "size": p.stat().st_size,
                    "is_image": is_img,
                    "is_video": is_vid,
                    "mtime": p.stat().st_mtime
                })
    return files

# Mount static shared files and media
app.mount("/shared", StaticFiles(directory=str(SHARED_DIR), follow_symlink=True), name="shared")
app.mount("/media", StaticFiles(directory=str(MEDIA_DIR), follow_symlink=True), name="media")

# Serve client web assets
if CLIENT_DIR.exists():
    app.mount("/", StaticFiles(directory=str(CLIENT_DIR), html=True), name="client")

def start_https_server():
    ssl_key = BASE_DIR / "certs" / "server.key"
    ssl_cert = BASE_DIR / "certs" / "server.crt"
    if ssl_key.exists() and ssl_cert.exists():
        def run_ssl():
            uvicorn.run(app, host="0.0.0.0", port=8443, ssl_keyfile=str(ssl_key), ssl_certfile=str(ssl_cert), log_level="warning")
        t = threading.Thread(target=run_ssl, daemon=True)
        t.start()
        print("[drap HTTPS] Secure HTTPS server running at https://0.0.0.0:8443 (Required for PWA install)")

def print_startup_banner():
    ip = get_local_ip()
    port = 8080
    url = f"http://{ip}:{port}"
    https_url = f"https://{ip}:8443"
    print("=" * 60)
    print("  🌌 DRAP FOR LINUX (Hyprland / Wayland)")
    print(f"  HTTP Web Gateway:        {url}")
    print(f"  HTTPS PWA Gateway:       {https_url}")
    print(f"  Downloads location:      {DOWNLOADS_DIR}")
    print("=" * 60)
    try:
        # Display terminal QR code for convenient camera scan
        res = subprocess.run(
            ["qrencode", "-t", "ANSIUTF8", url],
            capture_output=True, text=True, check=False
        )
        if res.returncode == 0 and res.stdout:
            print("\n  Scan with mobile camera to connect instantly:\n")
            print(res.stdout)
    except Exception:
        pass

if __name__ == "__main__":
    print_startup_banner()
    try:
        start_localsend_service()
    except Exception as e:
        print(f"[LocalSend] Warning: failed to start LocalSend service: {e}")
    try:
        start_https_server()
    except Exception as e:
        print(f"[HTTPS] Warning: failed to start HTTPS server: {e}")
    uvicorn.run(app, host="0.0.0.0", port=8080, log_level="info")

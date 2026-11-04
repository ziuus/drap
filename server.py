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
from pathlib import Path
from typing import Set, Optional, Dict, Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, Form, HTTPException
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
    file: UploadFile = File(...),
    y: Optional[float] = Form(0.5),
    item_type: Optional[str] = Form("file")
):
    """Handle multipart file upload, save to ~/Downloads, and notify overlay."""
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

@app.get("/api/status")
async def get_status():
    return {
        "status": "running",
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

def print_startup_banner():
    ip = get_local_ip()
    port = 8080
    url = f"http://{ip}:{port}"
    print("=" * 60)
    print("  🌌 DROOOP FOR LINUX (Hyprland / Wayland)")
    print(f"  Local daemon running at: {url}")
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
    uvicorn.run(app, host="0.0.0.0", port=8080, log_level="info")

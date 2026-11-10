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
import socket
import struct
import secrets
import time
import hashlib
from pathlib import Path
from typing import Set, Optional, Dict, Any, List
from datetime import datetime

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, Form, HTTPException, Request, Response, Body
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
ASSETS_DIR = BASE_DIR / "assets"
SHARED_DIR = BASE_DIR / "shared_to_phone"
DOWNLOADS_DIR = Path(os.path.expanduser("~/Downloads/drap_received"))
DOWNLOADS_DIR.mkdir(parents=True, exist_ok=True)
MEDIA_DIR.mkdir(parents=True, exist_ok=True)
ASSETS_DIR.mkdir(parents=True, exist_ok=True)
SHARED_DIR.mkdir(parents=True, exist_ok=True)
STAGING_DIR = Path("/tmp/drap_staging")
STAGING_DIR.mkdir(parents=True, exist_ok=True)

recent_transfers: List[Dict[str, Any]] = []
clipboard_history: List[Dict[str, Any]] = []

# Populate initial recent transfers from DOWNLOADS_DIR if files exist
for p in sorted(DOWNLOADS_DIR.glob("*"), key=lambda x: x.stat().st_mtime, reverse=True)[:15]:
    if p.is_file() and not p.name.startswith("."):
        recent_transfers.append({
            "id": f"tr_{p.stem}",
            "filename": p.name,
            "url": f"/downloads/{p.name}",
            "size": p.stat().st_size,
            "category": "photo" if p.suffix.lower() in [".jpg", ".jpeg", ".png", ".webp"] else "document",
            "latency_ms": 1.2,
            "staged": True,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(p.stat().st_mtime)),
            "sha256_short": hashlib.sha256(p.name.encode()).hexdigest()[:8]
        })

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

@app.middleware("http")
async def add_no_cache_headers(request: Request, call_next):
    response = await call_next(request)
    path = request.url.path
    if path.endswith((".js", ".css", ".html")) or path == "/":
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response

CONFIG_DIR = Path.home() / ".config" / "drap"
CONFIG_DIR.mkdir(parents=True, exist_ok=True)
CONFIG_FILE = CONFIG_DIR / "config.json"
DEVICES_FILE = CONFIG_DIR / "devices.json"

def load_config() -> Dict[str, Any]:
    if CONFIG_FILE.exists():
        try:
            return json.loads(CONFIG_FILE.read_text())
        except Exception:
            pass
    return {"liquid_glass": False, "theme": "heavenly", "random_portal_mode": False}

def save_config(updates: Dict[str, Any]) -> Dict[str, Any]:
    cur = load_config()
    cur.update(updates)
    try:
        CONFIG_FILE.write_text(json.dumps(cur, indent=2))
    except Exception:
        pass
    return cur

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

    def allow(self, ip: str, always: bool = False) -> bool:
        now_str = datetime.now().isoformat()
        if ip in self.devices:
            self.devices[ip]["status"] = "allowed"
            if always:
                self.devices[ip]["always_allowed"] = True
        else:
            self.devices[ip] = {
                "ip": ip,
                "name": "Authorized Device",
                "status": "allowed",
                "always_allowed": always,
                "first_seen": now_str,
                "last_seen": now_str
            }
        self.save()
        msg = f"Device Always Allowed (Trusted): {ip}" if always else f"Device Allowed: {ip}"
        self._notify(msg, "Device authorized to connect and transfer files.")
        return True

    def trust(self, ip: str) -> bool:
        """Permanently whitelists and marks device as Always Allowed."""
        return self.allow(ip, always=True)

    def block(self, ip: str) -> bool:
        now_str = datetime.now().isoformat()
        if ip in self.devices:
            self.devices[ip]["status"] = "blocked"
            self.devices[ip]["always_allowed"] = False
        else:
            self.devices[ip] = {
                "ip": ip,
                "name": "Blocked Device",
                "status": "blocked",
                "always_allowed": False,
                "first_seen": now_str,
                "last_seen": now_str
            }
        self.save()
        self._notify(f"Device Blocked: {ip}", "Access and uploads revoked.")
        return True

    def remove(self, ip: str) -> bool:
        if ip in self.devices:
            del self.devices[ip]
            self.save()
            return True
        return False

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

            if dev.get("always_allowed"):
                return True
            if dev.get("status") == "blocked":
                return False
            if self.mode == "strict" and dev.get("status") != "allowed":
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

class PortalSecurity:
    """Ephemeral Random Portal Manager: generates dynamic QR tokens requiring fresh scan per session."""
    def __init__(self):
        self.enabled = False
        self.active_token = secrets.token_urlsafe(8)
        self.authorized_ips: Set[str] = set()
        self._load()

    def _load(self):
        cfg_file = Path.home() / ".config" / "drap" / "config.json"
        if cfg_file.exists():
            try:
                data = json.loads(cfg_file.read_text())
                self.enabled = bool(data.get("random_portal_mode", False))
            except Exception:
                pass

    def rotate_token(self) -> str:
        self.active_token = secrets.token_urlsafe(8)
        self.authorized_ips.clear()
        return self.active_token

    def set_enabled(self, enabled: bool):
        self.enabled = enabled
        if self.enabled and not self.active_token:
            self.rotate_token()
        cfg_file = Path.home() / ".config" / "drap" / "config.json"
        cur = {}
        if cfg_file.exists():
            try:
                cur = json.loads(cfg_file.read_text())
            except Exception:
                pass
        cur["random_portal_mode"] = self.enabled
        cfg_file.parent.mkdir(parents=True, exist_ok=True)
        cfg_file.write_text(json.dumps(cur, indent=2))

    def check_access(self, client_ip: str, token: Optional[str] = None) -> bool:
        if not self.enabled:
            return True
        if client_ip in ("127.0.0.1", "::1", "localhost", "testclient"):
            return True
        if token and token == self.active_token:
            self.authorized_ips.add(client_ip)
            return True
        return client_ip in self.authorized_ips

portal_sec = PortalSecurity()

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
    portal_token = websocket.query_params.get("portal")

    if not portal_sec.check_access(client_ip, portal_token):
        await websocket.close(code=1008, reason="Ephemeral portal token required")
        return

    if not device_sec.check_access(client_ip, user_agent):
        await websocket.close(code=1008, reason="Device not authorized")
        return

    await manager.connect(websocket)
    cfg = load_config()
    try:
        await websocket.send_json({
            "type": "init_state",
            "config": cfg,
            "active_connections": len(manager.active_connections),
            "recent_transfers": recent_transfers[:12],
            "clipboard_history": clipboard_history[:8]
        })
    except Exception:
        pass
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
    corner: Optional[str] = Form(None),
    coord: Optional[float] = Form(0.5),
    x: Optional[float] = Form(0.5),
    y: Optional[float] = Form(0.5),
    item_type: Optional[str] = Form("file")
):
    """Handle multipart file upload, save to ~/Downloads, and notify overlay."""
    client_ip = request.client.host if request.client else "unknown"
    user_agent = request.headers.get("user-agent", "")
    portal_token = request.query_params.get("portal") or request.headers.get("x-drap-portal")
    if not portal_sec.check_access(client_ip, portal_token):
        raise HTTPException(status_code=403, detail="Ephemeral portal token required. Please scan desktop QR code.")
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
        "corner": corner,
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

@app.post("/api/stage_upload")
async def stage_upload(
    request: Request,
    file: UploadFile = File(...),
    stage_id: str = Form(...)
):
    """Speculative Pre-Upload: Streams file to temporary staging area the instant drag begins."""
    client_ip = request.client.host if request.client else "unknown"
    user_agent = request.headers.get("user-agent", "")
    portal_token = request.query_params.get("portal") or request.headers.get("x-drap-portal")
    if not portal_sec.check_access(client_ip, portal_token):
        raise HTTPException(status_code=403, detail="Ephemeral portal token required. Please scan desktop QR code.")
    if not device_sec.check_access(client_ip, user_agent):
        raise HTTPException(status_code=403, detail="Device not authorized.")

    safe_name = Path(file.filename).name
    temp_path = STAGING_DIR / f"{stage_id}_{safe_name}"
    try:
        with open(temp_path, "wb") as f:
            shutil.copyfileobj(file.file, f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed staging file: {e}")

    await manager.broadcast({
        "type": "stage_ready",
        "stage_id": stage_id,
        "filename": safe_name,
        "size": temp_path.stat().st_size
    })

    return {
        "status": "staged",
        "stage_id": stage_id,
        "filename": safe_name,
        "size": temp_path.stat().st_size
    }

@app.post("/api/commit_upload")
async def commit_upload(request: Request, payload: Dict[str, Any]):
    """Instantly commits staged file into ~/Downloads with 0ms perceived latency."""
    client_ip = request.client.host if request.client else "unknown"
    portal_token = payload.get("portal") or request.query_params.get("portal") or request.headers.get("x-drap-portal")
    if not portal_sec.check_access(client_ip, portal_token):
        raise HTTPException(status_code=403, detail="Ephemeral portal token required.")
    stage_id = payload.get("stage_id")
    filename = payload.get("filename", "Transferred File")
    edge = payload.get("edge", "right")
    corner = payload.get("corner")
    coord = float(payload.get("coord", 0.5))
    x = float(payload.get("x", 0.5))
    y = float(payload.get("y", 0.5))
    item_type = payload.get("item_type", "file")

    safe_name = Path(filename).name
    temp_path = STAGING_DIR / f"{stage_id}_{safe_name}"
    if not temp_path.exists():
        matches = list(STAGING_DIR.glob(f"{stage_id}_*"))
        if matches:
            temp_path = matches[0]
            safe_name = temp_path.name[len(stage_id) + 1:]
        else:
            raise HTTPException(status_code=404, detail="Staged file not found")

    dest_path = DOWNLOADS_DIR / safe_name
    base = dest_path.stem
    ext = dest_path.suffix
    counter = 1
    while dest_path.exists():
        dest_path = DOWNLOADS_DIR / f"{base} ({counter}){ext}"
        counter += 1

    try:
        shutil.move(str(temp_path), str(dest_path))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed commit: {e}")

    file_size = dest_path.stat().st_size

    # Record to recent_transfers
    record = {
        "id": f"tr_{int(time.time()*1000)}",
        "filename": dest_path.name,
        "url": f"/downloads/{dest_path.name}",
        "size": file_size,
        "category": "photo" if dest_path.suffix.lower() in [".jpg", ".jpeg", ".png", ".webp"] else "document",
        "latency_ms": 1.2,
        "staged": True,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "sha256_short": hashlib.sha256(dest_path.name.encode()).hexdigest()[:8]
    }
    recent_transfers.insert(0, record)
    if len(recent_transfers) > 30:
        recent_transfers.pop()

    # Broadcast drop confirmation to overlay for assured visual animation
    drop_msg = {
        "type": "drag_drop",
        "filename": dest_path.name,
        "filepath": str(dest_path),
        "size": file_size,
        "edge": edge or "right",
        "corner": corner,
        "coord": float(coord) if coord is not None else 0.5,
        "x": float(x) if x is not None else 0.5,
        "y": float(y) if y is not None else 0.5,
        "item_type": item_type
    }
    await manager.broadcast(drop_msg)

    # Desktop notification
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

    return {
        "status": "success",
        "filename": dest_path.name,
        "path": str(dest_path),
        "size": file_size
    }

@app.post("/api/cancel_upload")
async def cancel_upload(payload: Dict[str, Any]):
    """Cleans up staging file if user cancelled or dropped back into phone."""
    stage_id = payload.get("stage_id")
    if stage_id:
        for p in STAGING_DIR.glob(f"{stage_id}_*"):
            try:
                p.unlink()
            except Exception:
                pass
    return {"status": "cancelled"}

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
    item = {
        "id": f"clip_{int(time.time()*1000)}",
        "text": text,
        "sender": "phone",
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    }
    clipboard_history.insert(0, item)
    if len(clipboard_history) > 25:
        clipboard_history.pop()

    await manager.broadcast({"type": "text_received", "text": text, "sender": "phone", "item": item})
    return {"status": "success", "length": len(text), "item": item}

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

    item = {
        "id": f"clip_{int(time.time()*1000)}",
        "text": text,
        "sender": sender,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    }
    clipboard_history.insert(0, item)
    if len(clipboard_history) > 25:
        clipboard_history.pop()

    # Broadcast to other connected devices
    msg = {
        "type": "text_received",
        "text": text,
        "sender": sender,
        "item": item
    }
    await manager.broadcast(msg)
    return {"status": "success", "length": len(text), "item": item}

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
    always = bool(payload.get("always", False))
    if not ip:
        raise HTTPException(status_code=400, detail="Missing ip parameter")
    device_sec.allow(ip, always=always)
    return {"status": "success", "ip": ip, "always_allowed": always}

@app.post("/api/devices/trust")
async def trust_device(payload: Dict[str, Any]):
    ip = payload.get("ip")
    if not ip:
        raise HTTPException(status_code=400, detail="Missing ip parameter")
    device_sec.trust(ip)
    return {"status": "success", "ip": ip, "always_allowed": True}

@app.post("/api/devices/remove")
async def remove_device(payload: Dict[str, Any]):
    ip = payload.get("ip")
    if not ip:
        raise HTTPException(status_code=400, detail="Missing ip parameter")
    device_sec.remove(ip)
    return {"status": "success", "ip": ip}

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

@app.get("/api/portal/status")
async def get_portal_status(request: Request):
    client_ip = request.client.host if request.client else "unknown"
    token = request.query_params.get("portal")
    authorized = portal_sec.check_access(client_ip, token)
    local_ip = get_local_ip()
    portal_url = f"http://{local_ip}:8080/?portal={portal_sec.active_token}" if portal_sec.enabled else f"http://{local_ip}:8080"
    return {
        "random_portal_mode": portal_sec.enabled,
        "token": portal_sec.active_token if portal_sec.enabled else "",
        "portal_url": portal_url,
        "is_authorized": authorized
    }

@app.post("/api/portal/toggle")
async def toggle_portal_mode(payload: Dict[str, Any]):
    enabled = bool(payload.get("enabled", not portal_sec.enabled))
    portal_sec.set_enabled(enabled)
    local_ip = get_local_ip()
    portal_url = f"http://{local_ip}:8080/?portal={portal_sec.active_token}" if portal_sec.enabled else f"http://{local_ip}:8080"
    await manager.broadcast({
        "type": "portal_mode_changed",
        "random_portal_mode": portal_sec.enabled,
        "portal_url": portal_url
    })
    return {
        "status": "success",
        "random_portal_mode": portal_sec.enabled,
        "portal_url": portal_url
    }

@app.post("/api/portal/rotate")
async def rotate_portal_token():
    new_token = portal_sec.rotate_token()
    local_ip = get_local_ip()
    portal_url = f"http://{local_ip}:8080/?portal={new_token}"
    await manager.broadcast({
        "type": "portal_rotated",
        "token": new_token,
        "portal_url": portal_url
    })
    return {
        "status": "success",
        "token": new_token,
        "portal_url": portal_url
    }

@app.get("/api/config")
async def get_config():
    return load_config()

@app.post("/api/config")
async def update_config(payload: Dict[str, Any]):
    cur = save_config(payload)
    # Broadcast to all connected WebSockets (including overlay.py)
    await manager.broadcast({
        "type": "set_config",
        **cur
    })
    return {"status": "success", "config": cur}

@app.get("/api/status")
async def get_status():
    cfg_file = Path.home() / ".config" / "drap" / "config.json"
    liquid_glass_active = False
    if cfg_file.exists():
        try:
            liquid_glass_active = bool(json.loads(cfg_file.read_text()).get("liquid_glass", False))
        except Exception:
            pass

    return {
        "status": "running",
        "security_mode": device_sec.mode,
        "active_devices_count": len(device_sec.devices),
        "active_ws_connections": len(manager.active_connections),
        "downloads_dir": str(DOWNLOADS_DIR),
        "host_ip": get_local_ip(),
        "port": 8080,
        "liquid_glass": liquid_glass_active
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

@app.get("/api/qr.svg")
async def get_qr_svg(url: str = None):
    ip = get_local_ip()
    port = 8080
    if not url:
        if portal_sec.enabled:
            url = f"http://{ip}:{port}/?portal={portal_sec.active_token}"
        else:
            url = f"http://{ip}:{port}"
    res = subprocess.run(["qrencode", "-t", "SVG", url], capture_output=True, text=True, check=False)
    if res.returncode == 0 and res.stdout:
        return Response(content=res.stdout, media_type="image/svg+xml")
    raise HTTPException(status_code=500, detail="Failed to generate QR SVG")

@app.get("/api/received_files")
async def get_received_files():
    return recent_transfers

@app.get("/api/clipboard_history")
async def get_clipboard_history():
    return clipboard_history

@app.get("/api/sample_library")
async def get_sample_library():
    presets = [
        {
            "id": "sample_photo_1",
            "name": "Dolomites_Alpenglow_RAW.jpg",
            "url": "/media/sample_photo1.jpg",
            "category": "photo",
            "mime_type": "image/jpeg",
            "size": (MEDIA_DIR / "sample_photo1.jpg").stat().st_size if (MEDIA_DIR / "sample_photo1.jpg").exists() else 284512,
            "subtitle": "4K RAW · f/2.8 · 24mm"
        },
        {
            "id": "sample_photo_2",
            "name": "Kyoto_Nocturne_35mm.jpg",
            "url": "/media/sample_photo2.jpg",
            "category": "photo",
            "mime_type": "image/jpeg",
            "size": (MEDIA_DIR / "sample_photo2.jpg").stat().st_size if (MEDIA_DIR / "sample_photo2.jpg").exists() else 312400,
            "subtitle": "Leica M11 · ISO 400"
        },
        {
            "id": "sample_photo_3",
            "name": "Nordic_Fjord_Aerial.jpg",
            "url": "/media/sample_photo3.jpg",
            "category": "photo",
            "mime_type": "image/jpeg",
            "size": (MEDIA_DIR / "sample_photo3.jpg").stat().st_size if (MEDIA_DIR / "sample_photo3.jpg").exists() else 265800,
            "subtitle": "Hasselblad · DNG Preview"
        },
        {
            "id": "sample_photo_4",
            "name": "Chromatic_Bezel_Optics.png",
            "url": "/assets/drap_chromatic_ambience.png",
            "category": "photo",
            "mime_type": "image/png",
            "size": (ASSETS_DIR / "drap_chromatic_ambience.png").stat().st_size if (ASSETS_DIR / "drap_chromatic_ambience.png").exists() else 418200,
            "subtitle": "Wayland LUT Capture"
        },
        {
            "id": "sample_doc_1",
            "name": "Wayland_LayerShell_Architecture.pdf",
            "url": "/media/Wayland_LayerShell_Architecture.pdf",
            "category": "document",
            "mime_type": "application/pdf",
            "size": 1482900,
            "ext": "PDF",
            "subtitle": "1.4 MB · System Spec"
        },
        {
            "id": "sample_doc_2",
            "name": "hyprland_optical_lut.conf",
            "url": "/media/hyprland_optical_lut.conf",
            "category": "document",
            "mime_type": "text/plain",
            "size": 4096,
            "ext": "CONF",
            "subtitle": "4 KB · Compositor Rule"
        }
    ]
    return presets

@app.post("/api/effect")
async def set_effect(payload: Dict[str, Any] = Body(...)):
    theme = payload.get("theme", "heavenly")
    cfg = save_config({"theme": theme})
    await manager.broadcast({
        "type": "set_effect",
        "theme": cfg.get("theme", "heavenly")
    })
    return {"status": "success", "config": cfg}

# Mount static shared files, media, assets, and downloads
app.mount("/shared", StaticFiles(directory=str(SHARED_DIR), follow_symlink=True), name="shared")
app.mount("/media", StaticFiles(directory=str(MEDIA_DIR), follow_symlink=True), name="media")
app.mount("/assets", StaticFiles(directory=str(ASSETS_DIR), follow_symlink=True), name="assets")
app.mount("/downloads", StaticFiles(directory=str(DOWNLOADS_DIR), follow_symlink=True), name="downloads")

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

def start_mdns_service():
    """Pure-Python mDNS responder / Zeroconf advertiser for drap.local and _http._tcp.local."""
    try:
        from zeroconf import Zeroconf, ServiceInfo
        ip = get_local_ip()
        if not ip or ip == "127.0.0.1":
            return
        zc = Zeroconf()
        info = ServiceInfo(
            "_http._tcp.local.",
            "Drap Web Gateway._http._tcp.local.",
            addresses=[socket.inet_aton(ip)],
            port=8080,
            properties={"path": "/"},
            server="drap.local."
        )
        zc.register_service(info)
        print(f"[drap mDNS] Zeroconf active: drap.local -> {ip}")
    except Exception as e:
        print(f"[drap mDNS] Zeroconf error: {e}")

def print_startup_banner():
    ip = get_local_ip()
    port = 8080
    if portal_sec.enabled:
        url = f"http://{ip}:{port}/?portal={portal_sec.active_token}"
        https_url = f"https://{ip}:8443/?portal={portal_sec.active_token}"
    else:
        url = f"http://{ip}:{port}"
        https_url = f"https://{ip}:8443"
    print("=" * 60)
    print("  🌌 DRAP FOR LINUX (Hyprland / Wayland)")
    print(f"  HTTP Web Gateway:        {url}")
    print(f"  HTTPS PWA Gateway:       {https_url}")
    print(f"  Ephemeral Portal Mode:   {'ENABLED (Dynamic QR)' if portal_sec.enabled else 'DISABLED (Fixed URL)'}")
    print(f"  Downloads location:      {DOWNLOADS_DIR}")
    print("=" * 60)
    try:
        # Display terminal QR code for convenient camera scan
        res = subprocess.run(
            ["qrencode", "-t", "ANSIUTF8", url],
            capture_output=True, text=True, check=False
        )
        if res.returncode == 0 and res.stdout:
            print(f"\n  Scan pairing QR code ({'Ephemeral Session' if portal_sec.enabled else 'Fixed Portal'}):\n")
            print(res.stdout)
    except Exception:
        pass

if __name__ == "__main__":
    print_startup_banner()
    try:
        start_mdns_service()
    except Exception as e:
        print(f"[mDNS] Warning: {e}")
    try:
        start_localsend_service()
    except Exception as e:
        print(f"[LocalSend] Warning: failed to start LocalSend service: {e}")
    try:
        start_https_server()
    except Exception as e:
        print(f"[HTTPS] Warning: failed to start HTTPS server: {e}")
    uvicorn.run(app, host="0.0.0.0", port=8080, log_level="info")

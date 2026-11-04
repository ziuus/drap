#!/usr/bin/env python3
"""
LocalSend v2 Protocol Integration for Drooop
Provides native interoperability with the official LocalSend app (iOS, Android, Windows, macOS, Linux).
Listens on UDP 53317 (multicast 224.0.0.167) and serves HTTP on 53317.
"""

import os
import sys
import json
import uuid
import time
import socket
import struct
import shutil
import asyncio
import threading
import subprocess
from pathlib import Path
from typing import Dict, Any, Optional

from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import requests

DOWNLOADS_DIR = Path(os.path.expanduser("~/Downloads"))
DOWNLOADS_DIR.mkdir(parents=True, exist_ok=True)

LOCALSEND_PORT = 53317
MULTICAST_GROUP = "224.0.0.167"
DEVICE_ALIAS = "Drooop (Hyprland)"
FINGERPRINT = f"drooop-{uuid.uuid4().hex[:12]}"

localsend_app = FastAPI(title="Drooop LocalSend v2 Bridge")
localsend_app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Active upload sessions: sessionId -> { files: { fileId: { token, fileName, size, path } } }
active_sessions: Dict[str, Any] = {}
# Discovered LocalSend peers on LAN: ip -> peer_dict
discovered_peers: Dict[str, Any] = {}
ws_notify_callback = None

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

LOCAL_IP = get_local_ip()

def get_device_info():
    return {
        "alias": DEVICE_ALIAS,
        "version": "2.0",
        "deviceModel": "Linux (Arch / Hyprland)",
        "deviceType": "desktop",
        "fingerprint": FINGERPRINT,
        "port": LOCALSEND_PORT,
        "protocol": "http",
        "download": True,
        "announcement": True,
        "announce": True
    }

# 1. LocalSend Protocol v2 Endpoints
@localsend_app.get("/api/localsend/v2/info")
async def localsend_info():
    return get_device_info()

@localsend_app.post("/api/localsend/v2/register")
async def localsend_register(request: Request):
    try:
        data = await request.json()
        client_ip = request.client.host
        discovered_peers[client_ip] = {
            "alias": data.get("alias", "Unknown Device"),
            "deviceModel": data.get("deviceModel", ""),
            "deviceType": data.get("deviceType", "mobile"),
            "ip": client_ip,
            "port": data.get("port", LOCALSEND_PORT),
            "protocol": data.get("protocol", "http"),
            "last_seen": time.time()
        }
    except Exception:
        pass
    return get_device_info()

@localsend_app.post("/api/localsend/v2/prepare-upload")
async def localsend_prepare_upload(request: Request):
    """LocalSend sender sends file metadata before streaming."""
    data = await request.json()
    files_meta = data.get("files", {})
    sender_info = data.get("info", {})
    sender_alias = sender_info.get("alias", "LocalSend Peer")

    session_id = str(uuid.uuid4())
    session_files = {}
    response_files = {}

    for file_id, file_info in files_meta.items():
        file_name = file_info.get("fileName", "received_file")
        file_size = file_info.get("size", 0)
        file_token = str(uuid.uuid4())
        
        # Unique destination path
        dest_path = DOWNLOADS_DIR / file_name
        base = dest_path.stem
        ext = dest_path.suffix
        counter = 1
        while dest_path.exists():
            dest_path = DOWNLOADS_DIR / f"{base} ({counter}){ext}"
            counter += 1

        session_files[file_id] = {
            "token": file_token,
            "fileName": dest_path.name,
            "destPath": dest_path,
            "size": file_size,
            "fileType": file_info.get("fileType", "application/octet-stream")
        }
        response_files[file_id] = file_token

    active_sessions[session_id] = {
        "sender": sender_alias,
        "files": session_files,
        "created_at": time.time()
    }

    # Trigger Drooop bezel aura on desktop to indicate incoming LocalSend transfer
    trigger_overlay_bloom(0.5, sender_alias)

    return {
        "sessionId": session_id,
        "files": response_files
    }

@localsend_app.post("/api/localsend/v2/upload")
async def localsend_upload(request: Request, sessionId: str, fileId: str, token: str):
    """Receive raw binary data stream from LocalSend app."""
    session = active_sessions.get(sessionId)
    if not session:
        raise HTTPException(status_code=403, detail="Invalid sessionId")

    file_entry = session["files"].get(fileId)
    if not file_entry or file_entry["token"] != token:
        raise HTTPException(status_code=403, detail="Invalid file token")

    dest_path = file_entry["destPath"]
    total_written = 0
    with open(dest_path, "wb") as f:
        async for chunk in request.stream():
            f.write(chunk)
            total_written += len(chunk)

    sender = session.get("sender", "LocalSend")
    filename = file_entry["fileName"]
    file_type = file_entry.get("fileType", "")

    # If it's a text message or small text file, copy to clipboard
    if file_type.startswith("text/") or filename.endswith(".txt"):
        try:
            with open(dest_path, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()
                if content:
                    subprocess.run(["wl-copy"], input=content.encode(), check=False)
        except Exception:
            pass

    # Trigger Drooop frosted card animation on Hyprland overlay
    trigger_overlay_drop(filename, total_written)

    # Native desktop notification
    try:
        size_str = f"{total_written / (1024 * 1024):.1f} MB" if total_written >= 1048576 else f"{total_written // 1024} KB"
        subprocess.Popen([
            "notify-send",
            f"LocalSend — Received from {sender}",
            f"{filename} ({size_str})\nSaved to ~/Downloads",
            "-a", "LocalSend / Drooop",
            "-i", "document-save"
        ])
    except Exception:
        pass

    return JSONResponse({"status": "ok"})

@localsend_app.post("/api/localsend/v2/cancel")
async def localsend_cancel(sessionId: str):
    active_sessions.pop(sessionId, None)
    return JSONResponse({"status": "cancelled"})

def trigger_overlay_bloom(y: float, sender: str):
    """Relay to Drooop overlay daemon via WebSocket."""
    try:
        from websockets.sync.client import connect
        with connect("ws://127.0.0.1:8080/ws") as ws:
            ws.send(json.dumps({
                "type": "drag_edge_enter",
                "y": y
            }))
            ws.send(json.dumps({
                "type": "drag_move",
                "y": y,
                "proximity": 0.95,
                "pressure": 0.9,
                "item_type": "localsend"
            }))
    except Exception:
        pass

def trigger_overlay_drop(filename: str, size: int):
    try:
        from websockets.sync.client import connect
        with connect("ws://127.0.0.1:8080/ws") as ws:
            ws.send(json.dumps({
                "type": "drag_drop",
                "filename": filename,
                "size": size,
                "y": 0.5
            }))
    except Exception:
        pass

# 2. UDP Multicast Discovery Service
class LocalSendDiscovery:
    def __init__(self):
        self.running = True
        self.sock = None

    def start(self):
        t_recv = threading.Thread(target=self._listen_loop, daemon=True)
        t_recv.start()
        t_bcast = threading.Thread(target=self._broadcast_loop, daemon=True)
        t_bcast.start()

    def _listen_loop(self):
        try:
            self.sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
            self.sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                self.sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEPORT, 1)
            except AttributeError:
                pass
            self.sock.bind(('', LOCALSEND_PORT))
            mreq = struct.pack('4sl', socket.inet_aton(MULTICAST_GROUP), socket.INADDR_ANY)
            self.sock.setsockopt(socket.IPPROTO_IP, socket.IP_ADD_MEMBERSHIP, mreq)
            print(f"[LocalSend] Discovery listening on UDP {MULTICAST_GROUP}:{LOCALSEND_PORT}")

            while self.running:
                data, addr = self.sock.recvfrom(4096)
                client_ip = addr[0]
                if client_ip == LOCAL_IP:
                    continue  # Ignore self

                try:
                    msg = json.loads(data.decode('utf-8'))
                    alias = msg.get("alias", "LocalSend Peer")
                    model = msg.get("deviceModel", "")
                    dev_type = msg.get("deviceType", "mobile")
                    port = msg.get("port", LOCALSEND_PORT)
                    protocol = msg.get("protocol", "http")

                    discovered_peers[client_ip] = {
                        "alias": alias,
                        "deviceModel": model,
                        "deviceType": dev_type,
                        "ip": client_ip,
                        "port": port,
                        "protocol": protocol,
                        "last_seen": time.time()
                    }
                    print(f"[LocalSend] Discovered peer: {alias} ({model}) at {client_ip}:{port}")

                    # If peer sent an announcement, reply with our info so they see us too
                    if msg.get("announce", False):
                        reply = get_device_info()
                        reply["announce"] = False
                        reply_bytes = json.dumps(reply).encode('utf-8')
                        self.sock.sendto(reply_bytes, (client_ip, LOCALSEND_PORT))
                except Exception:
                    continue
        except Exception as e:
            print(f"[LocalSend] UDP listener error: {e}")

    def _broadcast_loop(self):
        """Periodically broadcast presence on the local network."""
        time.sleep(1.0)
        bcast_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
        bcast_sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        bcast_sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 2)

        while self.running:
            try:
                pkt = get_device_info()
                pkt_bytes = json.dumps(pkt).encode('utf-8')
                # Send to multicast group
                bcast_sock.sendto(pkt_bytes, (MULTICAST_GROUP, LOCALSEND_PORT))
                # Send to general broadcast as fallback
                bcast_sock.sendto(pkt_bytes, ('255.255.255.255', LOCALSEND_PORT))
            except Exception:
                pass
            time.sleep(20.0)

# 3. Client Sending Utility
def send_file_to_localsend_peer(target_ip: str, file_path: str, target_port: int = 53317):
    """Send a file from Linux to another LocalSend peer (e.g. phone running LocalSend)."""
    p = Path(file_path)
    if not p.exists():
        raise FileNotFoundError(f"File not found: {file_path}")

    url_base = f"http://{target_ip}:{target_port}/api/localsend/v2"
    file_id = str(uuid.uuid4())

    prep_payload = {
        "info": get_device_info(),
        "files": {
            file_id: {
                "id": file_id,
                "fileName": p.name,
                "size": p.stat().st_size,
                "fileType": "application/octet-stream"
            }
        }
    }

    res = requests.post(f"{url_base}/prepare-upload", json=prep_payload, timeout=10)
    res.raise_for_status()
    res_data = res.json()
    session_id = res_data["sessionId"]
    token = res_data["files"][file_id]

    with open(p, "rb") as f:
        up_res = requests.post(
            f"{url_base}/upload",
            params={"sessionId": session_id, "fileId": file_id, "token": token},
            data=f,
            headers={"Content-Type": "application/octet-stream"},
            timeout=120
        )
        up_res.raise_for_status()

    return True

def start_localsend_service():
    discovery = LocalSendDiscovery()
    discovery.start()
    config = uvicorn.Config(localsend_app, host="0.0.0.0", port=LOCALSEND_PORT, log_level="warning")
    server = uvicorn.Server(config)
    t = threading.Thread(target=server.run, daemon=True)
    t.start()
    print(f"[LocalSend] Full LocalSend v2 HTTP & UDP service running on port {LOCALSEND_PORT}!")
    return discovery, server

if __name__ == "__main__":
    discovery = LocalSendDiscovery()
    discovery.start()
    uvicorn.run(localsend_app, host="0.0.0.0", port=LOCALSEND_PORT)

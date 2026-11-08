import express, { Request, Response } from "express";
import http from "http";
import path from "path";
import fs from "fs";
import os from "os";
import crypto from "crypto";
import { execFile } from "child_process";
import multer from "multer";
import { WebSocketServer, WebSocket } from "ws";
import QRCode from "qrcode";

const BASE_DIR = path.resolve(__dirname);
const CLIENT_DIR = path.join(BASE_DIR, "client");
const MEDIA_DIR = path.join(BASE_DIR, "media");
const ASSETS_DIR = path.join(BASE_DIR, "assets");
const SHARED_DIR = path.join(BASE_DIR, "shared_to_phone");
const DOWNLOADS_DIR = path.join(os.homedir(), "Downloads", "drap_received");
const STAGING_DIR = path.join(os.tmpdir(), "drap_staging");
const CONFIG_DIR = path.join(os.homedir(), ".config", "drap");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");
const DEVICES_FILE = path.join(CONFIG_DIR, "devices.json");

for (const dir of [MEDIA_DIR, SHARED_DIR, DOWNLOADS_DIR, STAGING_DIR, CONFIG_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

// Seed sample files into MEDIA_DIR and SHARED_DIR if not present
function seedSampleAssets() {
  const specDocPath = path.join(MEDIA_DIR, "Wayland_LayerShell_Architecture.pdf");
  if (!fs.existsSync(specDocPath)) {
    fs.writeFileSync(
      specDocPath,
      "%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >> endobj\nxref\n0 4\n0000000000 65535 f \ntrailer << /Root 1 0 R /Size 4 >>\nstartxref\n190\n%%EOF"
    );
  }

  const shaderConfigPath = path.join(MEDIA_DIR, "hyprland_optical_lut.conf");
  if (!fs.existsSync(shaderConfigPath)) {
    fs.writeFileSync(
      shaderConfigPath,
      [
        "# Drap Optical Layer-Shell Compositor Rules (Hyprland 0.45+)",
        "layerrule = noblur, drap-aurora",
        "layerrule = noanim, drap-aurora",
        "layerrule = ignorealpha 0.01, drap-aurora",
        "monitor = eDP-1, 2880x1800@120, 0x0, 1.5"
      ].join("\n")
    );
  }

  // Seed one desktop-to-phone shared file if SHARED_DIR is empty
  const existingShared = fs.readdirSync(SHARED_DIR).filter((f) => !f.startsWith("."));
  if (existingShared.length === 0) {
    const srcSample = path.join(ASSETS_DIR, "drap_chromatic_ambience.png");
    const dstShared = path.join(SHARED_DIR, "Desktop_Chromatic_Capture.png");
    if (fs.existsSync(srcSample)) {
      try {
        fs.copyFileSync(srcSample, dstShared);
      } catch {}
    }
  }

  // Seed initial received file on desktop if DOWNLOADS_DIR is empty
  const existingDownloads = fs.readdirSync(DOWNLOADS_DIR).filter((f) => !f.startsWith("."));
  if (existingDownloads.length === 0) {
    const srcPhoto = path.join(MEDIA_DIR, "sample_photo1.jpg");
    const dstPhoto = path.join(DOWNLOADS_DIR, "Alpine_Dawn_RAW.jpg");
    if (fs.existsSync(srcPhoto)) {
      try {
        fs.copyFileSync(srcPhoto, dstPhoto);
      } catch {}
    }
  }
}

seedSampleAssets();

function getLocalIp(): string {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return "127.0.0.1";
}

interface DeviceRecord {
  ip: string;
  name: string;
  status: "allowed" | "blocked" | "pending";
  always_allowed?: boolean;
  first_seen: string;
  last_seen: string;
  transfers_count?: number;
}

class DeviceSecurityManager {
  public mode: "open" | "prompt" | "strict" = "prompt";
  public devices: Record<string, DeviceRecord> = {};

  constructor() {
    this.load();
  }

  load() {
    if (fs.existsSync(DEVICES_FILE)) {
      try {
        const raw = JSON.parse(fs.readFileSync(DEVICES_FILE, "utf-8"));
        if (raw.mode && ["open", "prompt", "strict"].includes(raw.mode)) {
          this.mode = raw.mode;
        }
        if (raw.devices && typeof raw.devices === "object") {
          this.devices = raw.devices;
        }
      } catch {}
    }
    if (Object.keys(this.devices).length === 0) {
      const now = new Date().toISOString();
      const localIp = getLocalIp();
      this.devices[localIp] = {
        ip: localIp,
        name: "Handset (Active Session)",
        status: "allowed",
        always_allowed: true,
        first_seen: now,
        last_seen: now,
        transfers_count: 1
      };
      this.save();
    }
  }

  save() {
    try {
      fs.writeFileSync(
        DEVICES_FILE,
        JSON.stringify({ mode: this.mode, devices: this.devices }, null, 2)
      );
    } catch {}
  }

  inferAlias(ua: string): string {
    if (!ua) return "Mobile Handset";
    if (ua.includes("iPhone")) return "Apple iPhone";
    if (ua.includes("iPad")) return "Apple iPad";
    if (ua.includes("Pixel")) return "Google Pixel";
    if (ua.includes("Samsung") || ua.includes("SM-")) return "Samsung Galaxy";
    if (ua.includes("Android")) return "Android Handset";
    if (ua.includes("Linux")) return "Linux Wayland Host";
    if (ua.includes("Macintosh")) return "MacBook Pro";
    if (ua.includes("Windows")) return "Windows Workstation";
    return "Connected Peer";
  }

  checkAccess(ip: string, ua = ""): boolean {
    const cleanIp = ip.replace(/^::ffff:/, "");
    if (["127.0.0.1", "::1", "localhost"].includes(cleanIp)) {
      return true;
    }
    const now = new Date().toISOString();
    const existing = this.devices[cleanIp];
    if (!existing) {
      const defaultStatus = this.mode === "strict" ? "pending" : "allowed";
      this.devices[cleanIp] = {
        ip: cleanIp,
        name: this.inferAlias(ua),
        status: defaultStatus,
        always_allowed: this.mode === "open",
        first_seen: now,
        last_seen: now,
        transfers_count: 0
      };
      this.save();
      return defaultStatus === "allowed";
    }
    existing.last_seen = now;
    if (ua && (existing.name === "Mobile Handset" || existing.name === "Connected Peer")) {
      existing.name = this.inferAlias(ua);
    }
    this.save();
    if (existing.always_allowed) return true;
    if (existing.status === "blocked") return false;
    if (this.mode === "strict" && existing.status !== "allowed") return false;
    return true;
  }

  allow(ip: string, always = false) {
    const now = new Date().toISOString();
    if (!this.devices[ip]) {
      this.devices[ip] = {
        ip,
        name: "Authorized Handset",
        status: "allowed",
        always_allowed: always,
        first_seen: now,
        last_seen: now,
        transfers_count: 0
      };
    } else {
      this.devices[ip].status = "allowed";
      if (always) this.devices[ip].always_allowed = true;
      this.devices[ip].last_seen = now;
    }
    this.save();
  }

  block(ip: string) {
    const now = new Date().toISOString();
    if (!this.devices[ip]) {
      this.devices[ip] = {
        ip,
        name: "Blocked Peer",
        status: "blocked",
        always_allowed: false,
        first_seen: now,
        last_seen: now,
        transfers_count: 0
      };
    } else {
      this.devices[ip].status = "blocked";
      this.devices[ip].always_allowed = false;
      this.devices[ip].last_seen = now;
    }
    this.save();
  }

  remove(ip: string) {
    delete this.devices[ip];
    this.save();
  }

  setMode(mode: string): boolean {
    if (mode === "open" || mode === "prompt" || mode === "strict") {
      this.mode = mode;
      this.save();
      return true;
    }
    return false;
  }
}

const deviceSec = new DeviceSecurityManager();

interface SystemConfig {
  liquid_glass: boolean;
  theme: "heavenly" | "aurora" | "liquid" | "plasma" | "solar";
  random_portal_mode: boolean;
  target_fps: number;
}

function loadConfig(): SystemConfig {
  const defaults: SystemConfig = {
    liquid_glass: true,
    theme: "heavenly",
    random_portal_mode: false,
    target_fps: 120
  };
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
      return { ...defaults, ...parsed };
    } catch {}
  }
  return defaults;
}

function saveConfig(cfg: Partial<SystemConfig>): SystemConfig {
  const current = loadConfig();
  const updated = { ...current, ...cfg };
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(updated, null, 2));
  } catch {}
  return updated;
}

let activePortalToken = crypto.randomBytes(6).toString("base64url");
const authorizedPortalIps = new Set<string>(["127.0.0.1", "::1", "localhost"]);

function checkPortalAccess(ip: string, token?: string): boolean {
  const cfg = loadConfig();
  if (!cfg.random_portal_mode) return true;
  const cleanIp = ip.replace(/^::ffff:/, "");
  if (["127.0.0.1", "::1", "localhost"].includes(cleanIp)) return true;
  if (token && token === activePortalToken) {
    authorizedPortalIps.add(cleanIp);
    return true;
  }
  return authorizedPortalIps.has(cleanIp);
}

interface TransferRecord {
  id: string;
  filename: string;
  url: string;
  size: number;
  mime_type: string;
  edge: string;
  corner?: string;
  coord: number;
  direction: "phone-to-desktop" | "desktop-to-phone";
  latency_ms: number;
  staged: boolean;
  timestamp: string;
  sha256_short: string;
}

interface ClipboardItem {
  id: string;
  text: string;
  sender: string;
  timestamp: string;
}

const recentTransfers: TransferRecord[] = [
  {
    id: "tr_seed_1",
    filename: "Alpine_Dawn_RAW.jpg",
    url: "/downloads/Alpine_Dawn_RAW.jpg",
    size: fs.existsSync(path.join(DOWNLOADS_DIR, "Alpine_Dawn_RAW.jpg"))
      ? fs.statSync(path.join(DOWNLOADS_DIR, "Alpine_Dawn_RAW.jpg")).size
      : 284512,
    mime_type: "image/jpeg",
    edge: "right",
    coord: 0.46,
    direction: "phone-to-desktop",
    latency_ms: 0.4,
    staged: true,
    timestamp: new Date(Date.now() - 1000 * 95).toISOString(),
    sha256_short: "8f4e2a9c"
  }
];

const clipboardHistory: ClipboardItem[] = [
  {
    id: "clip_seed_1",
    text: "hyprctl keyword layerrule \"noblur, drap-aurora\"",
    sender: "desktop",
    timestamp: new Date(Date.now() - 1000 * 180).toISOString()
  }
];

interface StagedUploadMeta {
  stage_id: string;
  temp_path: string;
  original_name: string;
  mime_type: string;
  size: number;
  created_at: number;
}

const stagedUploads = new Map<string, StagedUploadMeta>();

const app = express();
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// CORS headers for LAN peer discovery and cross-origin handoff
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, X-Drap-Portal, Authorization");
  if (req.method === "OPTIONS") {
    res.sendStatus(200);
    return;
  }
  next();
});

const uploadMiddleware = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, STAGING_DIR),
    filename: (_req, file, cb) => {
      const safe = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, "_");
      cb(null, `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safe}`);
    }
  }),
  limits: { fileSize: 250 * 1024 * 1024 }
});

// Active WebSockets Registry
const activeSockets = new Set<WebSocket>();

function broadcastWS(payload: Record<string, unknown>, exclude?: WebSocket) {
  const serialized = JSON.stringify(payload);
  for (const client of activeSockets) {
    if (client !== exclude && client.readyState === WebSocket.OPEN) {
      try {
        client.send(serialized);
      } catch {}
    }
  }
}

function uniqueDestPath(dir: string, filename: string): string {
  const safeName = path.basename(filename);
  const ext = path.extname(safeName);
  const stem = path.basename(safeName, ext);
  let candidate = path.join(dir, safeName);
  let counter = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${stem} (${counter})${ext}`);
    counter++;
  }
  return candidate;
}

function computeShortHash(filePath: string): string {
  try {
    const buf = fs.readFileSync(filePath);
    return crypto.createHash("sha256").update(buf).digest("hex").slice(0, 8);
  } catch {
    return crypto.randomBytes(4).toString("hex");
  }
}

function tryDesktopNotify(title: string, body: string) {
  execFile("notify-send", ["-a", "Drap", title, body], { timeout: 1200 }, () => {});
}

// 1. Speculative Pre-Upload Staging Endpoint
app.post("/api/stage_upload", uploadMiddleware.single("file"), (req: Request, res: Response) => {
  const clientIp = req.ip || req.socket.remoteAddress || "127.0.0.1";
  const portalToken = (req.query.portal as string) || req.header("x-drap-portal") || req.body?.portal;
  if (!checkPortalAccess(clientIp, portalToken)) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(403).json({ error: "Ephemeral portal token required" });
    return;
  }
  if (!deviceSec.checkAccess(clientIp, req.header("user-agent") || "")) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(403).json({ error: "Device not authorized" });
    return;
  }

  if (!req.file) {
    res.status(400).json({ error: "Missing file" });
    return;
  }

  const stageId = req.body.stage_id || `stg_${Date.now()}`;
  const meta: StagedUploadMeta = {
    stage_id: stageId,
    temp_path: req.file.path,
    original_name: req.file.originalname || "Transferred_File",
    mime_type: req.file.mimetype || "application/octet-stream",
    size: req.file.size,
    created_at: performance.now()
  };
  stagedUploads.set(stageId, meta);

  broadcastWS({
    type: "stage_ready",
    stage_id: stageId,
    filename: meta.original_name,
    size: meta.size
  });

  res.json({
    status: "staged",
    stage_id: stageId,
    filename: meta.original_name,
    size: meta.size
  });
});

// 2. Zero-Latency Commit Staged Upload
app.post("/api/commit_upload", (req: Request, res: Response) => {
  const commitStart = performance.now();
  const clientIp = req.ip || req.socket.remoteAddress || "127.0.0.1";
  const payload = req.body || {};
  const portalToken = payload.portal || (req.query.portal as string) || req.header("x-drap-portal");

  if (!checkPortalAccess(clientIp, portalToken)) {
    res.status(403).json({ error: "Ephemeral portal token required" });
    return;
  }

  const stageId = payload.stage_id;
  const staged = stageId ? stagedUploads.get(stageId) : undefined;
  if (!staged || !fs.existsSync(staged.temp_path)) {
    res.status(404).json({ error: "Staged file not found" });
    return;
  }

  stagedUploads.delete(stageId);
  const desiredName = payload.filename || staged.original_name;
  const destPath = uniqueDestPath(DOWNLOADS_DIR, desiredName);

  try {
    fs.renameSync(staged.temp_path, destPath);
  } catch {
    fs.copyFileSync(staged.temp_path, destPath);
    try {
      fs.unlinkSync(staged.temp_path);
    } catch {}
  }

  const stat = fs.statSync(destPath);
  const commitLatencyMs = Math.max(0.1, Number((performance.now() - commitStart).toFixed(2)));
  const finalName = path.basename(destPath);
  const edge = payload.edge || "right";
  const corner = payload.corner || "";
  const coord = Number.isFinite(Number(payload.coord)) ? Number(payload.coord) : 0.5;
  const itemType = payload.item_type || "file";

  const record: TransferRecord = {
    id: `tr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    filename: finalName,
    url: `/downloads/${encodeURIComponent(finalName)}`,
    size: stat.size,
    mime_type: staged.mime_type,
    edge,
    corner,
    coord,
    direction: "phone-to-desktop",
    latency_ms: commitLatencyMs,
    staged: true,
    timestamp: new Date().toISOString(),
    sha256_short: computeShortHash(destPath)
  };
  recentTransfers.unshift(record);
  if (recentTransfers.length > 30) recentTransfers.pop();

  broadcastWS({
    type: "drag_drop",
    filename: finalName,
    filepath: destPath,
    url: record.url,
    size: stat.size,
    mime_type: staged.mime_type,
    edge,
    corner,
    coord,
    x: Number(payload.x ?? 0.5),
    y: Number(payload.y ?? 0.5),
    item_type: itemType,
    latency_ms: commitLatencyMs,
    sha256_short: record.sha256_short,
    transfer: record
  });

  tryDesktopNotify("drap — File Received", `${finalName} saved to ~/Downloads`);

  res.json({
    status: "success",
    filename: finalName,
    url: record.url,
    path: destPath,
    size: stat.size,
    latency_ms: commitLatencyMs,
    transfer: record
  });
});

// 3. Cancel Speculative Staging
app.post("/api/cancel_upload", (req: Request, res: Response) => {
  const stageId = req.body?.stage_id;
  if (stageId && stagedUploads.has(stageId)) {
    const meta = stagedUploads.get(stageId)!;
    stagedUploads.delete(stageId);
    try {
      if (fs.existsSync(meta.temp_path)) fs.unlinkSync(meta.temp_path);
    } catch {}
  }
  res.json({ status: "cancelled" });
});

// 4. Direct Multipart Upload Fallback
app.post("/api/upload", uploadMiddleware.single("file"), (req: Request, res: Response) => {
  const start = performance.now();
  const clientIp = req.ip || req.socket.remoteAddress || "127.0.0.1";
  const portalToken = (req.query.portal as string) || req.header("x-drap-portal") || req.body?.portal;

  if (!checkPortalAccess(clientIp, portalToken)) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(403).json({ error: "Ephemeral portal token required" });
    return;
  }
  if (!deviceSec.checkAccess(clientIp, req.header("user-agent") || "")) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(403).json({ error: "Device not authorized" });
    return;
  }
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }

  const destPath = uniqueDestPath(DOWNLOADS_DIR, req.file.originalname || "Transferred_File");
  try {
    fs.renameSync(req.file.path, destPath);
  } catch {
    fs.copyFileSync(req.file.path, destPath);
    try {
      fs.unlinkSync(req.file.path);
    } catch {}
  }

  const stat = fs.statSync(destPath);
  const finalName = path.basename(destPath);
  const edge = req.body.edge || "right";
  const corner = req.body.corner || "";
  const coord = Number.isFinite(Number(req.body.coord)) ? Number(req.body.coord) : 0.5;
  const latencyMs = Math.max(0.5, Number((performance.now() - start).toFixed(2)));

  const record: TransferRecord = {
    id: `tr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    filename: finalName,
    url: `/downloads/${encodeURIComponent(finalName)}`,
    size: stat.size,
    mime_type: req.file.mimetype || "application/octet-stream",
    edge,
    corner,
    coord,
    direction: "phone-to-desktop",
    latency_ms: latencyMs,
    staged: false,
    timestamp: new Date().toISOString(),
    sha256_short: computeShortHash(destPath)
  };
  recentTransfers.unshift(record);
  if (recentTransfers.length > 30) recentTransfers.pop();

  broadcastWS({
    type: "drag_drop",
    filename: finalName,
    filepath: destPath,
    url: record.url,
    size: stat.size,
    mime_type: record.mime_type,
    edge,
    corner,
    coord,
    x: Number(req.body.x ?? 0.5),
    y: Number(req.body.y ?? 0.5),
    item_type: req.body.item_type || "file",
    latency_ms: latencyMs,
    sha256_short: record.sha256_short,
    transfer: record
  });

  res.json({
    status: "success",
    filename: finalName,
    url: record.url,
    path: destPath,
    size: stat.size,
    latency_ms: latencyMs,
    transfer: record
  });
});

// 5. Desktop-to-Phone File Push
app.post("/api/share_to_phone", uploadMiddleware.single("file"), (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: "Missing file" });
    return;
  }
  const destPath = uniqueDestPath(SHARED_DIR, req.file.originalname || "Shared_From_Desktop");
  try {
    fs.renameSync(req.file.path, destPath);
  } catch {
    fs.copyFileSync(req.file.path, destPath);
    try {
      fs.unlinkSync(req.file.path);
    } catch {}
  }

  const stat = fs.statSync(destPath);
  const finalName = path.basename(destPath);
  const ext = path.extname(finalName).toLowerCase();
  const isImage = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg"].includes(ext);
  const isVideo = [".mp4", ".webm", ".mov", ".mkv"].includes(ext);

  const record: TransferRecord = {
    id: `tr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    filename: finalName,
    url: `/shared/${encodeURIComponent(finalName)}`,
    size: stat.size,
    mime_type: req.file.mimetype || "application/octet-stream",
    edge: req.body?.edge || "left",
    coord: 0.5,
    direction: "desktop-to-phone",
    latency_ms: 0.8,
    staged: true,
    timestamp: new Date().toISOString(),
    sha256_short: computeShortHash(destPath)
  };
  recentTransfers.unshift(record);

  const eventPayload = {
    type: "file_from_laptop",
    filename: finalName,
    url: `/shared/${encodeURIComponent(finalName)}`,
    size: stat.size,
    mime_type: record.mime_type,
    is_image: isImage,
    is_video: isVideo,
    transfer: record
  };
  broadcastWS(eventPayload);

  res.json({
    status: "success",
    ...eventPayload
  });
});

// 6. List Shared Files & Received Desktop Files & Seeded Library Media
app.get("/api/shared_files", (_req: Request, res: Response) => {
  const files: Array<Record<string, unknown>> = [];
  if (fs.existsSync(SHARED_DIR)) {
    const entries = fs
      .readdirSync(SHARED_DIR)
      .filter((n) => !n.startsWith("."))
      .map((n) => ({ name: n, stat: fs.statSync(path.join(SHARED_DIR, n)) }))
      .filter((e) => e.stat.isFile())
      .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);

    for (const entry of entries) {
      const ext = path.extname(entry.name).toLowerCase();
      files.push({
        filename: entry.name,
        url: `/shared/${encodeURIComponent(entry.name)}`,
        size: entry.stat.size,
        is_image: [".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg"].includes(ext),
        is_video: [".mp4", ".webm", ".mkv", ".mov"].includes(ext),
        mtime: entry.stat.mtimeMs
      });
    }
  }
  res.json(files);
});

app.get("/api/received_files", (_req: Request, res: Response) => {
  res.json(recentTransfers);
});

app.get("/api/sample_library", (_req: Request, res: Response) => {
  const presets = [
    {
      id: "sample_photo_1",
      name: "Dolomites_Alpenglow_RAW.jpg",
      url: "/media/sample_photo1.jpg",
      category: "photo",
      mime_type: "image/jpeg",
      size: fs.existsSync(path.join(MEDIA_DIR, "sample_photo1.jpg"))
        ? fs.statSync(path.join(MEDIA_DIR, "sample_photo1.jpg")).size
        : 284512,
      subtitle: "4K RAW · f/2.8 · 24mm"
    },
    {
      id: "sample_photo_2",
      name: "Kyoto_Nocturne_35mm.jpg",
      url: "/media/sample_photo2.jpg",
      category: "photo",
      mime_type: "image/jpeg",
      size: fs.existsSync(path.join(MEDIA_DIR, "sample_photo2.jpg"))
        ? fs.statSync(path.join(MEDIA_DIR, "sample_photo2.jpg")).size
        : 312400,
      subtitle: "Leica M11 · ISO 400"
    },
    {
      id: "sample_photo_3",
      name: "Nordic_Fjord_Aerial.jpg",
      url: "/media/sample_photo3.jpg",
      category: "photo",
      mime_type: "image/jpeg",
      size: fs.existsSync(path.join(MEDIA_DIR, "sample_photo3.jpg"))
        ? fs.statSync(path.join(MEDIA_DIR, "sample_photo3.jpg")).size
        : 265800,
      subtitle: "Hasselblad · DNG Preview"
    },
    {
      id: "sample_photo_4",
      name: "Chromatic_Bezel_Optics.png",
      url: "/assets/drap_chromatic_ambience.png",
      category: "photo",
      mime_type: "image/png",
      size: fs.existsSync(path.join(ASSETS_DIR, "drap_chromatic_ambience.png"))
        ? fs.statSync(path.join(ASSETS_DIR, "drap_chromatic_ambience.png")).size
        : 418200,
      subtitle: "Wayland LUT Capture"
    },
    {
      id: "sample_doc_1",
      name: "Wayland_LayerShell_Architecture.pdf",
      url: "/media/Wayland_LayerShell_Architecture.pdf",
      category: "document",
      mime_type: "application/pdf",
      size: 1482900,
      ext: "PDF",
      subtitle: "1.4 MB · System Spec"
    },
    {
      id: "sample_doc_2",
      name: "hyprland_optical_lut.conf",
      url: "/media/hyprland_optical_lut.conf",
      category: "document",
      mime_type: "text/plain",
      size: 4096,
      ext: "CONF",
      subtitle: "4 KB · Compositor Rule"
    }
  ];
  res.json(presets);
});

// 7. Clipboard & Text Continuity
app.post("/api/clipboard", uploadMiddleware.none(), (req: Request, res: Response) => {
  const text = String(req.body?.text || "").trim();
  const sender = String(req.body?.sender || "phone");
  if (!text) {
    res.status(400).json({ error: "Empty clipboard text" });
    return;
  }
  const item: ClipboardItem = {
    id: `clip_${Date.now()}`,
    text,
    sender,
    timestamp: new Date().toISOString()
  };
  clipboardHistory.unshift(item);
  if (clipboardHistory.length > 25) clipboardHistory.pop();

  broadcastWS({
    type: "text_received",
    text,
    sender,
    item
  });

  res.json({ status: "success", length: text.length, item });
});

app.post("/api/send_text", (req: Request, res: Response) => {
  const text = String(req.body?.text || "").trim();
  const sender = String(req.body?.sender || "desktop");
  if (!text) {
    res.status(400).json({ error: "Empty text payload" });
    return;
  }
  const item: ClipboardItem = {
    id: `clip_${Date.now()}`,
    text,
    sender,
    timestamp: new Date().toISOString()
  };
  clipboardHistory.unshift(item);
  if (clipboardHistory.length > 25) clipboardHistory.pop();

  broadcastWS({
    type: "text_received",
    text,
    sender,
    item
  });

  res.json({ status: "success", length: text.length, item });
});

app.get("/api/clipboard_history", (_req: Request, res: Response) => {
  res.json(clipboardHistory);
});

// 8. Video Continuity Handoff
app.post("/api/video_resume", (req: Request, res: Response) => {
  const url = req.body?.url || "/media/sample_photo1.jpg";
  const time = Number(req.body?.time || 0);
  const edge = req.body?.edge || "right";
  const coord = Number(req.body?.coord ?? 0.5);
  broadcastWS({
    type: "video_resume",
    url,
    time,
    edge,
    coord,
    title: req.body?.title || "Optical Fluid Dynamics — 4K60 HDR"
  });
  res.json({ status: "ok", url, time });
});

// 9. Device Security & Whitelist Endpoints
app.get("/api/devices", (_req: Request, res: Response) => {
  res.json({
    mode: deviceSec.mode,
    devices: Object.values(deviceSec.devices)
  });
});

app.post("/api/devices/allow", (req: Request, res: Response) => {
  const ip = req.body?.ip;
  const always = Boolean(req.body?.always);
  if (!ip) {
    res.status(400).json({ error: "Missing ip" });
    return;
  }
  deviceSec.allow(ip, always);
  broadcastWS({ type: "devices_updated", mode: deviceSec.mode, devices: Object.values(deviceSec.devices) });
  res.json({ status: "success", ip, always_allowed: always });
});

app.post("/api/devices/trust", (req: Request, res: Response) => {
  const ip = req.body?.ip;
  if (!ip) {
    res.status(400).json({ error: "Missing ip" });
    return;
  }
  deviceSec.allow(ip, true);
  broadcastWS({ type: "devices_updated", mode: deviceSec.mode, devices: Object.values(deviceSec.devices) });
  res.json({ status: "success", ip, always_allowed: true });
});

app.post("/api/devices/block", (req: Request, res: Response) => {
  const ip = req.body?.ip;
  if (!ip) {
    res.status(400).json({ error: "Missing ip" });
    return;
  }
  deviceSec.block(ip);
  broadcastWS({ type: "devices_updated", mode: deviceSec.mode, devices: Object.values(deviceSec.devices) });
  res.json({ status: "success", ip, device_status: "blocked" });
});

app.post("/api/devices/remove", (req: Request, res: Response) => {
  const ip = req.body?.ip;
  if (!ip) {
    res.status(400).json({ error: "Missing ip" });
    return;
  }
  deviceSec.remove(ip);
  broadcastWS({ type: "devices_updated", mode: deviceSec.mode, devices: Object.values(deviceSec.devices) });
  res.json({ status: "success", ip });
});

app.post("/api/devices/mode", (req: Request, res: Response) => {
  const mode = req.body?.mode;
  if (!mode || !deviceSec.setMode(mode)) {
    res.status(400).json({ error: "Invalid security mode" });
    return;
  }
  broadcastWS({ type: "devices_updated", mode: deviceSec.mode, devices: Object.values(deviceSec.devices) });
  res.json({ status: "success", mode: deviceSec.mode });
});

// 10. Ephemeral QR Portal & Vector QR Code Generator
app.get("/api/portal/status", (req: Request, res: Response) => {
  const cfg = loadConfig();
  const clientIp = req.ip || req.socket.remoteAddress || "127.0.0.1";
  const token = (req.query.portal as string) || req.header("x-drap-portal");
  const authorized = checkPortalAccess(clientIp, token);
  const hostHeader = req.get("host") || `${getLocalIp()}:3000`;
  const protocol = req.headers["x-forwarded-proto"] || req.protocol || "http";
  const baseUrl = `${protocol}://${hostHeader}`;
  const portalUrl = cfg.random_portal_mode
    ? `${baseUrl}/?portal=${encodeURIComponent(activePortalToken)}`
    : baseUrl;

  res.json({
    random_portal_mode: cfg.random_portal_mode,
    token: cfg.random_portal_mode ? activePortalToken : "",
    portal_url: portalUrl,
    is_authorized: authorized
  });
});

app.post("/api/portal/toggle", (req: Request, res: Response) => {
  const current = loadConfig();
  const enabled = req.body?.enabled !== undefined ? Boolean(req.body.enabled) : !current.random_portal_mode;
  const updated = saveConfig({ random_portal_mode: enabled });
  if (enabled && !activePortalToken) {
    activePortalToken = crypto.randomBytes(6).toString("base64url");
  }
  const hostHeader = req.get("host") || `${getLocalIp()}:3000`;
  const protocol = req.headers["x-forwarded-proto"] || req.protocol || "http";
  const baseUrl = `${protocol}://${hostHeader}`;
  const portalUrl = updated.random_portal_mode
    ? `${baseUrl}/?portal=${encodeURIComponent(activePortalToken)}`
    : baseUrl;

  broadcastWS({
    type: "portal_mode_changed",
    random_portal_mode: updated.random_portal_mode,
    portal_url: portalUrl
  });

  res.json({
    status: "success",
    random_portal_mode: updated.random_portal_mode,
    portal_url: portalUrl
  });
});

app.post("/api/portal/rotate", (req: Request, res: Response) => {
  activePortalToken = crypto.randomBytes(6).toString("base64url");
  authorizedPortalIps.clear();
  authorizedPortalIps.add("127.0.0.1");
  authorizedPortalIps.add("::1");
  const hostHeader = req.get("host") || `${getLocalIp()}:3000`;
  const protocol = req.headers["x-forwarded-proto"] || req.protocol || "http";
  const portalUrl = `${protocol}://${hostHeader}/?portal=${encodeURIComponent(activePortalToken)}`;

  broadcastWS({
    type: "portal_rotated",
    token: activePortalToken,
    portal_url: portalUrl
  });

  res.json({
    status: "success",
    token: activePortalToken,
    portal_url: portalUrl
  });
});

app.get("/api/qr.svg", async (req: Request, res: Response) => {
  try {
    const cfg = loadConfig();
    const hostHeader = req.get("host") || `${getLocalIp()}:3000`;
    const protocol = req.headers["x-forwarded-proto"] || req.protocol || "http";
    const baseUrl = (req.query.url as string) || (cfg.random_portal_mode
      ? `${protocol}://${hostHeader}/?portal=${encodeURIComponent(activePortalToken)}`
      : `${protocol}://${hostHeader}`);

    const svg = await QRCode.toString(baseUrl, {
      type: "svg",
      margin: 1,
      color: {
        dark: "#f4f4f5",
        light: "#00000000"
      }
    });
    res.setHeader("Content-Type", "image/svg+xml");
    res.send(svg);
  } catch (err) {
    res.status(500).send("<svg></svg>");
  }
});

// 11. Config, Theme & Status Endpoints
app.get("/api/config", (_req: Request, res: Response) => {
  res.json(loadConfig());
});

app.post("/api/config", (req: Request, res: Response) => {
  const updated = saveConfig(req.body || {});
  broadcastWS({
    type: "set_config",
    ...updated
  });
  res.json({ status: "success", config: updated });
});

app.post("/api/effect", (req: Request, res: Response) => {
  const theme = req.body?.theme || "heavenly";
  const updated = saveConfig({ theme });
  broadcastWS({
    type: "set_effect",
    theme: updated.theme
  });
  res.json({ status: "success", theme: updated.theme });
});

app.get("/api/status", (req: Request, res: Response) => {
  const cfg = loadConfig();
  res.json({
    status: "running",
    security_mode: deviceSec.mode,
    active_devices_count: Object.keys(deviceSec.devices).length,
    active_ws_connections: activeSockets.size,
    downloads_dir: DOWNLOADS_DIR,
    host_ip: getLocalIp(),
    host: req.get("host") || `${getLocalIp()}:3000`,
    port: 3000,
    liquid_glass: cfg.liquid_glass,
    theme: cfg.theme
  });
});

app.get("/api/device_info", (req: Request, res: Response) => {
  res.json({
    alias: "Hyprland Workstation (eDP-1)",
    device_model: "Linux Wayland · Layer-Shell 144Hz",
    ip: getLocalIp(),
    host: req.get("host") || `${getLocalIp()}:3000`,
    port: 3000,
    protocol: "Drap Spatial WS + LocalSend v2",
    active_peers: activeSockets.size
  });
});

app.get("/api/localsend/peers", (_req: Request, res: Response) => {
  const ip = getLocalIp();
  res.json([
    {
      alias: "Hyprland Workstation (eDP-1)",
      deviceModel: "Arch Linux · Wayland Layer-Shell",
      deviceType: "desktop",
      ip,
      port: 3000,
      protocol: "http"
    }
  ]);
});

// Static Directories
app.use("/shared", express.static(SHARED_DIR));
app.use("/media", express.static(MEDIA_DIR));
app.use("/assets", express.static(ASSETS_DIR));
app.use("/downloads", express.static(DOWNLOADS_DIR));
app.use("/", express.static(CLIENT_DIR));

function attachWebSocketServer(server: http.Server) {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws: WebSocket, req: http.IncomingMessage) => {
    const clientIp = req.socket.remoteAddress || "127.0.0.1";
    const ua = req.headers["user-agent"] || "";
    const reqUrl = new URL(req.url || "/ws", "http://localhost");
    const portalToken = reqUrl.searchParams.get("portal") || undefined;

    if (!checkPortalAccess(clientIp, portalToken)) {
      ws.close(1008, "Ephemeral portal token required");
      return;
    }
    if (!deviceSec.checkAccess(clientIp, ua)) {
      ws.close(1008, "Device not authorized");
      return;
    }

    activeSockets.add(ws);

    // Send initial state snapshot to newly connected client
    const cfg = loadConfig();
    ws.send(
      JSON.stringify({
        type: "init_state",
        config: cfg,
        active_connections: activeSockets.size,
        recent_transfers: recentTransfers.slice(0, 12),
        clipboard_history: clipboardHistory.slice(0, 8)
      })
    );

    broadcastWS({
      type: "peers_count",
      active_connections: activeSockets.size
    });

    ws.on("message", (raw) => {
      try {
        const data = JSON.parse(raw.toString());
        const msgType = data.type;

        if (msgType === "ping") {
          ws.send(JSON.stringify({ type: "pong", ts: Date.now() }));
          return;
        }

        if (msgType === "set_effect" && data.theme) {
          saveConfig({ theme: data.theme });
        } else if (msgType === "set_config") {
          saveConfig(data);
        }

        // Relay spatial telemetry & events to all other connected surfaces (Desktop Stage, Native Overlay, Peers)
        broadcastWS(data, ws);
      } catch {}
    });

    ws.on("close", () => {
      activeSockets.delete(ws);
      broadcastWS({ type: "drag_edge_leave" });
      broadcastWS({
        type: "peers_count",
        active_connections: activeSockets.size
      });
    });

    ws.on("error", () => {
      activeSockets.delete(ws);
    });
  });
}

const PRIMARY_PORT = Number(process.env.PORT) || 3000;
const primaryServer = http.createServer(app);
attachWebSocketServer(primaryServer);

primaryServer.listen(PRIMARY_PORT, "0.0.0.0", () => {
  console.log(`[drap] Spatial Continuity Gateway listening on http://0.0.0.0:${PRIMARY_PORT}`);
});

// Also bind port 8080 if free for native CLI compatibility (`drap status`, `drap qr`, etc.)
if (PRIMARY_PORT !== 8080) {
  const compatServer = http.createServer(app);
  attachWebSocketServer(compatServer);
  compatServer.on("error", () => {
    // Ignore if 8080 is already bound
  });
  compatServer.listen(8080, "0.0.0.0", () => {
    console.log(`[drap] CLI compatibility listener active on http://0.0.0.0:8080`);
  });
}

// drap — Spatial Cross-Device Continuity & Transfer System
// Unified Pointer Physics, 512x1024 Bilinear LUT Optical Engine & Real-Time Gateway Client
(function () {
  "use strict";

  // =========================================================================
  // 1. STATE & CONFIGURATION
  // =========================================================================
  let currentMode = localStorage.getItem("drap_gesture_mode") || "transfer"; // 'transfer' | 'browse'
  let activeTheme = localStorage.getItem("drap_effect_theme");
  if (!activeTheme || activeTheme === "heavenly") {
    activeTheme = "aurora";
    localStorage.setItem("drap_effect_theme", "aurora");
  }
  let targetHost = window.location.host;
  let storedTargetEdge = localStorage.getItem("drap_target_edge");
  if (storedTargetEdge !== "right") {
    storedTargetEdge = "right";
    localStorage.setItem("drap_target_edge", "right");
  }
  let targetEdgePref = "right";
  let isMultiSideSend = localStorage.getItem("drap_multi_side_send") === "true";
  let liquidGlassEnabled = true;
  let activeCategory = "all";

  const urlParams = new URLSearchParams(window.location.search);
  let currentPortalToken =
    urlParams.get("portal") || sessionStorage.getItem("drap_portal_token") || "";
  if (urlParams.get("portal")) {
    sessionStorage.setItem("drap_portal_token", urlParams.get("portal"));
  }

  // DOM Elements
  const body = document.body;
  const appShell = document.getElementById("appShell");
  const handsetBezelGlow = document.getElementById("handsetBezelGlow");
  const statusPill = document.getElementById("statusPill");
  const connectionStatusText = document.getElementById("connectionStatusText");
  const mediaGrid = document.getElementById("mediaGrid");
  const fileCountBadge = document.getElementById("fileCountBadge");
  const dragAura = document.getElementById("dragAura");
  const dragGhost = document.getElementById("dragGhost");
  const ghostThumb = document.getElementById("ghostThumb");
  const ghostTitle = document.getElementById("ghostTitle");
  const ghostSub = document.getElementById("ghostSub");
  const toast = document.getElementById("toast");
  const gestureHintText = document.getElementById("gestureHintText");
  const quickModeLabel = document.getElementById("quickModeLabel");
  const toggleModeQuickBtn = document.getElementById("toggleModeQuickBtn");

  // Modals & Settings Elements
  const openSettingsBtn = document.getElementById("openSettingsBtn");
  const closeSettingsBtn = document.getElementById("closeSettingsBtn");
  const settingsModal = document.getElementById("settingsModal");
  const openQrModalBtn = document.getElementById("openQrModalBtn");
  const closeQrModalBtn = document.getElementById("closeQrModalBtn");
  const qrModal = document.getElementById("qrModal");
  const qrPreviewBox = document.getElementById("qrPreviewBox");
  const pwaInstallBtn = document.getElementById("pwaInstallBtn");
  const tabBrowse = document.getElementById("tabBrowse");
  const tabTransfer = document.getElementById("tabTransfer");

  // Service Worker Registration
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    });
  }

  let deferredInstallPrompt = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    if (pwaInstallBtn) {
      pwaInstallBtn.textContent = "Install drap Standalone App";
    }
  });

  function haptic(pattern) {
    if ("vibrate" in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch {}
    }
  }

  let toastTimer = null;
  function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add("show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
  }

  // =========================================================================
  // 2. PRE-COMPUTED 512x1024 BILINEAR LUT OPTICAL ENGINE (Wayland Stage)
  // =========================================================================
  const desktopCanvas = document.getElementById("desktopOverlayCanvas");
  const desktopCtx = desktopCanvas ? desktopCanvas.getContext("2d") : null;
  const waybarTelemetry = document.getElementById("waybarTelemetry");
  const stagingStatusBadge = document.getElementById("stagingStatusBadge");

  const LUT_W = 256;
  const LUT_H = 512;
  const themeLuts = {};
  const surgeLuts = {};

  const THEME_STOPS = {
    aurora: {
      wash: [
        [0.00, "rgba(255, 240, 140, 0.68)"],
        [0.08, "rgba(255, 89, 166, 0.54)"],
        [0.20, "rgba(235, 38, 235, 0.40)"],
        [0.38, "rgba(115, 46, 250, 0.26)"],
        [0.60, "rgba(15, 209, 250, 0.14)"],
        [0.82, "rgba(31, 89, 235, 0.04)"],
        [1.00, "rgba(0, 0, 0, 0)"]
      ],
      core: [
        [0.00, "rgba(255, 255, 235, 0.95)"],
        [0.28, "rgba(255, 217, 102, 0.85)"],
        [0.62, "rgba(242, 76, 191, 0.55)"],
        [1.00, "rgba(0, 0, 0, 0)"]
      ],
      surge: [
        [0.00, "rgba(255, 255, 242, 0.85)"],
        [0.12, "rgba(255, 102, 178, 0.70)"],
        [0.30, "rgba(217, 46, 235, 0.52)"],
        [0.52, "rgba(89, 64, 250, 0.32)"],
        [0.72, "rgba(20, 204, 250, 0.16)"],
        [0.90, "rgba(25, 89, 217, 0.04)"],
        [1.00, "rgba(0, 0, 0, 0)"]
      ]
    },
    heavenly: {
      wash: [
        [0.00, "rgba(255, 255, 255, 0.68)"],
        [0.10, "rgba(255, 235, 191, 0.52)"],
        [0.25, "rgba(242, 166, 235, 0.36)"],
        [0.50, "rgba(140, 153, 250, 0.20)"],
        [0.75, "rgba(64, 217, 250, 0.08)"],
        [1.00, "rgba(0, 0, 0, 0)"]
      ],
      core: [
        [0.00, "rgba(255, 255, 255, 0.95)"],
        [0.28, "rgba(255, 242, 204, 0.85)"],
        [0.62, "rgba(217, 166, 250, 0.55)"],
        [1.00, "rgba(0, 0, 0, 0)"]
      ],
      surge: [
        [0.00, "rgba(255, 255, 255, 0.85)"],
        [0.14, "rgba(255, 235, 191, 0.70)"],
        [0.32, "rgba(242, 153, 230, 0.52)"],
        [0.55, "rgba(140, 153, 250, 0.30)"],
        [0.78, "rgba(64, 217, 250, 0.14)"],
        [1.00, "rgba(0, 0, 0, 0)"]
      ]
    },
    liquid: {
      wash: [
        [0.00, "rgba(230, 255, 255, 0.70)"],
        [0.10, "rgba(38, 235, 217, 0.52)"],
        [0.28, "rgba(20, 173, 242, 0.38)"],
        [0.52, "rgba(20, 107, 235, 0.20)"],
        [0.75, "rgba(13, 51, 191, 0.08)"],
        [1.00, "rgba(0, 0, 0, 0)"]
      ],
      core: [
        [0.00, "rgba(255, 255, 255, 0.95)"],
        [0.28, "rgba(89, 255, 242, 0.85)"],
        [0.62, "rgba(20, 166, 242, 0.55)"],
        [1.00, "rgba(0, 0, 0, 0)"]
      ],
      surge: [
        [0.00, "rgba(255, 255, 255, 0.85)"],
        [0.14, "rgba(89, 242, 255, 0.70)"],
        [0.32, "rgba(20, 217, 230, 0.52)"],
        [0.56, "rgba(20, 140, 242, 0.30)"],
        [0.78, "rgba(13, 76, 217, 0.14)"],
        [1.00, "rgba(0, 0, 0, 0)"]
      ]
    },
    plasma: {
      wash: [
        [0.00, "rgba(250, 255, 255, 0.70)"],
        [0.10, "rgba(242, 51, 242, 0.52)"],
        [0.26, "rgba(184, 25, 250, 0.38)"],
        [0.50, "rgba(64, 38, 242, 0.20)"],
        [0.75, "rgba(20, 191, 250, 0.08)"],
        [1.00, "rgba(0, 0, 0, 0)"]
      ],
      core: [
        [0.00, "rgba(255, 255, 255, 0.95)"],
        [0.28, "rgba(102, 242, 255, 0.85)"],
        [0.62, "rgba(217, 51, 242, 0.55)"],
        [1.00, "rgba(0, 0, 0, 0)"]
      ],
      surge: [
        [0.00, "rgba(255, 255, 255, 0.85)"],
        [0.14, "rgba(89, 242, 255, 0.70)"],
        [0.32, "rgba(242, 46, 242, 0.52)"],
        [0.55, "rgba(140, 31, 250, 0.30)"],
        [0.78, "rgba(25, 166, 250, 0.14)"],
        [1.00, "rgba(0, 0, 0, 0)"]
      ]
    },
    solar: {
      wash: [
        [0.00, "rgba(255, 255, 217, 0.70)"],
        [0.10, "rgba(255, 204, 51, 0.54)"],
        [0.26, "rgba(250, 97, 20, 0.38)"],
        [0.50, "rgba(230, 31, 31, 0.22)"],
        [0.75, "rgba(166, 13, 46, 0.08)"],
        [1.00, "rgba(0, 0, 0, 0)"]
      ],
      core: [
        [0.00, "rgba(255, 255, 235, 0.95)"],
        [0.28, "rgba(255, 224, 76, 0.85)"],
        [0.62, "rgba(242, 89, 25, 0.55)"],
        [1.00, "rgba(0, 0, 0, 0)"]
      ],
      surge: [
        [0.00, "rgba(255, 255, 230, 0.85)"],
        [0.14, "rgba(255, 204, 64, 0.70)"],
        [0.32, "rgba(255, 115, 20, 0.52)"],
        [0.56, "rgba(230, 46, 20, 0.30)"],
        [0.78, "rgba(178, 20, 38, 0.14)"],
        [1.00, "rgba(0, 0, 0, 0)"]
      ]
    }
  };

  function buildOpticalLuts() {
    const cx = LUT_W;
    const cy = LUT_H / 2;
    const maxR = LUT_W;

    Object.keys(THEME_STOPS).forEach((themeKey) => {
      const spec = THEME_STOPS[themeKey];

      // 1. Bezel Ambience LUT
      const c1 = document.createElement("canvas");
      c1.width = LUT_W;
      c1.height = LUT_H;
      const ctx1 = c1.getContext("2d");

      const washGrad = ctx1.createRadialGradient(cx, cy, 0, cx, cy, maxR);
      spec.wash.forEach(([stop, col]) => washGrad.addColorStop(stop, col));
      ctx1.fillStyle = washGrad;
      ctx1.fillRect(0, 0, LUT_W, LUT_H);

      const coreGrad = ctx1.createRadialGradient(cx, cy, 0, cx, cy, maxR * 0.9);
      spec.core.forEach(([stop, col]) => coreGrad.addColorStop(stop, col));
      ctx1.fillStyle = coreGrad;
      ctx1.fillRect(0, 0, LUT_W, LUT_H);
      themeLuts[themeKey] = c1;

      // 2. Full-Screen Drop Surge LUT
      const c2 = document.createElement("canvas");
      c2.width = LUT_W;
      c2.height = LUT_H;
      const ctx2 = c2.getContext("2d");

      const surgeGrad = ctx2.createRadialGradient(cx, cy, 0, cx, cy, maxR);
      spec.surge.forEach(([stop, col]) => surgeGrad.addColorStop(stop, col));
      ctx2.fillStyle = surgeGrad;
      ctx2.fillRect(0, 0, LUT_W, LUT_H);
      surgeLuts[themeKey] = c2;
    });
  }

  buildOpticalLuts();

  // Desktop Stage Overlay State (Spring-coupled)
  const overlayState = {
    activeEdge: "right",
    activeCorner: "",
    targetCoord: 0.5,
    currentCoord: 0.5,
    coordVelocity: 0.0,
    targetIntensity: 0.0,
    currentIntensity: 0.0,
    targetPressure: 0.5,
    currentPressure: 0.5,
    currentVy: 0.0,
    lastInteractionTime: 0,
    // Full-screen confirmation surge wave
    confirmActive: false,
    confirmProgress: 0.0,
    confirmStartTime: 0,
    confirmEdge: "right",
    confirmCoord: 0.5,
    // Hamiltonian water caustic ripples
    causticWaves: [],
    // Drop confirmation card
    cardActive: false,
    cardFilename: "",
    cardSizeStr: "",
    cardLatencyStr: "0.4ms",
    cardEdge: "right",
    cardCoord: 0.5,
    cardStartTime: 0,
    cardDuration: 1450,
    cardProgress: 0.0,
    // Render loop status
    isTicking: false,
    startTime: performance.now()
  };

  function ensureStageTicking() {
    if (!overlayState.isTicking) {
      overlayState.isTicking = true;
      requestAnimationFrame(tickDesktopOverlay);
    }
  }

  function spawnCausticRipple(edge, coord) {
    if (!liquidGlassEnabled) return;
    overlayState.causticWaves.push({
      edge: edge || "right",
      coord: Number.isFinite(coord) ? coord : 0.5,
      born: performance.now(),
      duration: 820
    });
  }

  function triggerDesktopDropConfirmation(data) {
    const now = performance.now();
    overlayState.lastInteractionTime = now;

    const edge = data.corner
      ? `corner-${String(data.corner).toLowerCase()}`
      : String(data.edge || overlayState.activeEdge || "right").toLowerCase();
    const coord = Number.isFinite(Number(data.coord))
      ? Number(data.coord)
      : overlayState.currentCoord;

    overlayState.activeEdge = edge;
    overlayState.confirmEdge = edge;
    overlayState.confirmCoord = coord;
    overlayState.currentCoord = coord;
    overlayState.targetCoord = coord;

    overlayState.currentIntensity = 1.0;
    overlayState.targetIntensity = 0.0;

    overlayState.confirmActive = true;
    overlayState.confirmProgress = 0.0;
    overlayState.confirmStartTime = now;

    spawnCausticRipple(edge, coord);

    const sizeBytes = Number(data.size || 0);
    const sizeStr =
      typeof data.size === "string" && data.size.includes("B")
        ? data.size
        : formatFileSize(sizeBytes || 284512);

    overlayState.cardActive = true;
    overlayState.cardFilename = data.filename || "Transferred_File";
    overlayState.cardSizeStr = sizeStr;
    overlayState.cardLatencyStr = data.latency_ms ? `${data.latency_ms}ms` : "0.4ms";
    overlayState.cardEdge = edge;
    overlayState.cardCoord = Math.max(0.14, Math.min(0.86, coord));
    overlayState.cardStartTime = now;
    overlayState.cardProgress = 0.0;

    ensureStageTicking();
  }

  function getEdgeOrigin(edge, coord, w, h) {
    if (edge.startsWith("corner-")) {
      const c = edge.replace("corner-", "");
      if (c === "top-right") return { x: w, y: 0, angle: -Math.PI / 4 };
      if (c === "bottom-right") return { x: w, y: h, angle: Math.PI / 4 };
      if (c === "top-left") return { x: 0, y: 0, angle: (-3 * Math.PI) / 4 };
      return { x: 0, y: h, angle: (3 * Math.PI) / 4 };
    }
    if (edge === "left") return { x: 0, y: coord * h, angle: Math.PI };
    if (edge === "top") return { x: coord * w, y: 0, angle: -Math.PI / 2 };
    if (edge === "bottom") return { x: coord * w, y: h, angle: Math.PI / 2 };
    return { x: w, y: coord * h, angle: 0 };
  }

  function drawStageAmbience(ctx, w, h, tSec) {
    const intensity = overlayState.currentIntensity;
    if (intensity <= 0.004) return;

    const edge = overlayState.activeEdge || "right";
    const coord = overlayState.currentCoord;
    const pressureScale = 0.90 + overlayState.currentPressure * 0.45;

    const breathe = 1.0 + 0.055 * Math.sin(tSec * 2.6) + 0.025 * Math.sin(tSec * 5.2);
    const breatheY = 1.0 + 0.035 * Math.cos(tSec * 2.2);

    const origin = getEdgeOrigin(edge, coord, w, h);

    // Two-stage spatial dynamics:
    // Stage 1 (intensity <= 0.18): Sleek, elegant connection bead indicating initial touch / hold.
    // Stage 2 (intensity > 0.18): Massive Drooop organic liquid meniscus + deep volumetric sink!
    const swell = intensity <= 0.18 ? 0.0 : Math.pow((intensity - 0.18) / 0.82, 1.15);

    ctx.save();
    ctx.translate(origin.x, origin.y);
    ctx.rotate(origin.angle);

    if (edge === "left" || edge === "right") {
      const skewY = Math.max(-0.2, Math.min(0.2, -overlayState.currentVy * 0.16));
      ctx.transform(1, skewY, 0, 1, 0, 0);
    }

    // 1. Initial Touch / Hold Bead (ONLY shown initially during click & hold, fades out completely during drag!)
    const beadAlpha = Math.max(0.0, 1.0 - swell * 2.5) * Math.min(1.0, intensity / 0.18);
    if (beadAlpha > 0.01) {
      const beadRx = (110 + Math.min(0.18, intensity) * 60) * pressureScale * breathe;
      const beadRy = (190 + Math.min(0.18, intensity) * 80) * breatheY;
      ctx.save();
      ctx.scale(beadRx / 100, beadRy / 100);
      const beadGrad = ctx.createRadialGradient(0, 0, 2, 0, 0, 100);
      if (activeTheme === "plasma") {
        beadGrad.addColorStop(0, `rgba(255, 255, 255, ${(0.90 * beadAlpha).toFixed(2)})`);
        beadGrad.addColorStop(0.25, `rgba(184, 89, 250, ${(0.70 * beadAlpha).toFixed(2)})`);
        beadGrad.addColorStop(0.60, `rgba(64, 51, 230, ${(0.35 * beadAlpha).toFixed(2)})`);
        beadGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
      } else if (activeTheme === "solar") {
        beadGrad.addColorStop(0, `rgba(255, 255, 255, ${(0.92 * beadAlpha).toFixed(2)})`);
        beadGrad.addColorStop(0.25, `rgba(255, 209, 64, ${(0.72 * beadAlpha).toFixed(2)})`);
        beadGrad.addColorStop(0.60, `rgba(242, 89, 20, ${(0.35 * beadAlpha).toFixed(2)})`);
        beadGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
      } else if (activeTheme === "liquid") {
        beadGrad.addColorStop(0, `rgba(242, 255, 255, ${(0.90 * beadAlpha).toFixed(2)})`);
        beadGrad.addColorStop(0.25, `rgba(51, 235, 230, ${(0.70 * beadAlpha).toFixed(2)})`);
        beadGrad.addColorStop(0.60, `rgba(20, 166, 217, ${(0.35 * beadAlpha).toFixed(2)})`);
        beadGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
      } else {
        // aurora
        beadGrad.addColorStop(0, `rgba(255, 255, 250, ${(0.92 * beadAlpha).toFixed(2)})`);
        beadGrad.addColorStop(0.22, `rgba(255, 140, 191, ${(0.72 * beadAlpha).toFixed(2)})`);
        beadGrad.addColorStop(0.55, `rgba(166, 76, 242, ${(0.38 * beadAlpha).toFixed(2)})`);
        beadGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
      }
      ctx.beginPath();
      ctx.arc(0, 0, 100, Math.PI / 2, (3 * Math.PI) / 2);
      ctx.fillStyle = beadGrad;
      ctx.fill();
      ctx.restore();
    }

    // 2. Main Full-Screen Drooop Ambience (Completely covers the display from right bezel!)
    if (swell > 0.02) {
      const vStretch = (1.0 + Math.min(0.35, Math.abs(overlayState.currentVy || 0) * 0.25)) * breatheY;
      const radiusX = (w * 0.75 + swell * w * 0.60) * pressureScale * breathe;
      const radiusY = Math.max(1000.0, h * 1.05 + swell * h * 0.50) * vStretch;

      // Tier 1: Living Deep Atmospheric Ambient Wash (Sinks across 100% of the display wallpaper)
      ctx.save();
      const washRx = radiusX * 1.35;
      const washRy = radiusY * 1.20;
      ctx.scale(washRx, washRy);
      const volGrad = ctx.createRadialGradient(0, 0, 0.02, 0, 0, 1.0);
      if (activeTheme === "plasma") {
        volGrad.addColorStop(0, `rgba(242, 89, 242, ${(0.48 * swell).toFixed(2)})`);
        volGrad.addColorStop(0.30, `rgba(166, 64, 230, ${(0.28 * swell).toFixed(2)})`);
        volGrad.addColorStop(0.65, `rgba(64, 89, 166, ${(0.12 * swell).toFixed(2)})`);
        volGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
      } else if (activeTheme === "solar") {
        volGrad.addColorStop(0, `rgba(255, 217, 76, ${(0.48 * swell).toFixed(2)})`);
        volGrad.addColorStop(0.30, `rgba(250, 122, 31, ${(0.28 * swell).toFixed(2)})`);
        volGrad.addColorStop(0.65, `rgba(178, 46, 13, ${(0.12 * swell).toFixed(2)})`);
        volGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
      } else if (activeTheme === "liquid") {
        volGrad.addColorStop(0, `rgba(38, 245, 230, ${(0.50 * swell).toFixed(2)})`);
        volGrad.addColorStop(0.28, `rgba(20, 199, 224, ${(0.30 * swell).toFixed(2)})`);
        volGrad.addColorStop(0.65, `rgba(10, 128, 191, ${(0.14 * swell).toFixed(2)})`);
        volGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
      } else {
        // aurora / heavenly
        volGrad.addColorStop(0, `rgba(76, 235, 255, ${(0.52 * swell).toFixed(2)})`);
        volGrad.addColorStop(0.28, `rgba(166, 97, 235, ${(0.32 * swell).toFixed(2)})`);
        volGrad.addColorStop(0.60, `rgba(20, 140, 204, ${(0.14 * swell).toFixed(2)})`);
        volGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
      }
      ctx.beginPath();
      ctx.arc(0, 0, 1.0, Math.PI / 2, (3 * Math.PI) / 2);
      ctx.fillStyle = volGrad;
      ctx.fill();
      ctx.restore();

      // Tier 2: Magnificent Incandescent Chromatic Dispersion Veil
      ctx.save();
      ctx.scale(radiusX, radiusY);
      const lutGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, 1.0);
      if (activeTheme === "plasma") {
        lutGrad.addColorStop(0.00, `rgba(255, 255, 255, ${(0.98 * swell).toFixed(2)})`);
        lutGrad.addColorStop(0.20, `rgba(242, 102, 255, ${(0.85 * swell).toFixed(2)})`);
        lutGrad.addColorStop(0.45, `rgba(191, 64, 250, ${(0.62 * swell).toFixed(2)})`);
        lutGrad.addColorStop(0.70, `rgba(115, 38, 224, ${(0.35 * swell).toFixed(2)})`);
        lutGrad.addColorStop(0.88, `rgba(56, 20, 153, ${(0.14 * swell).toFixed(2)})`);
        lutGrad.addColorStop(1.00, "rgba(0, 0, 0, 0)");
      } else if (activeTheme === "solar") {
        lutGrad.addColorStop(0.00, `rgba(255, 252, 240, ${(0.98 * swell).toFixed(2)})`);
        lutGrad.addColorStop(0.22, `rgba(255, 209, 89, ${(0.85 * swell).toFixed(2)})`);
        lutGrad.addColorStop(0.48, `rgba(250, 140, 51, ${(0.60 * swell).toFixed(2)})`);
        lutGrad.addColorStop(0.72, `rgba(230, 89, 38, ${(0.32 * swell).toFixed(2)})`);
        lutGrad.addColorStop(0.88, `rgba(191, 46, 20, ${(0.12 * swell).toFixed(2)})`);
        lutGrad.addColorStop(1.00, "rgba(0, 0, 0, 0)");
      } else if (activeTheme === "liquid") {
        lutGrad.addColorStop(0.00, `rgba(255, 255, 255, ${(1.00 * swell).toFixed(2)})`);
        lutGrad.addColorStop(0.25, `rgba(245, 255, 255, ${(0.95 * swell).toFixed(2)})`);
        lutGrad.addColorStop(0.50, `rgba(89, 242, 250, ${(0.75 * swell).toFixed(2)})`);
        lutGrad.addColorStop(0.72, `rgba(38, 204, 235, ${(0.45 * swell).toFixed(2)})`);
        lutGrad.addColorStop(0.88, `rgba(20, 140, 199, ${(0.18 * swell).toFixed(2)})`);
        lutGrad.addColorStop(1.00, "rgba(0, 0, 0, 0)");
      } else {
        // aurora: Exact Drooop Chromatic Dispersion
        lutGrad.addColorStop(0.00, `rgba(255, 255, 255, ${(1.00 * swell).toFixed(2)})`);
        lutGrad.addColorStop(0.50, `rgba(255, 255, 255, ${(0.98 * swell).toFixed(2)})`);
        lutGrad.addColorStop(0.62, `rgba(255, 240, 184, ${(0.92 * swell).toFixed(2)})`);
        lutGrad.addColorStop(0.72, `rgba(255, 166, 191, ${(0.82 * swell).toFixed(2)})`);
        lutGrad.addColorStop(0.82, `rgba(209, 158, 250, ${(0.58 * swell).toFixed(2)})`);
        lutGrad.addColorStop(0.90, `rgba(97, 209, 255, ${(0.30 * swell).toFixed(2)})`);
        lutGrad.addColorStop(0.96, `rgba(38, 153, 230, ${(0.10 * swell).toFixed(2)})`);
        lutGrad.addColorStop(1.00, "rgba(0, 0, 0, 0)");
      }
      ctx.beginPath();
      ctx.arc(0, 0, 1.0, Math.PI / 2, (3 * Math.PI) / 2);
      ctx.fillStyle = lutGrad;
      ctx.fill();
      ctx.restore();

      // Tier 3: Molten Specular Core Arc (Intense living brilliance right at the glass bezel)
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      const coreR = (240 + swell * 360) * pressureScale * (1.0 + 0.08 * Math.sin(tSec * 4.2));
      ctx.scale(coreR * 0.75, coreR * 1.55);
      const specGrad = ctx.createRadialGradient(0, 0, 0.02, 0, 0, 1.0);
      specGrad.addColorStop(0.00, `rgba(255, 255, 255, ${(0.98 * swell).toFixed(2)})`);
      specGrad.addColorStop(0.25, `rgba(255, 255, 255, ${(0.80 * swell).toFixed(2)})`);
      specGrad.addColorStop(0.60, `rgba(242, 217, 255, ${(0.40 * swell).toFixed(2)})`);
      specGrad.addColorStop(1.00, "rgba(0, 0, 0, 0)");
      ctx.beginPath();
      ctx.arc(0, 0, 1.0, Math.PI / 2, (3 * Math.PI) / 2);
      ctx.fillStyle = specGrad;
      ctx.fill();
      ctx.restore();

      // Tier 4: Molten Bezel Rim Light (Luminous glass edge line)
      ctx.save();
      const rimH = Math.min(h, h * 0.40 + swell * h * 0.50);
      const rimGrad = ctx.createLinearGradient(-4, 0, 0, 0);
      rimGrad.addColorStop(0, "rgba(51, 204, 255, 0)");
      rimGrad.addColorStop(1, `rgba(255, 255, 255, ${(0.95 * swell).toFixed(2)})`);
      ctx.fillStyle = rimGrad;
      ctx.fillRect(-4, -rimH / 2, 4, rimH);
      ctx.restore();
    }

    ctx.restore(); // restore origin transform
  }

  function drawStageSurgeAndCaustics(ctx, w, h, now) {
    // 1. Full-Screen Atmospheric Radiance Surge
    if (overlayState.confirmActive) {
      const progress = overlayState.confirmProgress;
      if (progress > 0.001 && progress < 1.0) {
        const lut = surgeLuts[activeTheme] || surgeLuts.heavenly;
        const ease = 1.0 - Math.pow(1.0 - progress, 2.6);
        const damping = Math.pow(Math.max(0.0, 1.0 - progress), 1.45);

        if (damping > 0.005) {
          const maxReach = Math.hypot(w, h) * 1.18;
          const rx = 220 + ease * (maxReach - 220);
          const ry = Math.max(rx * 1.15, h * 1.55);
          const origin = getEdgeOrigin(
            overlayState.confirmEdge,
            overlayState.confirmCoord,
            w,
            h
          );

          ctx.save();
          ctx.translate(origin.x, origin.y);
          ctx.rotate(origin.angle);
          ctx.scale(rx / LUT_W, ry / (LUT_H / 2));
          ctx.translate(-LUT_W, -LUT_H / 2);
          ctx.globalAlpha = damping * 0.98;
          ctx.drawImage(lut, 0, 0);
          ctx.restore();
        }
      }
    }

    // 2. High-Energy Supernova Burst Rays on Entry
    if (overlayState.confirmActive && overlayState.confirmProgress < 0.40) {
      const burstP = overlayState.confirmProgress / 0.40;
      const burstAlpha = Math.pow(1.0 - burstP, 2);
      const maxReach = Math.hypot(w, h) * 1.18;
      const origin = getEdgeOrigin(overlayState.confirmEdge, overlayState.confirmCoord, w, h);
      ctx.save();
      ctx.translate(origin.x, origin.y);
      ctx.rotate(origin.angle);
      const numBurstRays = 12;
      const rayLen = maxReach * 0.55 * burstP;
      for (let i = 0; i < numBurstRays; i++) {
        const angle = (i - (numBurstRays - 1) / 2) * 0.22;
        ctx.save();
        ctx.rotate(angle);
        const rayGrad = ctx.createLinearGradient(0, 0, -rayLen, 0);
        if (i % 3 === 0) {
          rayGrad.addColorStop(0, `rgba(255, 230, 102, ${(burstAlpha * 0.90).toFixed(2)})`);
          rayGrad.addColorStop(1, "rgba(242, 51, 165, 0)");
        } else if (i % 3 === 1) {
          rayGrad.addColorStop(0, `rgba(242, 51, 217, ${(burstAlpha * 0.90).toFixed(2)})`);
          rayGrad.addColorStop(1, "rgba(115, 38, 242, 0)");
        } else {
          rayGrad.addColorStop(0, `rgba(51, 217, 255, ${(burstAlpha * 0.90).toFixed(2)})`);
          rayGrad.addColorStop(1, "rgba(25, 89, 242, 0)");
        }
        ctx.fillStyle = rayGrad;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-rayLen, -36 * burstP);
        ctx.lineTo(-rayLen, 36 * burstP);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();
    }

    // 3. Hamiltonian Damped Concentric Chromatic Water Caustic Rings
    for (let i = overlayState.causticWaves.length - 1; i >= 0; i--) {
      const wave = overlayState.causticWaves[i];
      const elapsed = now - wave.born;
      if (elapsed >= wave.duration) {
        overlayState.causticWaves.splice(i, 1);
        continue;
      }
      const p = elapsed / wave.duration;
      const easeOut = 1.0 - Math.pow(1.0 - p, 2.2);
      const env = Math.pow(1.0 - p, 1.65);
      const origin = getEdgeOrigin(wave.edge, wave.coord, w, h);
      const maxR = Math.hypot(w, h) * 0.75;
      const rPrimary = 36 + easeOut * maxR;

      ctx.save();
      ctx.translate(origin.x, origin.y);

      // Outer Magenta/Red dispersion crest
      ctx.beginPath();
      ctx.arc(0, 0, rPrimary + 14, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255, 64, 140, ${(0.65 * env).toFixed(3)})`;
      ctx.lineWidth = 2.8 * (1 - p * 0.5);
      ctx.stroke();

      // Primary Specular Caustic Shock Crest
      ctx.beginPath();
      ctx.arc(0, 0, rPrimary, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255, 255, 255, ${(0.88 * env).toFixed(3)})`;
      ctx.lineWidth = 3.6 * (1 - p * 0.5);
      ctx.stroke();

      // Inner Cyan/Turquoise dispersion ring
      if (rPrimary > 24) {
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(8, rPrimary - 14), 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(51, 224, 255, ${(0.70 * env).toFixed(3)})`;
        ctx.lineWidth = 2.6 * (1 - p * 0.4);
        ctx.stroke();
      }

      // Deep Violet dispersion trailing ring
      if (rPrimary > 48) {
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(6, rPrimary - 36), 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(165, 51, 250, ${(0.50 * env).toFixed(3)})`;
        ctx.lineWidth = 2.0 * (1 - p * 0.4);
        ctx.stroke();
      }

      ctx.restore();
    }

    // 4. Exploding Supernova Star Particles
    if (overlayState.confirmActive && overlayState.confirmProgress > 0.05 && overlayState.confirmProgress < 0.75) {
      const progress = overlayState.confirmProgress;
      const ease = 1.0 - Math.pow(1.0 - progress, 2.6);
      const damping = Math.pow(Math.max(0.0, 1.0 - progress), 1.45);
      const maxReach = Math.hypot(w, h) * 1.18;
      const origin = getEdgeOrigin(overlayState.confirmEdge, overlayState.confirmCoord, w, h);
      ctx.save();
      ctx.translate(origin.x, origin.y);
      ctx.rotate(origin.angle);
      const numSparks = 14;
      for (let i = 0; i < numSparks; i++) {
        const sparkAngle = (i / numSparks) * Math.PI * 2;
        const sparkDist = ease * maxReach * 0.45 * (0.65 + 0.35 * Math.abs(Math.sin(i * 1.7)));
        const sx = -sparkDist * Math.abs(Math.cos(sparkAngle));
        const sy = sparkDist * Math.sin(sparkAngle);
        const sparkR = (3.2 * damping) * (0.8 + 0.4 * Math.abs(Math.cos(i)));
        ctx.beginPath();
        ctx.arc(sx, sy, Math.max(0.5, sparkR), 0, Math.PI * 2);
        if (i % 3 === 0) {
          ctx.fillStyle = `rgba(255, 217, 89, ${(0.90 * damping).toFixed(2)})`;
        } else if (i % 3 === 1) {
          ctx.fillStyle = `rgba(255, 76, 178, ${(0.90 * damping).toFixed(2)})`;
        } else {
          ctx.fillStyle = `rgba(76, 230, 255, ${(0.90 * damping).toFixed(2)})`;
        }
        ctx.fill();
      }
      ctx.restore();
    }

  function roundRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawStageDropCard(ctx, w, h) {
    if (!overlayState.cardActive) return;

    const p = overlayState.cardProgress;
    const cardW = 290;
    const cardH = 74;
    const edge = overlayState.cardEdge || "right";
    const coord = overlayState.cardCoord;

    // Spring overshoot curve on entry, smooth ease-in on exit
    let offset = 1.0;
    if (p < 0.18) {
      const t = p / 0.18;
      const c1 = 1.70158;
      const c3 = c1 + 1;
      offset = 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    } else if (p > 0.74) {
      const t = (p - 0.74) / 0.26;
      offset = 1.0 - t * t;
    }

    let cardX = w - offset * (cardW + 28);
    let cardY = Math.max(36, Math.min(h - cardH - 36, coord * h - cardH / 2));

    if (edge === "left") {
      cardX = offset * (cardW + 28) - cardW;
    } else if (edge === "top") {
      cardX = Math.max(36, Math.min(w - cardW - 36, coord * w - cardW / 2));
      cardY = offset * (cardH + 28) - cardH;
    } else if (edge === "bottom") {
      cardX = Math.max(36, Math.min(w - cardW - 36, coord * w - cardW / 2));
      cardY = h - offset * (cardH + 28);
    } else if (edge.startsWith("corner-")) {
      const isRight = edge.includes("right");
      const isTop = edge.includes("top");
      cardX = isRight ? w - offset * (cardW + 28) : offset * (cardW + 28) - cardW;
      cardY = isTop ? offset * 100 - 20 : h - offset * 100 - cardH + 20;
    }

    const alpha = p > 0.74 ? Math.max(0, (1.0 - p) / 0.26) : 1.0;

    ctx.save();
    ctx.globalAlpha = alpha;

    // 1. Soft Ambient Drop Shadow
    ctx.shadowColor = "rgba(0, 0, 0, 0.65)";
    ctx.shadowBlur = 28;
    ctx.shadowOffsetY = 10;

    // 2. Frosted Obsidian Card Body
    roundRectPath(ctx, cardX, cardY, cardW, cardH, 16);
    const bgGrad = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY + cardH);
    bgGrad.addColorStop(0, "rgba(18, 24, 38, 0.94)");
    bgGrad.addColorStop(1, "rgba(10, 14, 24, 0.97)");
    ctx.fillStyle = bgGrad;
    ctx.fill();

    // Reset shadow for crisp strokes & typography
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // 3. Prismatic Chromatic Border
    const borderGrad = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY + cardH);
    borderGrad.addColorStop(0, "rgba(56, 189, 248, 0.85)");
    borderGrad.addColorStop(0.5, "rgba(192, 132, 252, 0.65)");
    borderGrad.addColorStop(1, "rgba(251, 191, 36, 0.75)");
    ctx.strokeStyle = borderGrad;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 4. Emerald/Cyan Success Icon Circle
    const iconCx = cardX + 30;
    const iconCy = cardY + cardH / 2;
    ctx.beginPath();
    ctx.arc(iconCx, iconCy, 17, 0, Math.PI * 2);
    const iconGrad = ctx.createLinearGradient(iconCx - 17, iconCy - 17, iconCx + 17, iconCy + 17);
    iconGrad.addColorStop(0, "#10b981");
    iconGrad.addColorStop(1, "#0284c7");
    ctx.fillStyle = iconGrad;
    ctx.fill();

    // 5. Crisp Vector Checkmark
    ctx.beginPath();
    ctx.moveTo(iconCx - 5.5, iconCy + 0.5);
    ctx.lineTo(iconCx - 1.5, iconCy + 4.8);
    ctx.lineTo(iconCx + 6.5, iconCy - 4.5);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();

    // 6. Typography: Filename & Latency Telemetry
    ctx.fillStyle = "#f8fafc";
    ctx.font = "700 13.5px 'Plus Jakarta Sans', sans-serif";
    const rawName = overlayState.cardFilename || "Transferred_File";
    const displayName = rawName.length > 23 ? rawName.slice(0, 20) + "..." : rawName;
    ctx.fillText(displayName, cardX + 58, cardY + 31);

    ctx.fillStyle = "#94a3b8";
    ctx.font = "500 11px 'JetBrains Mono', monospace";
    ctx.fillText(
      `~/Downloads · ${overlayState.cardSizeStr} · ${overlayState.cardLatencyStr}`,
      cardX + 58,
      cardY + 51
    );

    ctx.restore();
  }

  function tickDesktopOverlay(now) {
    if (!desktopCtx || !desktopCanvas) {
      overlayState.isTicking = false;
      return;
    }

    const frameStart = performance.now();
    const w = desktopCanvas.width;
    const h = desktopCanvas.height;
    const tSec = (now - overlayState.startTime) / 1000;

    // Auto-decay if idle > 2.5s
    if (
      !overlayState.confirmActive &&
      !overlayState.cardActive &&
      now - overlayState.lastInteractionTime > 2500
    ) {
      overlayState.targetIntensity = 0.0;
    }

    // Second-Order Under-Damped Spring Interpolation for Coordinate & Intensity
    const prevCoord = overlayState.currentCoord;
    const coordDiff = overlayState.targetCoord - overlayState.currentCoord;
    overlayState.coordVelocity = overlayState.coordVelocity * 0.72 + coordDiff * 0.28;
    overlayState.currentCoord += overlayState.coordVelocity;
    overlayState.currentVy =
      overlayState.currentVy * 0.78 + (overlayState.currentCoord - prevCoord) * 14 * 0.22;

    if (overlayState.confirmActive) {
      const elapsed = now - overlayState.confirmStartTime;
      overlayState.confirmProgress = Math.min(1.0, elapsed / 480);
      overlayState.currentIntensity = Math.pow(
        Math.max(0.0, 1.0 - overlayState.confirmProgress),
        2.0
      );
      if (overlayState.confirmProgress >= 1.0) {
        overlayState.confirmActive = false;
        overlayState.confirmProgress = 0.0;
        overlayState.currentIntensity = 0.0;
      }
    } else if (overlayState.targetIntensity <= 0.002) {
      overlayState.currentIntensity *= 0.84;
      if (overlayState.currentIntensity < 0.004) {
        overlayState.currentIntensity = 0.0;
      }
    } else {
      overlayState.currentIntensity +=
        (overlayState.targetIntensity - overlayState.currentIntensity) * 0.32;
    }

    overlayState.currentPressure +=
      (overlayState.targetPressure - overlayState.currentPressure) * 0.3;

    if (overlayState.cardActive) {
      const elapsed = now - overlayState.cardStartTime;
      if (elapsed >= overlayState.cardDuration) {
        overlayState.cardActive = false;
        overlayState.cardProgress = 0.0;
      } else {
        overlayState.cardProgress = elapsed / overlayState.cardDuration;
      }
    }

    // Clear & Draw Single-Pass Overlay
    desktopCtx.clearRect(0, 0, w, h);
    drawStageSurgeAndCaustics(desktopCtx, w, h, now);
    drawStageAmbience(desktopCtx, w, h, tSec);
    drawStageDropCard(desktopCtx, w, h);

    const frameCostMs = (performance.now() - frameStart).toFixed(2);
    const hasActiveWork =
      overlayState.confirmActive ||
      overlayState.cardActive ||
      overlayState.causticWaves.length > 0 ||
      overlayState.currentIntensity > 0.004 ||
      overlayState.targetIntensity > 0.004;

    if (hasActiveWork) {
      if (waybarTelemetry) {
        waybarTelemetry.textContent = `${frameCostMs} ms · 120Hz LUT Active`;
      }
      requestAnimationFrame(tickDesktopOverlay);
    } else {
      desktopCtx.clearRect(0, 0, w, h);
      overlayState.isTicking = false;
      if (waybarTelemetry) {
        waybarTelemetry.textContent = `0.00 ms · Idle (0.0% CPU)`;
      }
    }
  }

  // =========================================================================
  // 3. WEBSOCKET REAL-TIME SIGNALING BUS
  // =========================================================================
  let ws = null;

  function connectWS() {
    if (ws) {
      try {
        ws.close();
      } catch {}
    }
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const tokenQuery = currentPortalToken
      ? `?portal=${encodeURIComponent(currentPortalToken)}`
      : "";
    try {
      ws = new WebSocket(`${protocol}//${targetHost}/ws${tokenQuery}`);
    } catch {
      return;
    }

    ws.onopen = () => {
      if (statusPill) statusPill.classList.add("connected");
      if (connectionStatusText) connectionStatusText.textContent = "Connected";
      const targetDot = document.getElementById("targetStatusDot");
      if (targetDot) targetDot.classList.add("connected");
      const hostBadge = document.getElementById("hostBadge");
      if (hostBadge) hostBadge.textContent = targetHost;
      fetchDeviceInfo();
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleIncomingWsMessage(msg);
      } catch {}
    };

    ws.onclose = () => {
      if (statusPill) statusPill.classList.remove("connected");
      if (connectionStatusText) connectionStatusText.textContent = "Reconnecting";
      const targetDot = document.getElementById("targetStatusDot");
      if (targetDot) targetDot.classList.remove("connected");
      setTimeout(connectWS, 2500);
    };

    ws.onerror = () => {
      if (ws) ws.close();
    };
  }

  function sendWS(msg) {
    // Also apply locally to the live Desktop Monitor Stage for 0ms local visual feedback!
    handleStageLocalFeedback(msg);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  function handleStageLocalFeedback(msg) {
    const type = msg.type;
    if (type === "drag_move" || type === "drag_start") {
      overlayState.lastInteractionTime = performance.now();
      if (msg.corner) {
        overlayState.activeCorner = String(msg.corner).toLowerCase();
        overlayState.activeEdge = `corner-${overlayState.activeCorner}`;
      } else if (msg.edge) {
        overlayState.activeCorner = "";
        overlayState.activeEdge = String(msg.edge).toLowerCase();
      }
      if (msg.coord !== undefined) {
        overlayState.targetCoord = Number(msg.coord);
        if (type === "drag_start") overlayState.currentCoord = overlayState.targetCoord;
      }
      const prox = Number(msg.proximity || 0);
      overlayState.targetIntensity = prox > 0.015 ? Math.min(1.0, prox) : 0.0;
      overlayState.targetPressure = Number(msg.pressure || 0.5);
      ensureStageTicking();
    } else if (type === "drag_edge_leave") {
      if (!overlayState.confirmActive && !overlayState.cardActive) {
        overlayState.targetIntensity = 0.0;
      }
      ensureStageTicking();
    } else if (type === "drag_drop") {
      triggerDesktopDropConfirmation(msg);
    } else if (type === "video_resume") {
      triggerDesktopDropConfirmation({
        edge: msg.edge || "right",
        corner: msg.corner || "",
        coord: msg.coord ?? 0.5,
        filename: msg.title || "Continuity Video Stream",
        size: `Resumed @ ${Number(msg.time || 0).toFixed(1)}s`,
        latency_ms: "0.2"
      });
      resumeDesktopMpvPlayer(Number(msg.time || 0), msg.title);
    }
  }

  function handleIncomingWsMessage(msg) {
    const type = msg.type;
    if (type === "init_state") {
      if (msg.config && msg.config.theme) {
        setTheme(msg.config.theme, false);
      }
      if (Array.isArray(msg.recent_transfers)) {
        renderReceivedFiles(msg.recent_transfers);
      }
      if (Array.isArray(msg.clipboard_history)) {
        renderClipboardHistory(msg.clipboard_history);
      }
    } else if (
      type === "drag_move" ||
      type === "drag_start" ||
      type === "drag_edge_leave"
    ) {
      handleStageLocalFeedback(msg);
    } else if (type === "drag_drop") {
      triggerDesktopDropConfirmation(msg);
      fetchReceivedFiles();
    } else if (type === "file_from_laptop") {
      triggerDesktopDropConfirmation({
        edge: "right",
        coord: 0.5,
        filename: msg.filename,
        size: msg.size,
        latency_ms: "0.6"
      });
      prependSharedFileCard(msg);
      fetchReceivedFiles();
      showToast(`Received ${msg.filename} from Desktop`);
    } else if (type === "video_resume") {
      handleStageLocalFeedback(msg);
    } else if (type === "text_received") {
      fetchClipboardHistory();
      if (msg.sender === "desktop") {
        const input = document.getElementById("quickTextInput");
        if (input) input.value = msg.text;
        showToast("Clipboard synced from Desktop");
      } else {
        showToast("Clipboard received on Desktop (wl-copy)");
      }
    } else if (type === "set_effect" && msg.theme) {
      setTheme(msg.theme, false);
    } else if (type === "stage_ready") {
      if (stagingStatusBadge) {
        stagingStatusBadge.textContent = `Pre-Staged: ${msg.filename}`;
      }
    } else if (type === "devices_updated") {
      renderSecurityDevices(msg.mode, msg.devices);
    } else if (type === "portal_mode_changed" || type === "portal_rotated") {
      checkPortalAuthorization();
      refreshQrImages();
    }
  }

  // =========================================================================
  // 4. THEME, MODE & FILTER CONTROLLERS
  // =========================================================================
  function setMode(mode, notify = true) {
    currentMode = mode;
    localStorage.setItem("drap_gesture_mode", mode);
    if (mode === "transfer") {
      body.classList.add("mode-transfer");
      if (tabTransfer) tabTransfer.classList.add("active");
      if (tabBrowse) tabBrowse.classList.remove("active");
      if (quickModeLabel) quickModeLabel.textContent = "Direct Flick";
      if (gestureHintText) {
        gestureHintText.textContent =
          "Direct Flick active: Drag any card toward any bezel to beam immediately";
      }
      if (notify) showToast("Direct Flick Mode: Drag immediately toward any bezel");
    } else {
      body.classList.remove("mode-transfer");
      if (tabBrowse) tabBrowse.classList.add("active");
      if (tabTransfer) tabTransfer.classList.remove("active");
      if (quickModeLabel) quickModeLabel.textContent = "Hold-to-Lift";
      if (gestureHintText) {
        gestureHintText.textContent =
          "Browse Mode: Tap photos to preview, or hold 180ms / flick horizontally to beam";
      }
      if (notify) showToast("Browse Mode: Hold 180ms to lift card");
    }
    haptic(12);
  }

  setMode(currentMode, false);

  if (tabBrowse) tabBrowse.addEventListener("click", () => setMode("browse", true));
  if (tabTransfer) tabTransfer.addEventListener("click", () => setMode("transfer", true));
  if (toggleModeQuickBtn) {
    toggleModeQuickBtn.addEventListener("click", () => {
      setMode(currentMode === "transfer" ? "browse" : "transfer", true);
    });
  }

  function setTheme(theme, broadcast = true) {
    activeTheme = theme;
    localStorage.setItem("drap_effect_theme", theme);
    body.setAttribute("data-theme", theme);

    document.querySelectorAll(".theme-pill").forEach((pill) => {
      pill.classList.toggle("active", pill.getAttribute("data-theme") === theme);
    });
    document.querySelectorAll(".shader-tab").forEach((tab) => {
      tab.classList.toggle("active", tab.getAttribute("data-theme-select") === theme);
    });

    // Brief preview glow on Desktop Stage when switching shader theme
    overlayState.lastInteractionTime = performance.now();
    overlayState.targetIntensity = 0.85;
    overlayState.currentIntensity = Math.max(overlayState.currentIntensity, 0.65);
    ensureStageTicking();
    setTimeout(() => {
      if (!activeDrag) overlayState.targetIntensity = 0.0;
    }, 650);

    if (broadcast) {
      sendWS({ type: "set_effect", theme });
      fetch("/api/effect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme })
      }).catch(() => {});
    }
    haptic(12);
  }

  body.setAttribute("data-theme", activeTheme);
  document.querySelectorAll(".theme-pill").forEach((pill) => {
    pill.classList.toggle("active", pill.getAttribute("data-theme") === activeTheme);
    pill.addEventListener("click", () => {
      const t = pill.getAttribute("data-theme");
      if (t) setTheme(t, true);
    });
  });

  document.querySelectorAll(".shader-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.getAttribute("data-theme-select") === activeTheme);
    tab.addEventListener("click", () => {
      const t = tab.getAttribute("data-theme-select");
      if (t) setTheme(t, true);
    });
  });

  // Category Filter Tabs
  document.querySelectorAll(".cat-pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".cat-pill").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      activeCategory = btn.getAttribute("data-cat") || "all";
      filterGrid();
    });
  });

  function filterGrid() {
    if (!mediaGrid) return;
    const cards = mediaGrid.querySelectorAll(".card-item");
    let visibleCount = 0;
    cards.forEach((card) => {
      const cat = card.getAttribute("data-cat") || "photo";
      if (activeCategory === "all" || cat === activeCategory) {
        card.style.display = "";
        visibleCount++;
      } else {
        card.style.display = "none";
      }
    });
    if (fileCountBadge) {
      fileCountBadge.textContent = `${visibleCount} item${visibleCount !== 1 ? "s" : ""}`;
    }
  }

  // =========================================================================
  // 5. UNIFIED POINTER EVENTS + SPRING PHYSICS GESTURE ENGINE
  // =========================================================================
  let activeDrag = null;
  let holdTimer = null;
  let isHoldLifted = false;
  let holdHeartbeatTimer = null;
  let pendingSpatialPacket = null;
  let rafSpatialId = null;

  let lastClientX = null;
  let lastClientY = null;
  let lastMoveTime = null;
  let smoothVelocityX = 0;
  let smoothVelocityY = 0;
  let lastHapticSector = null;

  function queueSpatialPacket(packet) {
    pendingSpatialPacket = packet;
    if (!rafSpatialId) {
      rafSpatialId = requestAnimationFrame(() => {
        if (pendingSpatialPacket) {
          sendWS(pendingSpatialPacket);
          pendingSpatialPacket = null;
        }
        rafSpatialId = null;
      });
    }
  }

  function startHoldHeartbeat() {
    if (holdHeartbeatTimer) clearInterval(holdHeartbeatTimer);
    holdHeartbeatTimer = setInterval(() => {
      if (activeDrag && lastClientX !== null && lastClientY !== null) {
        onDragStreaming(lastClientX, lastClientY);
      }
    }, 40);
  }

  function stopHoldHeartbeat() {
    if (holdHeartbeatTimer) {
      clearInterval(holdHeartbeatTimer);
      holdHeartbeatTimer = null;
    }
  }

  function triggerPickupRipple(px, py) {
    const ripple = document.createElement("div");
    ripple.className = "pickup-ripple";
    ripple.style.left = `${px}px`;
    ripple.style.top = `${py}px`;
    document.body.appendChild(ripple);
    setTimeout(() => {
      if (ripple.parentNode) ripple.parentNode.removeChild(ripple);
    }, 680);
  }

  function triggerMobileWaterWave(x, y) {
    const container = document.getElementById("mobileRippleContainer");
    if (!container) return;
    const wave = document.createElement("div");
    wave.className = "mobile-water-wave";
    wave.style.left = `${x}px`;
    wave.style.top = `${y}px`;
    container.appendChild(wave);
    setTimeout(() => {
      if (wave.parentNode) wave.parentNode.removeChild(wave);
    }, 500);
  }

  // Speculative Pre-Upload Controller (0ms Perceived Drop Latency)
  async function launchSpeculativePreUpload(drag) {
    if (!drag || drag.itemType === "video") return;
    const stageId = `stg_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    const abortCtrl = new AbortController();
    drag.stageId = stageId;
    drag.stageAbort = abortCtrl;
    drag.isStaged = false;

    if (stagingStatusBadge) {
      stagingStatusBadge.textContent = `Staging ${drag.title}...`;
    }

    drag.stagePromise = (async () => {
      try {
        let payload = drag.payload;
        if (typeof payload === "string") {
          const r = await fetch(payload, { signal: abortCtrl.signal });
          payload = await r.blob();
        }
        if (abortCtrl.signal.aborted || !payload) return;

        const formData = new FormData();
        formData.append("file", payload, drag.title);
        formData.append("stage_id", stageId);
        if (currentPortalToken) formData.append("portal", currentPortalToken);

        const res = await fetch("/api/stage_upload", {
          method: "POST",
          headers: currentPortalToken ? { "X-Drap-Portal": currentPortalToken } : {},
          body: formData,
          signal: abortCtrl.signal
        });
        if (res.ok) {
          drag.isStaged = true;
        }
      } catch {}
    })();
  }

  function getHandsetBounds() {
    if (appShell && window.innerWidth >= 1024) {
      return appShell.getBoundingClientRect();
    }
    return {
      left: 0,
      top: 0,
      right: window.innerWidth,
      bottom: window.innerHeight,
      width: window.innerWidth,
      height: window.innerHeight
    };
  }

  function computeSpatialMetrics(clientX, clientY) {
    const bounds = getHandsetBounds();
    const relX = clientX - bounds.left;
    const relY = clientY - bounds.top;
    const w = Math.max(1, bounds.width);
    const h = Math.max(1, bounds.height);

    const normX = Math.max(0.02, Math.min(0.98, relX / w));
    const normY = Math.max(0.02, Math.min(0.98, relY / h));

    const reachH = Math.min(135, Math.max(85, w * 0.32));
    const reachV = Math.min(125, Math.max(80, h * 0.22));

    const distLeft = Math.max(0, relX);
    const distRight = Math.max(0, w - relX);
    const distTop = Math.max(0, relY);
    const distBottom = Math.max(0, h - relY);

    let phoneEdge = "right";
    let desktopEdge = "right";
    let phoneCorner = "";
    let desktopCorner = "";
    let normCoord = normY;
    let proximity = 0.0;

    const proxL = distLeft < reachH ? Math.pow((reachH - distLeft) / reachH, 1.12) : 0.0;
    const proxR = distRight < reachH ? Math.pow((reachH - distRight) / reachH, 1.12) : 0.0;
    const proxT = distTop < reachV ? Math.pow((reachV - distTop) / reachV, 1.12) : 0.0;
    const proxB = distBottom < reachV ? Math.pow((reachV - distBottom) / reachV, 1.12) : 0.0;

    // Omnidirectional phone send: Moving toward ANY bezel on phone smoothly drives proximity to 1.0!
    const maxProx = Math.max(proxL, proxR, proxT, proxB);
    let proximity = maxProx;

    // phoneEdge / phoneCorner controls the glowing feedback on the handset chassis itself
    let phoneEdge = "right";
    let phoneCorner = "";
    if (proxR > 0.05 && proxT > 0.05) phoneCorner = "top-right";
    else if (proxR > 0.05 && proxB > 0.05) phoneCorner = "bottom-right";
    else if (proxL > 0.05 && proxT > 0.05) phoneCorner = "top-left";
    else if (proxL > 0.05 && proxB > 0.05) phoneCorner = "bottom-left";
    else if (maxProx === proxL) phoneEdge = "left";
    else if (maxProx === proxT) phoneEdge = "top";
    else if (maxProx === proxB) phoneEdge = "bottom";
    else phoneEdge = "right";

    // Desktop Edge arrival: Strictly RIGHT bezel by default!
    let desktopEdge = "right";
    let desktopCorner = "";
    let normCoord = normY;

    if (targetEdgePref === "left") {
      desktopEdge = "left";
      normCoord = normY;
    } else if (targetEdgePref === "top") {
      desktopEdge = "top";
      normCoord = normX;
    } else if (targetEdgePref === "bottom") {
      desktopEdge = "bottom";
      normCoord = normX;
    } else {
      // Default standard desktop arrival: RIGHT BEZEL
      desktopEdge = "right";
      desktopCorner = "";
      normCoord = normY;
    }

    return {
      bounds,
      relX,
      relY,
      normX,
      normY,
      normCoord,
      phoneEdge,
      desktopEdge,
      phoneCorner,
      desktopCorner,
      proximity
    };
  }

  function onDragStreaming(clientX, clientY) {
    const now = performance.now();
    if (lastClientY !== null && lastMoveTime !== null) {
      const dt = Math.max(1, now - lastMoveTime);
      const dy = clientY - lastClientY;
      const dx = clientX - (lastClientX !== null ? lastClientX : clientX);
      smoothVelocityY = smoothVelocityY * 0.68 + (dy / dt) * 0.32;
      smoothVelocityX = smoothVelocityX * 0.68 + (dx / dt) * 0.32;
    }
    lastClientX = clientX;
    lastClientY = clientY;
    lastMoveTime = now;

    const m = computeSpatialMetrics(clientX, clientY);
    const proximity = m.proximity;
    const pressure = 0.5 + proximity * 0.5;

    // Tactile haptic detent every 75px along bezel
    const travelCoord =
      m.phoneEdge === "top" || m.phoneEdge === "bottom" ? clientX : clientY;
    const sector = Math.floor(travelCoord / 75);
    if (lastHapticSector !== null && sector !== lastHapticSector && proximity > 0.08) {
      haptic(8);
    }
    lastHapticSector = sector;

    if (activeDrag) {
      activeDrag.normalizedX = m.normX;
      activeDrag.normalizedY = m.normY;
      activeDrag.normCoord = m.normCoord;
      activeDrag.phoneEdge = m.phoneEdge;
      activeDrag.desktopEdge = m.desktopEdge;
      activeDrag.phoneCorner = m.phoneCorner;
      activeDrag.desktopCorner = m.desktopCorner;
      activeDrag.lastProximity = proximity;
    }

    // Update Handset Chassis Inner Bezel Glow
    if (handsetBezelGlow) {
      if (proximity > 0.03) {
        handsetBezelGlow.style.opacity = Math.min(1, proximity * 1.35).toFixed(2);
        const glowOriginX = (m.normX * 100).toFixed(1);
        const glowOriginY = (m.normY * 100).toFixed(1);
        let grad;
        if (activeTheme === "aurora") {
          grad = `radial-gradient(circle at ${glowOriginX}% ${glowOriginY}%, rgba(255,255,255,0.70) 0%, rgba(255,107,157,0.55) 25%, rgba(192,38,211,0.42) 50%, rgba(6,182,212,0.25) 75%, transparent 92%)`;
        } else if (activeTheme === "plasma") {
          grad = `radial-gradient(circle at ${glowOriginX}% ${glowOriginY}%, rgba(255,255,255,0.70) 0%, rgba(244,114,182,0.55) 25%, rgba(168,85,247,0.42) 50%, rgba(59,130,246,0.25) 75%, transparent 92%)`;
        } else if (activeTheme === "solar") {
          grad = `radial-gradient(circle at ${glowOriginX}% ${glowOriginY}%, rgba(255,255,255,0.70) 0%, rgba(251,191,36,0.55) 25%, rgba(249,115,22,0.42) 50%, rgba(220,38,38,0.25) 75%, transparent 92%)`;
        } else if (activeTheme === "liquid") {
          grad = `radial-gradient(circle at ${glowOriginX}% ${glowOriginY}%, rgba(255,255,255,0.70) 0%, rgba(45,212,191,0.55) 25%, rgba(14,165,233,0.42) 50%, rgba(2,132,199,0.25) 75%, transparent 92%)`;
        } else {
          // heavenly: iridescent opal
          grad = `radial-gradient(circle at ${glowOriginX}% ${glowOriginY}%, rgba(255,255,255,0.70) 0%, rgba(255,239,184,0.50) 25%, rgba(210,158,255,0.38) 50%, rgba(56,189,248,0.22) 75%, transparent 92%)`;
        }
        handsetBezelGlow.style.background = grad;
      } else {
        handsetBezelGlow.style.opacity = "0";
      }
    }

    // Update Full-Viewport Edge & Corner Bulbs (for standalone mobile view)
    const bulb = document.getElementById("phoneEdgeBulb");
    const cornerBulb = document.getElementById("phoneCornerBulb");
    if (window.innerWidth < 1024 && proximity > 0.04) {
      if (m.phoneCorner && cornerBulb) {
        if (bulb) bulb.style.display = "none";
        cornerBulb.className = `phone-corner-bulb corner-${m.phoneCorner}`;
        cornerBulb.style.display = "block";
        cornerBulb.style.opacity = Math.min(1.0, proximity * 1.6).toFixed(2);
        cornerBulb.style.transform = `scale(${(0.85 + proximity * 0.45).toFixed(2)})`;
      } else if (bulb) {
        if (cornerBulb) cornerBulb.style.display = "none";
        bulb.style.display = "block";
        bulb.style.opacity = Math.min(1.0, proximity * 1.8).toFixed(2);
        const push = (1.0 - proximity) * -65;
        const scale = 0.85 + proximity * 0.55;
        if (m.phoneEdge === "left") {
          bulb.style.left = "0";
          bulb.style.right = "auto";
          bulb.style.top = `${clientY}px`;
          bulb.style.bottom = "auto";
          bulb.style.transform = `translate3d(${push}%, -50%, 0) scale(${scale})`;
        } else if (m.phoneEdge === "right") {
          bulb.style.left = "auto";
          bulb.style.right = "0";
          bulb.style.top = `${clientY}px`;
          bulb.style.bottom = "auto";
          bulb.style.transform = `translate3d(${-push}%, -50%, 0) rotate(180deg) scale(${scale})`;
        } else if (m.phoneEdge === "top") {
          bulb.style.left = `${clientX}px`;
          bulb.style.right = "auto";
          bulb.style.top = "0";
          bulb.style.bottom = "auto";
          bulb.style.transform = `translate3d(-50%, ${push}%, 0) rotate(90deg) scale(${scale})`;
        } else {
          bulb.style.left = `${clientX}px`;
          bulb.style.right = "auto";
          bulb.style.top = "auto";
          bulb.style.bottom = "0";
          bulb.style.transform = `translate3d(-50%, ${-push}%, 0) rotate(-90deg) scale(${scale})`;
        }
      }
    } else {
      if (bulb) bulb.style.display = "none";
      if (cornerBulb) cornerBulb.style.display = "none";
    }

    // Update Floating Drag Ghost Position + Anisotropic Surface-Tension Squeeze
    if (dragGhost) {
      dragGhost.style.left = `${clientX}px`;
      dragGhost.style.top = `${clientY}px`;
      const velTilt = Math.max(-14, Math.min(14, smoothVelocityX * 10 + smoothVelocityY * 12));
      const squeezeX = proximity > 0.35 ? 1.0 - (proximity - 0.35) * 0.25 : 1.0;
      const squeezeY = proximity > 0.35 ? 1.0 + (proximity - 0.35) * 0.18 : 1.0;
      dragGhost.style.transform = `translate3d(-50%, -50%, 0) rotate(${velTilt.toFixed(1)}deg) scaleX(${(1.05 * squeezeX).toFixed(3)}) scaleY(${(1.05 * squeezeY).toFixed(3)})`;
      if (ghostSub) {
        ghostSub.textContent =
          proximity > 0.55
            ? `Release to beam via ${m.desktopCorner || m.desktopEdge} portal`
            : "Drag toward any bezel to beam";
      }
    }

    if (dragAura) {
      const auraScale = 0.8 + proximity * 0.34;
      const auraOpacity = Math.min(1.0, 0.72 + proximity * 0.28);
      dragAura.style.left = `${clientX}px`;
      dragAura.style.top = `${clientY}px`;
      dragAura.style.transform = `translate3d(-50%, -50%, 0) scale(${auraScale.toFixed(2)})`;
      dragAura.style.opacity = auraOpacity.toFixed(2);
    }

    queueSpatialPacket({
      type: "drag_move",
      edge: m.desktopEdge,
      corner: m.desktopCorner,
      phone_edge: m.phoneEdge,
      phone_corner: m.phoneCorner,
      coord: m.normCoord,
      x: m.normX,
      y: m.normY,
      vy: smoothVelocityY,
      proximity,
      pressure,
      title: activeDrag ? activeDrag.title : "",
      size: activeDrag ? activeDrag.size : "",
      item_type: activeDrag ? activeDrag.itemType : "photo",
      theme: activeTheme
    });
  }

  function finishDrag(clientX, clientY, cancelled = false) {
    if (rafSpatialId) {
      cancelAnimationFrame(rafSpatialId);
      rafSpatialId = null;
      pendingSpatialPacket = null;
    }
    stopHoldHeartbeat();
    document.body.classList.remove("is-dragging-active");

    if (handsetBezelGlow) handsetBezelGlow.style.opacity = "0";
    const bulb = document.getElementById("phoneEdgeBulb");
    const cornerBulb = document.getElementById("phoneCornerBulb");
    if (bulb) bulb.style.display = "none";
    if (cornerBulb) cornerBulb.style.display = "none";

    if (dragGhost) {
      dragGhost.style.display = "none";
      dragGhost.classList.remove("is-photo-ghost");
    }
    if (dragAura) {
      dragAura.style.opacity = "0";
      setTimeout(() => {
        if (!activeDrag && dragAura) dragAura.style.display = "none";
      }, 150);
    }

    const drag = activeDrag;
    activeDrag = null;

    const vx = smoothVelocityX;
    const vy = smoothVelocityY;
    const speed = Math.hypot(vx, vy);

    lastClientX = null;
    lastClientY = null;
    lastMoveTime = null;
    smoothVelocityX = 0;
    smoothVelocityY = 0;
    lastHapticSector = null;

    if (!drag || cancelled) {
      sendWS({ type: "drag_edge_leave" });
      return;
    }

    const m = computeSpatialMetrics(clientX, clientY);
    const bounds = m.bounds;
    const edgeThresholdH = Math.min(76, Math.max(54, bounds.width * 0.2));
    const edgeThresholdV = Math.min(76, Math.max(54, bounds.height * 0.15));

    // Also allow dropping directly onto the Desktop Monitor Stage on desktop screens!
    const monitorFrame = document.getElementById("waylandMonitorFrame");
    let droppedDirectlyOnMonitor = false;
    if (monitorFrame && window.innerWidth >= 1024) {
      const mRect = monitorFrame.getBoundingClientRect();
      if (
        clientX >= mRect.left - 30 &&
        clientX <= mRect.right + 30 &&
        clientY >= mRect.top - 30 &&
        clientY <= mRect.bottom + 30
      ) {
        droppedDirectlyOnMonitor = true;
      }
    }

    const crossedLeft = m.relX <= edgeThresholdH;
    const crossedRight = m.relX >= bounds.width - edgeThresholdH;
    const crossedTop = m.relY <= edgeThresholdV;
    const crossedBottom = m.relY >= bounds.height - edgeThresholdV;
    const fastFlickCross = (drag.lastProximity || 0) > 0.42 && speed > 0.65;

    const crossedThreshold =
      droppedDirectlyOnMonitor ||
      fastFlickCross ||
      (isMultiSideSend
        ? crossedLeft || crossedRight || crossedTop || crossedBottom
        : (m.phoneEdge === "left" ? crossedLeft : m.phoneEdge === "top" ? crossedTop : m.phoneEdge === "bottom" ? crossedBottom : crossedRight));

    if (crossedThreshold) {
      const dropDesktopEdge = droppedDirectlyOnMonitor
        ? "right"
        : (m.desktopCorner ? `corner-${m.desktopCorner}` : m.desktopEdge || "right");
      const dropCorner = droppedDirectlyOnMonitor ? "" : (m.desktopCorner || "");
      const dropCoord = m.normCoord ?? 0.5;

      triggerMobileWaterWave(clientX, clientY);
      haptic([25, 35, 65]);

      if (drag.itemType === "video") {
        const curTime = continuityVideoState.currentTime;
        continuityVideoState.playing = false;
        updateVideoPlayButtonUI();

        sendWS({
          type: "video_resume",
          url: drag.payload || "/media/sample_photo1.jpg",
          title: drag.title,
          time: curTime,
          edge: dropDesktopEdge,
          corner: dropCorner,
          coord: dropCoord,
          x: m.normX,
          y: m.normY
        });

        fetch("/api/video_resume", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: drag.payload,
            title: drag.title,
            time: curTime,
            edge: dropDesktopEdge,
            coord: dropCoord
          })
        }).catch(() => {});

        showToast(`Continuity Video Resumed on Desktop (${curTime.toFixed(1)}s)`);
      } else {
        // Optimistic 0ms desktop confirmation
        sendWS({
          type: "drag_drop",
          filename: drag.title,
          size: drag.sizeBytes || drag.size || "280 KB",
          edge: dropDesktopEdge,
          corner: dropCorner,
          coord: dropCoord,
          x: m.normX,
          y: m.normY,
          item_type: drag.itemType
        });
        showToast(`Beamed ${drag.title} to Desktop`);

        // Commit staged upload or fallback to multipart upload
        (async () => {
          try {
            if (drag.stagePromise) {
              await drag.stagePromise;
            }
            if (drag.isStaged) {
              const res = await fetch("/api/commit_upload", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  ...(currentPortalToken ? { "X-Drap-Portal": currentPortalToken } : {})
                },
                body: JSON.stringify({
                  stage_id: drag.stageId,
                  filename: drag.title,
                  edge: dropDesktopEdge,
                  corner: dropCorner,
                  coord: dropCoord,
                  item_type: drag.itemType,
                  portal: currentPortalToken
                })
              });
              if (res.ok) {
                if (stagingStatusBadge) {
                  stagingStatusBadge.textContent = `Committed: ${drag.title}`;
                }
                fetchReceivedFiles();
                return;
              }
            }

            // Fallback multipart upload
            const formData = new FormData();
            formData.append("edge", dropDesktopEdge);
            if (dropCorner) formData.append("corner", dropCorner);
            formData.append("coord", String(dropCoord));
            formData.append("x", String(m.normX));
            formData.append("y", String(m.normY));
            formData.append("item_type", drag.itemType);
            if (currentPortalToken) formData.append("portal", currentPortalToken);

            if (drag.payload instanceof File || drag.payload instanceof Blob) {
              formData.append("file", drag.payload, drag.title);
            } else if (typeof drag.payload === "string" && drag.payload) {
              const r = await fetch(drag.payload);
              const blob = await r.blob();
              formData.append("file", blob, drag.title);
            }

            await fetch("/api/upload", {
              method: "POST",
              headers: currentPortalToken ? { "X-Drap-Portal": currentPortalToken } : {},
              body: formData
            });
            fetchReceivedFiles();
          } catch {}
        })();
      }
    } else {
      sendWS({ type: "drag_edge_leave" });
      if (stagingStatusBadge) {
        stagingStatusBadge.textContent = "Speculative Staging Ready";
      }
      if (drag.stageAbort) {
        drag.stageAbort.abort();
        if (drag.stageId) {
          fetch("/api/cancel_upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ stage_id: drag.stageId })
          }).catch(() => {});
        }
      }
    }
  }

  function initCardGestures(card) {
    let startX = 0;
    let startY = 0;
    let pointerDownTime = 0;
    let isPointerActive = false;
    let isScrolling = false;
    let activePointerId = null;

    function startActiveDrag(x, y) {
      const itemType = card.getAttribute("data-item-type") || "photo";
      const title = card.getAttribute("data-title") || "File";
      const size = card.getAttribute("data-size") || "";
      const fileUrl = card.getAttribute("data-file") || "";

      isHoldLifted = true;
      card.classList.add("is-lifted", "is-dragging");
      document.body.classList.add("is-dragging-active");
      haptic(22);
      triggerPickupRipple(x, y);

      const img = card.querySelector("img");
      const thumbUrl = img ? img.src : "";

      activeDrag = {
        cardElem: card,
        itemType,
        title,
        size,
        sizeBytes: card._sizeBytes || 0,
        payload: card._customFile || fileUrl,
        thumbUrl,
        normalizedY: 0.5,
        lastProximity: 0
      };

      launchSpeculativePreUpload(activeDrag);

      if (dragGhost) {
        dragGhost.style.display = "flex";
        if (itemType === "photo" && thumbUrl) {
          dragGhost.classList.add("is-photo-ghost");
          ghostThumb.style.backgroundImage = `url('${thumbUrl}')`;
          ghostThumb.style.display = "block";
        } else {
          dragGhost.classList.remove("is-photo-ghost");
          if (ghostTitle) ghostTitle.textContent = title;
          if (ghostSub) ghostSub.textContent = "Drag toward any bezel to beam";
          if (thumbUrl) {
            ghostThumb.style.backgroundImage = `url('${thumbUrl}')`;
            ghostThumb.style.display = "block";
          } else {
            ghostThumb.style.backgroundImage = "none";
            ghostThumb.style.display = "none";
          }
        }
        dragGhost.style.left = `${x}px`;
        dragGhost.style.top = `${y}px`;
      }

      if (dragAura) {
        dragAura.style.display = "block";
        dragAura.style.left = `${x}px`;
        dragAura.style.top = `${y}px`;
        dragAura.style.opacity = "0.85";
        dragAura.style.transform = "translate3d(-50%, -50%, 0) scale(0.76)";
      }

      lastClientX = x;
      lastClientY = y;
      const initialMetrics = computeSpatialMetrics(x, y);
      queueSpatialPacket({
        type: "drag_start",
        edge: initialMetrics.desktopEdge,
        corner: initialMetrics.desktopCorner,
        phone_edge: initialMetrics.phoneEdge,
        phone_corner: initialMetrics.phoneCorner,
        coord: initialMetrics.normCoord,
        x: initialMetrics.normX,
        y: initialMetrics.normY,
        vy: 0,
        proximity: 0.18,
        pressure: 0.5,
        title,
        size,
        item_type: itemType,
        theme: activeTheme
      });
      onDragStreaming(x, y);
      startHoldHeartbeat();
    }

    card.addEventListener("pointerdown", (e) => {
      // Ignore clicks on explicit action buttons inside the card
      if (e.target.closest("button")) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;

      isPointerActive = true;
      activePointerId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      lastClientX = e.clientX;
      lastClientY = e.clientY;
      pointerDownTime = performance.now();
      isScrolling = false;
      isHoldLifted = false;

      clearTimeout(holdTimer);
      holdTimer = setTimeout(() => {
        if (isPointerActive && !isScrolling && !activeDrag) {
          try {
            card.setPointerCapture(activePointerId);
          } catch {}
          startActiveDrag(startX, startY);
        }
      }, 160);
    });

    card.addEventListener("pointermove", (e) => {
      if (!isPointerActive || e.pointerId !== activePointerId) return;

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      if (!isHoldLifted && !activeDrag) {
        if (currentMode === "transfer") {
          if (Math.hypot(dx, dy) > 10) {
            try {
              card.setPointerCapture(activePointerId);
            } catch {}
            startActiveDrag(e.clientX, e.clientY);
          }
          return;
        }

        // Browse mode: vertical scroll vs horizontal flick
        if (Math.abs(dy) > 18 && Math.abs(dy) > Math.abs(dx) * 1.4) {
          isScrolling = true;
          clearTimeout(holdTimer);
          return;
        }
        if (Math.abs(dx) > 26 && Math.abs(dx) > Math.abs(dy) * 1.15) {
          clearTimeout(holdTimer);
          try {
            card.setPointerCapture(activePointerId);
          } catch {}
          startActiveDrag(e.clientX, e.clientY);
          return;
        }
        return;
      }

      if (activeDrag) {
        if (e.cancelable) e.preventDefault();
        onDragStreaming(e.clientX, e.clientY);
      }
    });

    function handlePointerUpOrCancel(e, isCancel) {
      if (!isPointerActive) return;
      isPointerActive = false;
      clearTimeout(holdTimer);
      stopHoldHeartbeat();

      try {
        if (activePointerId !== null && card.hasPointerCapture(activePointerId)) {
          card.releasePointerCapture(activePointerId);
        }
      } catch {}

      if (activeDrag) {
        finishDrag(e.clientX, e.clientY, isCancel);
      } else if (!isCancel && !isScrolling) {
        const elapsed = performance.now() - pointerDownTime;
        const dist = Math.hypot(e.clientX - startX, e.clientY - startY);
        if (elapsed < 260 && dist < 12) {
          const itemType = card.getAttribute("data-item-type") || "photo";
          const fileUrl = card.getAttribute("data-file") || "";
          const title = card.getAttribute("data-title") || "Photo";
          if (itemType === "photo" && fileUrl) {
            openLightbox(fileUrl, title);
          }
        }
      }

      card.classList.remove("is-lifted", "is-dragging");
      isHoldLifted = false;
      activePointerId = null;
    }

    card.addEventListener("pointerup", (e) => handlePointerUpOrCancel(e, false));
    card.addEventListener("pointercancel", (e) => handlePointerUpOrCancel(e, true));
  }

  // =========================================================================
  // 6. PROCEDURAL 60FPS VIDEO CONTINUITY STREAM (Handset <-> Desktop MPV)
  // =========================================================================
  const handVideoCanvas = document.getElementById("continuityVideoCanvas");
  const handVideoCtx = handVideoCanvas ? handVideoCanvas.getContext("2d") : null;
  const desktopMpvCanvas = document.getElementById("desktopMpvCanvas");
  const desktopMpvCtx = desktopMpvCanvas ? desktopMpvCanvas.getContext("2d") : null;

  const videoPlayToggleBtn = document.getElementById("videoPlayToggleBtn");
  const playIconSvg = document.getElementById("playIconSvg");
  const pauseIconSvg = document.getElementById("pauseIconSvg");
  const videoTimecodeOverlay = document.getElementById("videoTimecodeOverlay");
  const btnInstantVideoBeam = document.getElementById("btnInstantVideoBeam");
  const continuityTimestampLabel = document.getElementById("continuityTimestampLabel");
  const mpvOsdStatus = document.getElementById("mpvOsdStatus");
  const mpvOsdTime = document.getElementById("mpvOsdTime");

  const continuityVideoState = {
    playing: true,
    currentTime: 14.2,
    duration: 165.0,
    desktopPlaying: false,
    desktopTime: 14.2,
    lastFrameTs: performance.now()
  };

  function formatTimecode(sec) {
    const m = Math.floor(sec / 60)
      .toString()
      .padStart(2, "0");
    const s = Math.floor(sec % 60)
      .toString()
      .padStart(2, "0");
    const tenths = Math.floor((sec % 1) * 10);
    return `${m}:${s}.${tenths}`;
  }

  function updateVideoPlayButtonUI() {
    if (!playIconSvg || !pauseIconSvg) return;
    if (continuityVideoState.playing) {
      playIconSvg.style.display = "none";
      pauseIconSvg.style.display = "block";
    } else {
      playIconSvg.style.display = "block";
      pauseIconSvg.style.display = "none";
    }
  }

  function renderFluidShaderFrame(ctx, w, h, t, isActiveStream) {
    const bg = ctx.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, "#050814");
    bg.addColorStop(0.5, "#0c192e");
    bg.addColorStop(1, "#07101f");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Procedural Caustic Ribbon Waves
    const ribbons = 4;
    for (let r = 0; r < ribbons; r++) {
      ctx.beginPath();
      const baseY = h * (0.28 + r * 0.16);
      for (let x = 0; x <= w; x += 12) {
        const nx = x / w;
        const y =
          baseY +
          Math.sin(nx * 5.5 + t * (1.4 + r * 0.25) + r) * 18 +
          Math.cos(nx * 9.0 - t * 1.1) * 8;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();

      const grad = ctx.createLinearGradient(0, baseY - 25, w, h);
      if (r % 2 === 0) {
        grad.addColorStop(0, `rgba(56, 189, 248, ${isActiveStream ? 0.26 : 0.12})`);
        grad.addColorStop(1, "rgba(14, 165, 233, 0.02)");
      } else {
        grad.addColorStop(0, `rgba(192, 132, 252, ${isActiveStream ? 0.22 : 0.1})`);
        grad.addColorStop(1, "rgba(56, 189, 248, 0.02)");
      }
      ctx.fillStyle = grad;
      ctx.fill();
    }

    // Specular Orb
    const orbX = w * (0.5 + 0.28 * Math.sin(t * 0.85));
    const orbY = h * (0.48 + 0.18 * Math.cos(t * 1.15));
    const orbGrad = ctx.createRadialGradient(orbX, orbY, 2, orbX, orbY, 64);
    orbGrad.addColorStop(0, `rgba(255, 255, 255, ${isActiveStream ? 0.88 : 0.45})`);
    orbGrad.addColorStop(0.35, `rgba(56, 189, 248, ${isActiveStream ? 0.42 : 0.2})`);
    orbGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = orbGrad;
    ctx.fillRect(0, 0, w, h);
  }

  function resumeDesktopMpvPlayer(timestamp, title) {
    continuityVideoState.desktopPlaying = true;
    continuityVideoState.desktopTime = timestamp;
    if (continuityTimestampLabel) {
      continuityTimestampLabel.textContent = `LIVE @ ${formatTimecode(timestamp)}`;
    }
    if (mpvOsdStatus) {
      mpvOsdStatus.textContent = `Playing: ${title || "Optical Fluid Caustics — 4K60 HDR"}`;
    }
  }

  function tickContinuityVideos(now) {
    const dt = Math.min(0.1, Math.max(0.001, (now - continuityVideoState.lastFrameTs) / 1000));
    continuityVideoState.lastFrameTs = now;

    if (continuityVideoState.playing) {
      continuityVideoState.currentTime =
        (continuityVideoState.currentTime + dt) % continuityVideoState.duration;
      if (videoTimecodeOverlay) {
        videoTimecodeOverlay.textContent = `${formatTimecode(continuityVideoState.currentTime)} / 02:45.0`;
      }
    }

    if (handVideoCtx && handVideoCanvas) {
      renderFluidShaderFrame(
        handVideoCtx,
        handVideoCanvas.width,
        handVideoCanvas.height,
        continuityVideoState.currentTime,
        continuityVideoState.playing
      );
    }

    if (continuityVideoState.desktopPlaying) {
      continuityVideoState.desktopTime =
        (continuityVideoState.desktopTime + dt) % continuityVideoState.duration;
      if (mpvOsdTime) {
        mpvOsdTime.textContent = formatTimecode(continuityVideoState.desktopTime);
      }
    }

    if (desktopMpvCtx && desktopMpvCanvas) {
      renderFluidShaderFrame(
        desktopMpvCtx,
        desktopMpvCanvas.width,
        desktopMpvCanvas.height,
        continuityVideoState.desktopTime,
        continuityVideoState.desktopPlaying
      );
    }

    requestAnimationFrame(tickContinuityVideos);
  }

  requestAnimationFrame(tickContinuityVideos);

  if (videoPlayToggleBtn) {
    videoPlayToggleBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      continuityVideoState.playing = !continuityVideoState.playing;
      updateVideoPlayButtonUI();
    });
  }

  if (btnInstantVideoBeam) {
    btnInstantVideoBeam.addEventListener("click", (e) => {
      e.stopPropagation();
      const curTime = continuityVideoState.currentTime;
      continuityVideoState.playing = false;
      updateVideoPlayButtonUI();

      sendWS({
        type: "video_resume",
        url: "/media/sample_photo1.jpg",
        title: "Optical Fluid Caustics — 4K60 HDR",
        time: curTime,
        edge: "right",
        coord: 0.58
      });

      showToast(`Beamed Video Stream to Desktop (${curTime.toFixed(1)}s)`);
    });
  }

  const videoCardElem = document.getElementById("videoHandoffCard");
  if (videoCardElem) {
    initCardGestures(videoCardElem);
  }

  // =========================================================================
  // 7. INDEXEDDB PERSISTENT VAULT & SEEDED MEDIA LIBRARY
  // =========================================================================
  const DB_NAME = "drap_local_vault";
  const STORE_NAME = "media_items";

  function openMediaDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function saveMediaToDB(item) {
    try {
      const db = await openMediaDB();
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(item);
      return new Promise((res) => {
        tx.oncomplete = res;
      });
    } catch {}
  }

  async function getAllMediaFromDB() {
    try {
      const db = await openMediaDB();
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).getAll();
      return new Promise((res) => {
        req.onsuccess = () => res(req.result || []);
      });
    } catch {
      return [];
    }
  }

  async function clearMediaDB() {
    try {
      const db = await openMediaDB();
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).clear();
      return new Promise((res) => {
        tx.oncomplete = res;
      });
    } catch {}
  }

  function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return "0 KB";
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  function createMediaCardElement(item) {
    const isImg =
      item.category === "photo" ||
      (item.mime_type && item.mime_type.startsWith("image/")) ||
      (item.type && item.type.startsWith("image/"));
    const isVid =
      item.category === "video" ||
      (item.mime_type && item.mime_type.startsWith("video/")) ||
      (item.type && item.type.startsWith("video/"));
    const cat = isImg ? "photo" : isVid ? "video" : "document";
    const sizeStr = formatFileSize(item.size);
    const subtitle = item.subtitle || `${sizeStr} · ${isImg ? "Photo" : isVid ? "Video" : "Document"}`;

    const card = document.createElement("div");
    card.className = "card-item";
    card.setAttribute("data-cat", cat);
    card.setAttribute("data-item-type", cat);
    card.setAttribute("data-title", item.name);
    card.setAttribute("data-size", sizeStr);
    card._sizeBytes = item.size || 0;
    card._customFile = item.blob || null;

    let fileUrl = item.url || "";
    if (item.blob && !fileUrl) {
      try {
        fileUrl = URL.createObjectURL(item.blob);
      } catch {}
    }
    card.setAttribute("data-file", fileUrl);

    if (isImg && fileUrl) {
      card.innerHTML = `
        <div class="card-thumb">
          <img src="${fileUrl}" alt="${item.name}" loading="lazy" referrerPolicy="no-referrer">
        </div>
        <div class="card-meta">
          <span class="title">${item.name}</span>
          <span class="sub">${sizeStr} · ${item.subtitle || "Photo"}</span>
        </div>
      `;
    } else if (isVid && fileUrl) {
      card.innerHTML = `
        <div class="card-thumb" style="background: #09090b; display: flex; align-items: center; justify-content: center;">
          <video src="${fileUrl}" style="width: 100%; height: 100%; object-fit: cover;" preload="metadata" muted></video>
        </div>
        <div class="card-meta">
          <span class="title">${item.name}</span>
          <span class="sub">${subtitle}</span>
        </div>
      `;
    } else {
      const ext = item.ext || (item.name.split(".").pop() || "DOC").toUpperCase();
      const docTone = item.isShared ? "doc-violet" : "doc-blue";
      card.innerHTML = `
        <div class="card-thumb doc-thumb ${docTone}">
          <div class="doc-icon-badge">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          </div>
          <div class="doc-key-tag">${ext}</div>
        </div>
        <div class="card-meta">
          <span class="title">${item.name}</span>
          <span class="sub">${subtitle}</span>
        </div>
      `;
    }

    initCardGestures(card);
    return card;
  }

  function prependSharedFileCard(sf) {
    if (!mediaGrid) return;
    const card = createMediaCardElement({
      name: sf.filename,
      url: sf.url,
      size: sf.size,
      category: sf.is_image ? "photo" : sf.is_video ? "video" : "document",
      subtitle: "Desktop Share",
      isShared: true,
      ext: "SHARE"
    });
    mediaGrid.insertBefore(card, mediaGrid.firstChild);
    filterGrid();
  }

  function updateGalleryBanner(count) {
    const banner = document.getElementById("gallerySyncBanner");
    if (!banner) return;
    const copyStrong = banner.querySelector(".gallery-sync-copy strong");
    const copySpan = banner.querySelector(".gallery-sync-copy span");
    if (count > 0) {
      if (copyStrong) copyStrong.textContent = `Phone Gallery (${count} photo${count > 1 ? "s" : ""} selected)`;
      if (copySpan) copySpan.textContent = "Tap to pick more photos or videos from camera roll";
    } else {
      if (copyStrong) copyStrong.textContent = "Select Photos from Phone Gallery";
      if (copySpan) copySpan.textContent = "Tap to pick multiple photos from your camera roll";
    }
  }

  async function loadLibrary() {
    if (!mediaGrid) return;
    mediaGrid.innerHTML = "";

    // 1. Load custom user-added files from IndexedDB
    const saved = await getAllMediaFromDB();
    saved.forEach((item) => {
      const card = createMediaCardElement(item);
      mediaGrid.appendChild(card);
    });
    updateGalleryBanner(saved.length);

    // 2. Load files shared from Desktop
    try {
      const sharedRes = await fetch("/api/shared_files");
      if (sharedRes.ok) {
        const sharedFiles = await sharedRes.json();
        sharedFiles.forEach((sf) => {
          const card = createMediaCardElement({
            name: sf.filename,
            url: sf.url,
            size: sf.size,
            category: sf.is_image ? "photo" : sf.is_video ? "video" : "document",
            subtitle: "Desktop Share",
            isShared: true,
            ext: "SHARE"
          });
          mediaGrid.appendChild(card);
        });
      }
    } catch {}

    // 3. Load pre-seeded curated sample library from gateway
    try {
      const sampleRes = await fetch("/api/sample_library");
      if (sampleRes.ok) {
        const samples = await sampleRes.json();
        samples.forEach((s) => {
          const card = createMediaCardElement(s);
          mediaGrid.appendChild(card);
        });
      }
    } catch {}

    filterGrid();
  }

  async function handleFilesSelected(files) {
    if (!files || !files.length || !mediaGrid) return;
    for (const file of files) {
      const record = {
        id: `file_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name: file.name,
        size: file.size,
        type: file.type || "application/octet-stream",
        blob: file,
        mtime: file.lastModified || Date.now()
      };
      await saveMediaToDB(record);
      const card = createMediaCardElement(record);
      mediaGrid.insertBefore(card, mediaGrid.firstChild);
    }
    showToast(`Added ${files.length} file${files.length > 1 ? "s" : ""} to Handset Library`);
    filterGrid();
    try {
      const all = await getAllMediaFromDB();
      updateGalleryBanner(all.length);
    } catch {}
  }

  ["pickerPhotos", "pickerFiles", "pickerFolder"].forEach((id) => {
    const input = document.getElementById(id);
    if (input) {
      input.addEventListener("change", (e) => {
        const files = Array.from(e.target.files || []);
        handleFilesSelected(files);
        input.value = "";
      });
    }
  });

  // Inline Non-Blocking Clear Confirmation (Zero window.confirm)
  const btnClearLibrary = document.getElementById("btnClearLibrary");
  const clearConfirmBar = document.getElementById("clearConfirmBar");
  const confirmClearYes = document.getElementById("confirmClearYes");
  const confirmClearNo = document.getElementById("confirmClearNo");

  if (btnClearLibrary && clearConfirmBar) {
    btnClearLibrary.addEventListener("click", () => {
      clearConfirmBar.style.display =
        clearConfirmBar.style.display === "none" ? "flex" : "none";
    });
  }
  if (confirmClearNo && clearConfirmBar) {
    confirmClearNo.addEventListener("click", () => {
      clearConfirmBar.style.display = "none";
    });
  }
  if (confirmClearYes && clearConfirmBar) {
    confirmClearYes.addEventListener("click", async () => {
      clearConfirmBar.style.display = "none";
      await clearMediaDB();
      await loadLibrary();
      showToast("Custom media cleared · Default library restored");
    });
  }

  // =========================================================================
  // 8. DESKTOP STAGE CONTROLS, RECEIVE TRAY, CLIPBOARD & SECURITY
  // =========================================================================
  const desktopReceivedList = document.getElementById("desktopReceivedList");
  const clipboardHistoryList = document.getElementById("clipboardHistoryList");
  const authorizedDevicesList = document.getElementById("authorizedDevicesList");
  const livePortalUrlText = document.getElementById("livePortalUrlText");
  const modalPortalUrl = document.getElementById("modalPortalUrl");
  const stageLiquidToggle = document.getElementById("stageLiquidToggle");

  if (stageLiquidToggle) {
    stageLiquidToggle.addEventListener("change", (e) => {
      liquidGlassEnabled = e.target.checked;
      fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ liquid_glass: liquidGlassEnabled })
      }).catch(() => {});
      showToast(
        liquidGlassEnabled
          ? "Liquid Glass Optical Caustics Enabled"
          : "Liquid Glass Caustics Disabled"
      );
    });
  }

  // Simulate Bezel Handoff Buttons on Desktop Stage
  document.querySelectorAll(".btn-bezel-sim").forEach((btn) => {
    btn.addEventListener("click", () => {
      const simEdge = btn.getAttribute("data-sim-edge") || "right";
      const isCorner = simEdge.startsWith("corner-");
      triggerDesktopDropConfirmation({
        edge: simEdge,
        corner: isCorner ? simEdge.replace("corner-", "") : "",
        coord: 0.5,
        filename: "Optical_Portal_Test.raw",
        size: "4.2 MB",
        latency_ms: "0.3"
      });
    });
  });

  function renderReceivedFiles(transfers) {
    if (!desktopReceivedList) return;
    if (!transfers || transfers.length === 0) {
      desktopReceivedList.innerHTML = `<div class="received-file-row"><span class="received-file-meta">Flick any card from Handset to beam to ~/Downloads</span></div>`;
      return;
    }
    desktopReceivedList.innerHTML = "";
    transfers.slice(0, 6).forEach((tr) => {
      const row = document.createElement("div");
      row.className = "received-file-row";
      const sizeStr = formatFileSize(tr.size);
      const dirBadge = tr.direction === "desktop-to-phone" ? "→ Phone" : `← ${tr.edge || "right"}`;
      row.innerHTML = `
        <div class="received-file-info">
          <span class="received-file-name">${tr.filename}</span>
          <span class="received-file-meta mono-meta">${sizeStr} · ${dirBadge} · ${tr.latency_ms || 0.4}ms · #${tr.sha256_short || "a4f1"}</span>
        </div>
        <a href="${tr.url}" download="${tr.filename}" class="received-file-download">Save</a>
      `;
      desktopReceivedList.appendChild(row);
    });
  }

  async function fetchReceivedFiles() {
    try {
      const res = await fetch("/api/received_files");
      if (res.ok) {
        const data = await res.json();
        renderReceivedFiles(data);
      }
    } catch {}
  }

  // Desktop-to-Phone File Push Dropzone
  const desktopPushDropzone = document.getElementById("desktopPushDropzone");
  const desktopPushFileInput = document.getElementById("desktopPushFileInput");

  async function pushFilesFromDesktopToPhone(files) {
    if (!files || !files.length) return;
    for (const file of files) {
      const formData = new FormData();
      formData.append("file", file, file.name);
      formData.append("edge", "right");
      try {
        const res = await fetch("/api/share_to_phone", {
          method: "POST",
          body: formData
        });
        if (res.ok) {
          showToast(`Pushed ${file.name} to Handset Library`);
        }
      } catch {}
    }
  }

  if (desktopPushFileInput) {
    desktopPushFileInput.addEventListener("change", (e) => {
      const files = Array.from(e.target.files || []);
      pushFilesFromDesktopToPhone(files);
      desktopPushFileInput.value = "";
    });
  }

  if (desktopPushDropzone) {
    desktopPushDropzone.addEventListener("dragover", (e) => {
      e.preventDefault();
      desktopPushDropzone.classList.add("drag-over");
    });
    desktopPushDropzone.addEventListener("dragleave", () => {
      desktopPushDropzone.classList.remove("drag-over");
    });
    desktopPushDropzone.addEventListener("drop", (e) => {
      e.preventDefault();
      desktopPushDropzone.classList.remove("drag-over");
      if (e.dataTransfer && e.dataTransfer.files.length > 0) {
        pushFilesFromDesktopToPhone(Array.from(e.dataTransfer.files));
      }
    });
  }

  // Clipboard Sync & History
  function renderClipboardHistory(items) {
    if (!clipboardHistoryList) return;
    clipboardHistoryList.innerHTML = "";
    (items || []).slice(0, 6).forEach((item) => {
      const row = document.createElement("div");
      row.className = "clip-history-row";
      row.innerHTML = `
        <span class="clip-history-text">${item.text.replace(/</g, "&lt;")}</span>
        <button type="button" class="btn-copy-clip">Copy</button>
      `;
      const copyBtn = row.querySelector(".btn-copy-clip");
      if (copyBtn) {
        copyBtn.addEventListener("click", () => {
          navigator.clipboard?.writeText(item.text).catch(() => {});
          showToast("Copied to clipboard");
        });
      }
      clipboardHistoryList.appendChild(row);
    });
  }

  async function fetchClipboardHistory() {
    try {
      const res = await fetch("/api/clipboard_history");
      if (res.ok) {
        const items = await res.json();
        renderClipboardHistory(items);
      }
    } catch {}
  }

  const quickSendBtn = document.getElementById("quickSendBtn");
  const quickTextInput = document.getElementById("quickTextInput");

  async function sendHandsetClipboard() {
    if (!quickTextInput) return;
    const text = quickTextInput.value.trim();
    if (!text) return;
    try {
      const formData = new FormData();
      formData.append("text", text);
      formData.append("sender", "phone");
      await fetch("/api/clipboard", { method: "POST", body: formData });
      quickTextInput.value = "";
      fetchClipboardHistory();
      showToast("Sent to Desktop Wayland Clipboard (wl-copy)");
    } catch {}
  }

  if (quickSendBtn) quickSendBtn.addEventListener("click", sendHandsetClipboard);
  if (quickTextInput) {
    quickTextInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") sendHandsetClipboard();
    });
  }

  const desktopClipInput = document.getElementById("desktopClipInput");
  const desktopClipSendBtn = document.getElementById("desktopClipSendBtn");

  async function sendDesktopClipboard() {
    if (!desktopClipInput) return;
    const text = desktopClipInput.value.trim();
    if (!text) return;
    try {
      await fetch("/api/send_text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, sender: "desktop" })
      });
      desktopClipInput.value = "";
      fetchClipboardHistory();
    } catch {}
  }

  if (desktopClipSendBtn) desktopClipSendBtn.addEventListener("click", sendDesktopClipboard);
  if (desktopClipInput) {
    desktopClipInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") sendDesktopClipboard();
    });
  }

  // Security Policy & Devices Management
  function renderSecurityDevices(mode, devices) {
    document.querySelectorAll(".sec-mode-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-sec-mode") === mode);
    });
    if (!authorizedDevicesList) return;
    authorizedDevicesList.innerHTML = "";
    (devices || []).slice(0, 4).forEach((d) => {
      const row = document.createElement("div");
      row.className = "device-access-row";
      const isAllowed = d.status === "allowed" || d.always_allowed;
      row.innerHTML = `
        <div class="device-access-meta">
          <span class="device-access-name">${d.name || "Handset"}</span>
          <span class="meta-separator">·</span>
          <span class="device-access-ip">${d.ip}</span>
        </div>
        <div class="device-access-actions">
          <button type="button" class="btn-secondary-sm" data-action="${isAllowed ? "block" : "allow"}" data-ip="${d.ip}">
            ${isAllowed ? "Allowed" : "Blocked"}
          </button>
        </div>
      `;
      const actionBtn = row.querySelector("button");
      if (actionBtn) {
        actionBtn.addEventListener("click", async () => {
          const endpoint = isAllowed ? "/api/devices/block" : "/api/devices/allow";
          await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ip: d.ip, always: true })
          });
          fetchDevicesList();
          showToast(`Updated access for ${d.ip}`);
        });
      }
      authorizedDevicesList.appendChild(row);
    });
  }

  async function fetchDevicesList() {
    try {
      const res = await fetch("/api/devices");
      if (res.ok) {
        const data = await res.json();
        renderSecurityDevices(data.mode, data.devices);
      }
    } catch {}
  }

  document.querySelectorAll(".sec-mode-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const mode = btn.getAttribute("data-sec-mode");
      if (!mode) return;
      await fetch("/api/devices/mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode })
      });
      fetchDevicesList();
      showToast(`Security policy set to ${mode.toUpperCase()}`);
    });
  });

  function refreshQrImages() {
    const cacheBuster = `?t=${Date.now()}`;
    const liveQrImg = document.getElementById("liveQrImg");
    const modalQrImg = document.getElementById("modalQrImg");
    if (liveQrImg) liveQrImg.src = `/api/qr.svg${cacheBuster}`;
    if (modalQrImg) modalQrImg.src = `/api/qr.svg${cacheBuster}`;
  }

  const btnRotatePortal = document.getElementById("btnRotatePortal");
  if (btnRotatePortal) {
    btnRotatePortal.addEventListener("click", async () => {
      try {
        const res = await fetch("/api/portal/rotate", { method: "POST" });
        if (res.ok) {
          const data = await res.json();
          if (livePortalUrlText) livePortalUrlText.textContent = data.portal_url;
          if (modalPortalUrl) modalPortalUrl.textContent = data.portal_url;
          refreshQrImages();
          showToast("Rotated Ephemeral Portal QR Token");
        }
      } catch {}
    });
  }

  const btnCopyPortalUrl = document.getElementById("btnCopyPortalUrl");
  if (btnCopyPortalUrl) {
    btnCopyPortalUrl.addEventListener("click", () => {
      const url = livePortalUrlText ? livePortalUrlText.textContent : window.location.href;
      navigator.clipboard?.writeText(url || window.location.href).catch(() => {});
      showToast("Gateway URL copied to clipboard");
    });
  }

  const btnCopyHyprConfig = document.getElementById("btnCopyHyprConfig");
  if (btnCopyHyprConfig) {
    btnCopyHyprConfig.addEventListener("click", () => {
      const code = document.getElementById("hyprConfigCode")?.textContent || "";
      navigator.clipboard?.writeText(code).catch(() => {});
      showToast("Hyprland layerrule copied to clipboard");
    });
  }

  // =========================================================================
  // 9. SETTINGS SHEET, LIGHTBOX, QR MODAL & PORTAL GATEKEEPER
  // =========================================================================
  if (openSettingsBtn && settingsModal) {
    openSettingsBtn.addEventListener("click", () => {
      settingsModal.classList.add("open");
      haptic(12);
    });
  }
  if (closeSettingsBtn && settingsModal) {
    closeSettingsBtn.addEventListener("click", () => settingsModal.classList.remove("open"));
    settingsModal.addEventListener("click", (e) => {
      if (e.target === settingsModal) settingsModal.classList.remove("open");
    });
  }

  function openQrModal() {
    if (qrModal) {
      refreshQrImages();
      qrModal.classList.add("open");
      haptic(12);
    }
  }
  if (openQrModalBtn) openQrModalBtn.addEventListener("click", openQrModal);
  if (qrPreviewBox) qrPreviewBox.addEventListener("click", openQrModal);
  if (closeQrModalBtn && qrModal) {
    closeQrModalBtn.addEventListener("click", () => qrModal.classList.remove("open"));
    qrModal.addEventListener("click", (e) => {
      if (e.target === qrModal) qrModal.classList.remove("open");
    });
  }

  // Top Bar Navigation Active Link Highlighting
  document.querySelectorAll(".nav-link").forEach((link) => {
    link.addEventListener("click", () => {
      document.querySelectorAll(".nav-link").forEach((l) => l.classList.remove("active"));
      link.classList.add("active");
    });
  });

  if (pwaInstallBtn) {
    pwaInstallBtn.addEventListener("click", async () => {
      if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        const choice = await deferredInstallPrompt.userChoice;
        if (choice.outcome === "accepted") {
          showToast("drap installed to Home Screen");
        }
        deferredInstallPrompt = null;
      } else {
        showToast("Use browser menu ⋮ → Add to Home Screen for full-screen PWA");
      }
    });
  }

  const selectTargetEdge = document.getElementById("selectTargetEdge");
  const toggleMultiSide = document.getElementById("toggleMultiSide");
  const multiSideSubtitle = document.getElementById("multiSideSubtitle");

  function updateMultiSideUI() {
    if (toggleMultiSide) toggleMultiSide.checked = isMultiSideSend;
    if (multiSideSubtitle) {
      multiSideSubtitle.textContent = isMultiSideSend
        ? "Flick toward Left, Right, Top, Bottom, or any Corner"
        : `Single Edge Mode: Flick toward ${targetEdgePref.toUpperCase()} bezel`;
    }
  }
  updateMultiSideUI();

  if (toggleMultiSide) {
    toggleMultiSide.addEventListener("change", (e) => {
      isMultiSideSend = e.target.checked;
      localStorage.setItem("drap_multi_side_send", String(isMultiSideSend));
      updateMultiSideUI();
      showToast(
        isMultiSideSend
          ? "Omnidirectional 4-Edge & Corner Portals Enabled"
          : "Single-Edge Portal Mode Enabled"
      );
    });
  }

  if (selectTargetEdge) {
    if (!["right", "direct", "left", "bottom", "top"].includes(targetEdgePref)) {
      targetEdgePref = "right";
      localStorage.setItem("drap_target_edge", "right");
    }
    selectTargetEdge.value = targetEdgePref;
    selectTargetEdge.addEventListener("change", (e) => {
      targetEdgePref = e.target.value;
      localStorage.setItem("drap_target_edge", targetEdgePref);
      updateMultiSideUI();
      const label = selectTargetEdge.options[selectTargetEdge.selectedIndex]?.text || targetEdgePref;
      showToast(`Target Bezel: ${label}`);
    });
  }

  const inputCustomTarget = document.getElementById("inputCustomTarget");
  const btnApplyTarget = document.getElementById("btnApplyTarget");
  if (inputCustomTarget) inputCustomTarget.value = targetHost;
  if (btnApplyTarget && inputCustomTarget) {
    btnApplyTarget.addEventListener("click", () => {
      const val = inputCustomTarget.value.trim();
      if (!val) return;
      targetHost = val;
      localStorage.setItem("drap_target_host", targetHost);
      showToast(`Gateway target set to ${targetHost}`);
      connectWS();
    });
  }

  const togglePortalMode = document.getElementById("togglePortalMode");
  const portalModeSubtitle = document.getElementById("portalModeSubtitle");
  const portalLockOverlay = document.getElementById("portalLockOverlay");
  const btnRetryPortal = document.getElementById("btnRetryPortal");

  async function checkPortalAuthorization() {
    try {
      const q = currentPortalToken
        ? `?portal=${encodeURIComponent(currentPortalToken)}`
        : "";
      const res = await fetch(`/api/portal/status${q}`);
      if (res.ok) {
        const data = await res.json();
        if (togglePortalMode) togglePortalMode.checked = Boolean(data.random_portal_mode);
        if (livePortalUrlText) livePortalUrlText.textContent = data.portal_url;
        if (modalPortalUrl) modalPortalUrl.textContent = data.portal_url;
        if (portalModeSubtitle) {
          portalModeSubtitle.textContent = data.random_portal_mode
            ? "Dynamic QR active (Session token required)"
            : "Fixed Portal (Open on LAN / Bookmarked)";
        }
        if (portalLockOverlay) {
          portalLockOverlay.style.display =
            data.random_portal_mode && !data.is_authorized ? "flex" : "none";
        }
      }
    } catch {}
  }

  if (togglePortalMode) {
    togglePortalMode.addEventListener("change", async (e) => {
      const enabled = e.target.checked;
      try {
        await fetch("/api/portal/toggle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled, portal: currentPortalToken })
        });
        checkPortalAuthorization();
        refreshQrImages();
        showToast(enabled ? "Ephemeral QR Mode Enabled" : "Fixed LAN Portal Enabled");
      } catch {}
    });
  }

  if (btnRetryPortal) {
    btnRetryPortal.addEventListener("click", () => {
      checkPortalAuthorization();
      showToast("Verifying portal authorization...");
    });
  }

  async function fetchDeviceInfo() {
    try {
      const res = await fetch("/api/device_info");
      if (res.ok) {
        const info = await res.json();
        const targetDeviceName = document.getElementById("targetDeviceName");
        const targetDeviceIp = document.getElementById("targetDeviceIp");
        if (targetDeviceName) targetDeviceName.textContent = info.alias || "Hyprland Workstation";
        if (targetDeviceIp) {
          targetDeviceIp.textContent = `${info.host || targetHost} · Connected`;
        }
      }
    } catch {}
  }

  // Lightbox
  const lightbox = document.getElementById("lightbox");
  const lightboxImg = document.getElementById("lightboxImg");
  const lightboxTitle = document.getElementById("lightboxTitle");
  const lightboxDownload = document.getElementById("lightboxDownload");
  const lightboxClose = document.getElementById("lightboxClose");

  function openLightbox(src, title) {
    if (!lightbox || !lightboxImg) return;
    lightboxImg.src = src;
    if (lightboxTitle) lightboxTitle.textContent = title;
    if (lightboxDownload) {
      lightboxDownload.href = src;
      lightboxDownload.download = title;
    }
    lightbox.classList.add("open");
  }

  if (lightboxClose && lightbox) {
    lightboxClose.addEventListener("click", () => lightbox.classList.remove("open"));
    lightbox.addEventListener("click", (e) => {
      if (e.target === lightbox) lightbox.classList.remove("open");
    });
  }

  // Initialize Everything
  loadLibrary();
  fetchReceivedFiles();
  fetchClipboardHistory();
  fetchDevicesList();
  checkPortalAuthorization();
  connectWS();
})();

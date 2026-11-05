// drap - Client Application
(function () {
  'use strict';

  // 1. Settings Sheet & PWA Installation
  let deferredInstallPrompt = null;
  const openSettingsBtn = document.getElementById("openSettingsBtn");
  const closeSettingsBtn = document.getElementById("closeSettingsBtn");
  const settingsModal = document.getElementById("settingsModal");
  const pwaInstallBtn = document.getElementById("pwaInstallBtn");

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.warn('SW registration failed:', err);
      });
    });
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    if (pwaInstallBtn) {
      pwaInstallBtn.textContent = "Install drap App Now";
    }
  });

  if (openSettingsBtn && settingsModal) {
    openSettingsBtn.addEventListener('click', () => {
      settingsModal.classList.add('open');
      haptic(15);
    });
  }

  if (closeSettingsBtn && settingsModal) {
    closeSettingsBtn.addEventListener('click', () => {
      settingsModal.classList.remove('open');
    });
    settingsModal.addEventListener('click', (e) => {
      if (e.target === settingsModal) {
        settingsModal.classList.remove('open');
      }
    });
  }

  if (pwaInstallBtn) {
    pwaInstallBtn.addEventListener('click', async () => {
      if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        const choice = await deferredInstallPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          pwaInstallBtn.style.display = 'none';
          showToast("drap installed to Home Screen!");
        }
        deferredInstallPrompt = null;
      } else {
        // Explanatory guidance for browser
        const isBrave = (navigator.brave && typeof navigator.brave.isBrave === 'function') || navigator.userAgent.includes("Brave");
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        if (isIOS) {
          showToast("Tap Safari Share ⎋ -> Add to Home Screen ⊕");
        } else if (isBrave) {
          showToast("In Brave: Tap ⋮ -> 'Add to Home screen'");
          alert("Brave Browser Installation:\n\n1. Tap the three dots (⋮) in Brave.\n2. Tap 'Add to Home screen' (installs standalone WebAPK).\n\nTip: To allow the browser native install prompt on LAN IP, open brave://flags/#unsafely-treat-insecure-origin-as-secure and add this IP.");
        } else {
          showToast("Tap Browser menu ⋮ -> Add to Home screen");
        }
      }
    });
  }

  // 2. State & Mode Management
  let currentMode = 'browse'; // 'browse' | 'transfer'
  let activeDrag = null;
  let holdTimer = null;
  let isHoldLifted = false;

  const body = document.body;
  const tabBrowse = document.getElementById("tabBrowse");
  const tabTransfer = document.getElementById("tabTransfer");
  const mediaGrid = document.getElementById("mediaGrid");
  const dragAura = document.getElementById("dragAura");
  const dragGhost = document.getElementById("dragGhost");
  const ghostThumb = document.getElementById("ghostThumb");
  const ghostTitle = document.getElementById("ghostTitle");
  const ghostSub = document.getElementById("ghostSub");
  const toast = document.getElementById("toast");
  const fileCountBadge = document.getElementById("fileCountBadge");

  // Mode Switcher Listeners
  function setMode(mode) {
    currentMode = mode;
    if (mode === 'transfer') {
      body.classList.add('mode-transfer');
      if (tabTransfer) tabTransfer.classList.add('active');
      if (tabBrowse) tabBrowse.classList.remove('active');
      showToast("Transfer mode: Immediate swipe to bezel");
      haptic(20);
    } else {
      body.classList.remove('mode-transfer');
      if (tabBrowse) tabBrowse.classList.add('active');
      if (tabTransfer) tabTransfer.classList.remove('active');
      showToast("Browse mode: Hold 200ms to lift & transfer");
      haptic(15);
    }
  }

  if (tabBrowse) tabBrowse.addEventListener('click', () => setMode('browse'));
  if (tabTransfer) tabTransfer.addEventListener('click', () => setMode('transfer'));

  // Effect Theme Selector
  let activeTheme = localStorage.getItem("drap_effect_theme") || "liquid";
  const themePills = document.querySelectorAll(".theme-pill");

  function setTheme(theme) {
    activeTheme = theme;
    localStorage.setItem("drap_effect_theme", theme);
    document.body.setAttribute("data-theme", theme);
    themePills.forEach(pill => {
      if (pill.getAttribute("data-theme") === theme) {
        pill.classList.add("active");
      } else {
        pill.classList.remove("active");
      }
    });
    sendWS({ type: "set_effect", theme: theme });
    haptic(15);
  }

  // Set initial theme attribute
  document.body.setAttribute("data-theme", activeTheme);
  themePills.forEach(pill => {
    if (pill.getAttribute("data-theme") === activeTheme) {
      pill.classList.add("active");
    } else {
      pill.classList.remove("active");
    }
    pill.addEventListener("click", () => {
      const t = pill.getAttribute("data-theme");
      if (t) setTheme(t);
    });
  });

  // Category Filtering
  let activeCategory = 'all';
  document.querySelectorAll('.cat-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.cat-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeCategory = btn.getAttribute('data-cat');
      filterGrid();
    });
  });

  function filterGrid() {
    const cards = document.querySelectorAll('.card-item');
    let visibleCount = 0;
    cards.forEach(card => {
      const cat = card.getAttribute('data-cat') || 'photo';
      if (activeCategory === 'all' || cat === activeCategory) {
        card.style.display = '';
        visibleCount++;
      } else {
        card.style.display = 'none';
      }
    });
    if (fileCountBadge) fileCountBadge.textContent = `${visibleCount} item${visibleCount !== 1 ? 's' : ''}`;
  }

  // 3. WebSocket Real-Time Gateway & Target Destination
  let ws = null;
  const statusPill = document.getElementById("statusPill");
  let targetHost = localStorage.getItem("drap_target_host") || window.location.host;
  let targetEdgePref = localStorage.getItem("drap_target_edge") || "auto";
  let isMultiSideSend = localStorage.getItem("drap_multi_side_send") !== "false";

  function connectWS() {
    if (ws) {
      try { ws.close(); } catch (e) {}
    }
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    try {
      ws = new WebSocket(`${protocol}//${targetHost}/ws`);
    } catch (e) {
      console.warn("WebSocket init failed:", e);
    }

    if (!ws) return;

    ws.onopen = () => {
      if (statusPill) {
        statusPill.classList.add("connected");
        const txt = statusPill.querySelector(".status-text");
        if (txt) txt.textContent = "Connected";
      }
      const targetDot = document.getElementById("targetStatusDot");
      if (targetDot) targetDot.classList.add("connected");
      fetchDeviceInfo();
    };

    ws.onclose = () => {
      if (statusPill) {
        statusPill.classList.remove("connected");
        const txt = statusPill.querySelector(".status-text");
        if (txt) txt.textContent = "Reconnecting...";
      }
      const targetDot = document.getElementById("targetStatusDot");
      if (targetDot) targetDot.classList.remove("connected");
      setTimeout(connectWS, 2500);
    };

    ws.onerror = () => {
      if (ws) ws.close();
    };
  }

  connectWS();

  function sendWS(msg) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  // 120Hz/60Hz Hardware V-Sync Dispatcher (Zero Network Congestion & 0ms Frame Jitter)
  let pendingSpatialPacket = null;
  let rafSpatialId = null;

  function dispatchSpatialPacket() {
    if (pendingSpatialPacket) {
      sendWS(pendingSpatialPacket);
      pendingSpatialPacket = null;
    }
    rafSpatialId = null;
  }

  function queueSpatialPacket(packet) {
    pendingSpatialPacket = packet;
    if (!rafSpatialId) {
      rafSpatialId = requestAnimationFrame(dispatchSpatialPacket);
    }
  }

  function haptic(pattern) {
    if ("vibrate" in navigator) {
      try { navigator.vibrate(pattern); } catch (e) {}
    }
  }

  function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 2600);
  }

  // 4. Intelligent Navigation vs Drag Handling
  function initCardGestures(card) {
    let startX = 0;
    let startY = 0;
    let isScrolling = false;
    let touchStartTime = 0;

    const itemType = card.getAttribute("data-item-type") || "photo";
    const title = card.getAttribute("data-title") || "File";
    const size = card.getAttribute("data-size") || "";
    const theme = card.getAttribute("data-theme") || "blue";
    const fileUrl = card.getAttribute("data-file") || "";

    function triggerPickupRipple(px, py) {
      const ripple = document.createElement("div");
      ripple.className = "pickup-ripple";
      ripple.style.left = `${px}px`;
      ripple.style.top = `${py}px`;
      document.body.appendChild(ripple);
      setTimeout(() => {
        if (ripple && ripple.parentNode) ripple.parentNode.removeChild(ripple);
      }, 900);
    }

    function startActiveDrag(x, y) {
      isHoldLifted = true;
      card.classList.add("is-lifted", "is-dragging");
      document.body.classList.add("is-dragging-active");
      haptic(30);
      triggerPickupRipple(x, y);

      // Extract preview thumbnail
      const img = card.querySelector("img");
      const thumbUrl = img ? img.src : "";

      activeDrag = {
        cardElem: card,
        itemType: itemType,
        title: title,
        size: size,
        payload: card._customFile || fileUrl,
        thumbUrl: thumbUrl,
        theme: theme,
        normalizedY: y / window.innerHeight
      };

      if (dragGhost) {
        dragGhost.style.display = "flex";
        if (itemType === 'photo' && thumbUrl) {
          dragGhost.classList.add("is-photo-ghost");
          ghostThumb.style.backgroundImage = `url('${thumbUrl}')`;
          ghostThumb.style.display = "block";
        } else {
          dragGhost.classList.remove("is-photo-ghost");
          ghostTitle.textContent = title;
          if (ghostSub) {
            if (isMultiSideSend) {
              ghostSub.textContent = "Flick towards any screen edge";
            } else {
              const edgeName = targetEdgePref === 'auto' ? 'left' : (targetEdgePref === 'left' ? 'right' : (targetEdgePref === 'bottom' ? 'top' : (targetEdgePref === 'top' ? 'bottom' : 'left')));
              ghostSub.textContent = `Flick towards ${edgeName} bezel`;
            }
          }
          if (thumbUrl) {
            ghostThumb.style.backgroundImage = `url('${thumbUrl}')`;
            ghostThumb.style.display = "block";
          } else {
            ghostThumb.style.backgroundImage = "none";
            ghostThumb.style.display = "none";
          }
        }
        updateGhostPosition(x, y);
      }

      if (dragAura) {
        dragAura.style.display = "block";
        dragAura.style.left = `${x}px`;
        dragAura.style.top = `${y}px`;
        dragAura.style.opacity = "0.85";
        dragAura.style.transform = "translate3d(-50%, -50%, 0) scale(0.75)";
      }

      // Prime spatial connection on desktop with instant shockwave ripple
      const initialEdge = (targetEdgePref && targetEdgePref !== 'auto') ? targetEdgePref : 'right';
      queueSpatialPacket({
        type: "drag_start",
        edge: initialEdge,
        coord: y / window.innerHeight,
        x: x / window.innerWidth,
        y: y / window.innerHeight,
        proximity: 0.20,
        pressure: 0.5
      });
    }

    card.addEventListener("touchstart", (e) => {
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      touchStartTime = Date.now();
      isScrolling = false;
      isHoldLifted = false;

      // In Browse Mode: Set 220ms timer for Hold-to-Lift
      if (currentMode === 'browse') {
        clearTimeout(holdTimer);
        holdTimer = setTimeout(() => {
          if (!isScrolling && !activeDrag) {
            startActiveDrag(startX, startY);
          }
        }, 220);
      }
    }, { passive: true });

    card.addEventListener("touchmove", (e) => {
      const t = e.touches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;

      // Directional Angle & Gesture Check
      if (!isHoldLifted && !activeDrag) {
        // In Transfer Mode: Immediate flick in ANY direction (left, right, up, down)
        if (currentMode === 'transfer') {
          if (Math.abs(dx) > 16 || Math.abs(dy) > 16) {
            e.preventDefault();
            startActiveDrag(t.clientX, t.clientY);
          }
          return;
        }

        // In Browse Mode: Lock into vertical scroll only if moving fast vertically without holding
        if (Math.abs(dy) > 18 && Math.abs(dy) > Math.abs(dx) * 1.5) {
          isScrolling = true;
          clearTimeout(holdTimer);
          return;
        }

        // Horizontal flick/swipe in browse mode: start spatial drag immediately
        if (Math.abs(dx) > 20 && Math.abs(dx) > Math.abs(dy) * 1.1) {
          clearTimeout(holdTimer);
          e.preventDefault();
          startActiveDrag(t.clientX, t.clientY);
          return;
        }
      }

      if (activeDrag) {
        e.preventDefault();
        onDragStreaming(t.clientX, t.clientY);
      }
    }, { passive: false });

    card.addEventListener("touchend", (e) => {
      clearTimeout(holdTimer);
      if (activeDrag) {
        const t = e.changedTouches[0];
        finishDrag(t.clientX, t.clientY);
      } else {
        // Tap gesture in Browse Mode: Open Lightbox for photos
        const elapsed = Date.now() - touchStartTime;
        if (!isScrolling && elapsed < 220 && currentMode === 'browse') {
          if (itemType === 'photo' && fileUrl) {
            openLightbox(fileUrl, title);
          }
        }
      }
      card.classList.remove("is-lifted", "is-dragging");
      isHoldLifted = false;
    });

    card.addEventListener("touchcancel", () => {
      clearTimeout(holdTimer);
      if (activeDrag) finishDrag(9999, 9999);
      card.classList.remove("is-lifted", "is-dragging");
      isHoldLifted = false;
    });
  }

  function updateGhostPosition(x, y) {
    if (dragGhost) {
      dragGhost.style.left = `${x}px`;
      dragGhost.style.top = `${y}px`;
    }
    if (dragAura) {
      dragAura.style.left = `${x}px`;
      dragAura.style.top = `${y}px`;
    }
  }

  let lastClientX = null;
  let lastClientY = null;
  let lastTouchTime = null;
  let smoothVelocityX = 0;
  let smoothVelocityY = 0;
  let lastHapticSector = null;

  function onDragStreaming(clientX, clientY) {
    updateGhostPosition(clientX, clientY);

    const screenW = window.innerWidth;
    const screenH = window.innerHeight;
    const normX = Math.max(0.05, Math.min(0.95, clientX / screenW));
    const normY = Math.max(0.05, Math.min(0.95, clientY / screenH));

    // Calculate movement velocity
    const now = performance.now();
    if (lastClientY !== null && lastTouchTime !== null) {
      const dt = Math.max(1, now - lastTouchTime);
      const dy = clientY - lastClientY;
      const dx = clientX - (lastClientX !== null ? lastClientX : clientX);
      smoothVelocityY = smoothVelocityY * 0.70 + (dy / dt) * 0.30;
      smoothVelocityX = smoothVelocityX * 0.70 + (dx / dt) * 0.30;
    }
    lastClientX = clientX;
    lastClientY = clientY;
    lastTouchTime = now;

    let phoneEdge = "left";
    let desktopEdge = "right";
    let normCoord = normY;
    let reach = screenW * 0.65;
    let proximity = 0.0;

    if (isMultiSideSend) {
      // Find the closest border physically among all 4 edges
      const distLeft = clientX;
      const distRight = screenW - clientX;
      const distTop = clientY;
      const distBottom = screenH - clientY;
      const minDist = Math.min(distLeft, distRight, distTop, distBottom);

      if (minDist === distLeft) {
        phoneEdge = "left";
        desktopEdge = "right";
        normCoord = normY;
        reach = screenW * 0.65;
      } else if (minDist === distRight) {
        phoneEdge = "right";
        desktopEdge = "left";
        normCoord = normY;
        reach = screenW * 0.65;
      } else if (minDist === distTop) {
        phoneEdge = "top";
        desktopEdge = "bottom";
        normCoord = normX;
        reach = screenH * 0.38;
      } else {
        phoneEdge = "bottom";
        desktopEdge = "top";
        normCoord = normX;
        reach = screenH * 0.38;
      }

      if (targetEdgePref && targetEdgePref !== "auto") {
        desktopEdge = targetEdgePref;
      }

      proximity = Math.max(0.0, Math.min(1.0, (reach - minDist) / (reach * 0.80)));
    } else {
      // Locked to Single Edge Mode: only primary edge activates
      if (targetEdgePref === "left") {
        phoneEdge = "right";
        desktopEdge = "left";
        normCoord = normY;
        reach = screenW * 0.65;
        const dist = screenW - clientX;
        proximity = Math.max(0.0, Math.min(1.0, (reach - dist) / (reach * 0.80)));
      } else if (targetEdgePref === "bottom") {
        phoneEdge = "top";
        desktopEdge = "bottom";
        normCoord = normX;
        reach = screenH * 0.38;
        const dist = clientY;
        proximity = Math.max(0.0, Math.min(1.0, (reach - dist) / (reach * 0.80)));
      } else if (targetEdgePref === "top") {
        phoneEdge = "bottom";
        desktopEdge = "top";
        normCoord = normX;
        reach = screenH * 0.38;
        const dist = screenH - clientY;
        proximity = Math.max(0.0, Math.min(1.0, (reach - dist) / (reach * 0.80)));
      } else {
        // Default single edge: Phone Left Bezel -> Desktop Right Bezel
        phoneEdge = "left";
        desktopEdge = "right";
        normCoord = normY;
        reach = screenW * 0.65;
        const dist = clientX;
        proximity = Math.max(0.0, Math.min(1.0, (reach - dist) / (reach * 0.80)));
      }
    }
    const pressure = 0.5 + (proximity * 0.5);

    // Haptic detent feedback every 80px of travel
    const travelCoord = (phoneEdge === "top" || phoneEdge === "bottom") ? clientX : clientY;
    const sector = Math.floor(travelCoord / 80);
    if (lastHapticSector !== null && sector !== lastHapticSector && proximity > 0.05) {
      haptic(10);
    }
    lastHapticSector = sector;

    if (activeDrag) {
      activeDrag.normalizedX = normX;
      activeDrag.normalizedY = normY;
      activeDrag.normCoord = normCoord;
      activeDrag.phoneEdge = phoneEdge;
      activeDrag.desktopEdge = desktopEdge;
    }

    // Phone Edge Glow & Meniscus Bulb Directional Morphing for all 4 edges
    const bulb = document.getElementById("phoneEdgeBulb");
    if (proximity > 0.05) {
      if (bulb) {
        bulb.style.display = "block";
        bulb.style.opacity = Math.min(1.0, proximity * 1.8);
        const push = (1.0 - proximity) * -65;
        const scale = 0.85 + proximity * 0.55;

        if (phoneEdge === "left") {
          bulb.style.left = "0";
          bulb.style.right = "auto";
          bulb.style.top = `${clientY}px`;
          bulb.style.bottom = "auto";
          bulb.style.transform = `translateY(-50%) translateX(${push}%) scale(${scale})`;
        } else if (phoneEdge === "right") {
          bulb.style.left = "auto";
          bulb.style.right = "0";
          bulb.style.top = `${clientY}px`;
          bulb.style.bottom = "auto";
          bulb.style.transform = `translateY(-50%) translateX(${-push}%) rotate(180deg) scale(${scale})`;
        } else if (phoneEdge === "top") {
          bulb.style.left = `${clientX}px`;
          bulb.style.right = "auto";
          bulb.style.top = "0";
          bulb.style.bottom = "auto";
          bulb.style.transform = `translateX(-50%) translateY(${push}%) rotate(90deg) scale(${scale})`;
        } else if (phoneEdge === "bottom") {
          bulb.style.left = `${clientX}px`;
          bulb.style.right = "auto";
          bulb.style.top = "auto";
          bulb.style.bottom = "0";
          bulb.style.transform = `translateX(-50%) translateY(${-push}%) rotate(-90deg) scale(${scale})`;
        }
      }
    } else {
      if (bulb) {
        bulb.style.opacity = "0";
        bulb.style.display = "none";
      }
    }

    if (dragGhost) {
      const velTilt = Math.max(-14, Math.min(14, smoothVelocityY * 18));
      const normTilt = (normY - 0.5) * -10;
      const totalTilt = velTilt + normTilt;
      const squeezeX = proximity > 0.4 ? (1.0 - (proximity - 0.4) * 0.28) : 1.0;
      const squeezeY = proximity > 0.4 ? (1.0 + (proximity - 0.4) * 0.20) : 1.0;
      dragGhost.style.transform = `translate(-50%, -50%) rotate(${totalTilt.toFixed(1)}deg) scaleX(${(1.06 * squeezeX).toFixed(3)}) scaleY(${(1.06 * squeezeY).toFixed(3)})`;
    }

    if (dragAura) {
      const auraScale = 0.82 + proximity * 0.28;
      const auraOpacity = Math.min(1.0, 0.72 + proximity * 0.28);
      dragAura.style.left = `${clientX}px`;
      dragAura.style.top = `${clientY}px`;
      dragAura.style.transform = `translate3d(-50%, -50%, 0) scale(${auraScale.toFixed(2)})`;
      dragAura.style.opacity = auraOpacity.toFixed(2);
    }

    // Send spatial coordinate packet to desktop synced to hardware refresh
    queueSpatialPacket({
      type: "drag_move",
      edge: desktopEdge,
      phone_edge: phoneEdge,
      coord: normCoord,
      x: normX,
      y: normY,
      vy: smoothVelocityY,
      proximity: proximity,
      pressure: pressure,
      title: activeDrag ? activeDrag.title : "",
      size: activeDrag ? activeDrag.size : "",
      item_type: activeDrag ? activeDrag.itemType : "photo",
      theme: activeTheme
    });
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
      if (wave && wave.parentNode) wave.parentNode.removeChild(wave);
    }, 850);
  }

  async function finishDrag(clientX, clientY) {
    if (rafSpatialId) {
      cancelAnimationFrame(rafSpatialId);
      rafSpatialId = null;
      pendingSpatialPacket = null;
    }
    document.body.classList.remove("is-dragging-active");
    const bulb = document.getElementById("phoneEdgeBulb");
    if (bulb) {
      bulb.style.opacity = "0";
      bulb.style.display = "none";
    }
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
    lastClientX = null;
    lastClientY = null;
    lastTouchTime = null;
    smoothVelocityX = 0;
    smoothVelocityY = 0;
    lastHapticSector = null;

    if (!activeDrag) {
      sendWS({ type: "drag_edge_leave" });
      return;
    }

    const drag = activeDrag;
    activeDrag = null;
    sendWS({ type: "drag_edge_leave" });

    const screenW = window.innerWidth;
    const screenH = window.innerHeight;
    const edgeThreshold = 55;
    let crossedThreshold = false;
    let dropPhoneEdge = drag.phoneEdge || "left";
    let dropDesktopEdge = drag.desktopEdge || "right";
    let dropCoord = drag.normCoord || 0.5;
    let waveX = 0;
    let waveY = clientY;

    if (isMultiSideSend) {
      const crossedLeft = clientX <= edgeThreshold;
      const crossedRight = clientX >= screenW - edgeThreshold;
      const crossedTop = clientY <= edgeThreshold;
      const crossedBottom = clientY >= screenH - edgeThreshold;
      crossedThreshold = crossedLeft || crossedRight || crossedTop || crossedBottom;

      if (crossedLeft) {
        dropPhoneEdge = "left";
        dropDesktopEdge = "right";
        dropCoord = clientY / screenH;
        waveX = 0;
        waveY = clientY;
      } else if (crossedRight) {
        dropPhoneEdge = "right";
        dropDesktopEdge = "left";
        dropCoord = clientY / screenH;
        waveX = screenW;
        waveY = clientY;
      } else if (crossedTop) {
        dropPhoneEdge = "top";
        dropDesktopEdge = "bottom";
        dropCoord = clientX / screenW;
        waveX = clientX;
        waveY = 0;
      } else if (crossedBottom) {
        dropPhoneEdge = "bottom";
        dropDesktopEdge = "top";
        dropCoord = clientX / screenW;
        waveX = clientX;
        waveY = screenH;
      }
    } else {
      // Single-edge locked: verify only the configured primary border was crossed
      if (drag.phoneEdge === "right") {
        crossedThreshold = clientX >= screenW - edgeThreshold;
        dropPhoneEdge = "right";
        dropDesktopEdge = (targetEdgePref && targetEdgePref !== "auto") ? targetEdgePref : "left";
        dropCoord = clientY / screenH;
        waveX = screenW;
        waveY = clientY;
      } else if (drag.phoneEdge === "top") {
        crossedThreshold = clientY <= edgeThreshold;
        dropPhoneEdge = "top";
        dropDesktopEdge = (targetEdgePref && targetEdgePref !== "auto") ? targetEdgePref : "bottom";
        dropCoord = clientX / screenW;
        waveX = clientX;
        waveY = 0;
      } else if (drag.phoneEdge === "bottom") {
        crossedThreshold = clientY >= screenH - edgeThreshold;
        dropPhoneEdge = "bottom";
        dropDesktopEdge = (targetEdgePref && targetEdgePref !== "auto") ? targetEdgePref : "top";
        dropCoord = clientX / screenW;
        waveX = clientX;
        waveY = screenH;
      } else {
        // Default: Phone left edge
        crossedThreshold = clientX <= edgeThreshold;
        dropPhoneEdge = "left";
        dropDesktopEdge = (targetEdgePref && targetEdgePref !== "auto") ? targetEdgePref : "right";
        dropCoord = clientY / screenH;
        waveX = 0;
        waveY = clientY;
      }
    }

    if (targetEdgePref && targetEdgePref !== "auto") {
      dropDesktopEdge = targetEdgePref;
    }

    if (crossedThreshold) {
      triggerMobileWaterWave(waveX, waveY);
      haptic([30, 40, 80]);

      if (drag.itemType === "video") {
        const video = drag.cardElem ? drag.cardElem.querySelector("video") : null;
        const curTime = video ? video.currentTime : 0.0;
        if (video) video.pause();

        sendWS({
          type: "video_resume",
          url: drag.payload || "/media/continue.mp4",
          time: curTime,
          edge: dropDesktopEdge,
          coord: dropCoord,
          x: drag.normalizedX || 0.5,
          y: drag.normalizedY || 0.5
        });
        showToast(`Video Resumed on Desktop (${curTime.toFixed(1)}s)`);
      } else {
        showToast(`Transferred ${drag.title} to Desktop`);
        try {
          const formData = new FormData();
          formData.append("edge", dropDesktopEdge);
          formData.append("coord", dropCoord.toString());
          formData.append("x", (drag.normalizedX || 0.5).toString());
          formData.append("y", (drag.normalizedY || 0.5).toString());
          formData.append("item_type", drag.itemType);

          if (drag.payload instanceof File || drag.payload instanceof Blob) {
            formData.append("file", drag.payload, drag.title);
          } else {
            const res = await fetch(drag.payload);
            const blob = await res.blob();
            formData.append("file", blob, drag.title);
          }

          const uploadEndpoint = (targetHost === window.location.host) ? "/api/upload" : `http://${targetHost}/api/upload`;
          fetch(uploadEndpoint, { method: "POST", body: formData });
        } catch (e) {
          console.error(e);
        }
      }
    }
  }

  // 5. IndexedDB Persistent Local Media Vault & File Pickers
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
      return new Promise((res) => { tx.oncomplete = res; });
    } catch (e) {
      console.warn("IndexedDB save failed:", e);
    }
  }

  async function getAllMediaFromDB() {
    try {
      const db = await openMediaDB();
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      return new Promise((res) => { req.onsuccess = () => res(req.result || []); });
    } catch (e) {
      return [];
    }
  }

  async function clearMediaDB() {
    try {
      const db = await openMediaDB();
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).clear();
      return new Promise((res) => { tx.oncomplete = res; });
    } catch (e) {}
  }

  function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return "0 KB";
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${Math.round(bytes / 1024)} KB`;
  }

  function renderCardFromRecord(record, prepend = false) {
    if (!mediaGrid) return;
    const isImg = record.type && record.type.startsWith("image/");
    const isVid = record.type && record.type.startsWith("video/");
    const cat = isImg ? "photo" : (isVid ? "video" : "document");
    const sizeStr = formatFileSize(record.size);

    const card = document.createElement("div");
    card.className = "card-item";
    card.setAttribute("data-cat", cat);
    card.setAttribute("data-item-type", cat);
    card.setAttribute("data-title", record.name);
    card.setAttribute("data-size", sizeStr);
    card.setAttribute("data-theme", "blue");
    card._customFile = record.blob;

    let blobUrl = "";
    if (record.blob) {
      try {
        blobUrl = URL.createObjectURL(record.blob);
      } catch (e) {}
    } else if (record.url) {
      blobUrl = record.url;
    }

    if (isImg && blobUrl) {
      card.setAttribute("data-file", blobUrl);
      card.innerHTML = `
        <div class="card-thumb"><img src="${blobUrl}" alt="${record.name}" loading="lazy"></div>
        <div class="card-meta">
          <span class="title">${record.name}</span>
          <span class="sub">${sizeStr} • Photo</span>
        </div>
        <div class="card-lift-indicator"></div>
      `;
    } else if (isVid && blobUrl) {
      card.setAttribute("data-file", blobUrl);
      card.innerHTML = `
        <div class="card-thumb" style="background: #000; display: flex; align-items: center; justify-content: center; position: relative;">
          <video src="${blobUrl}" style="width: 100%; height: 100%; object-fit: cover;" preload="metadata" muted></video>
          <div style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.35);">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="#fff"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          </div>
        </div>
        <div class="card-meta">
          <span class="title">${record.name}</span>
          <span class="sub">${sizeStr} • Video</span>
        </div>
        <div class="card-lift-indicator"></div>
      `;
    } else {
      const ext = record.name.split('.').pop().toUpperCase() || "DOC";
      card.innerHTML = `
        <div class="card-thumb doc-thumb doc-blue">
          <div class="doc-icon-badge">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          </div>
          <div class="doc-key-tag">${ext}</div>
        </div>
        <div class="card-meta">
          <span class="title">${record.name}</span>
          <span class="sub">${sizeStr} • File</span>
        </div>
        <div class="card-lift-indicator"></div>
      `;
    }

    if (prepend && mediaGrid.firstChild) {
      mediaGrid.insertBefore(card, mediaGrid.firstChild);
    } else {
      mediaGrid.appendChild(card);
    }
    initCardGestures(card);
  }

  function renderEmptyLibraryState() {
    if (!mediaGrid) return;
    mediaGrid.innerHTML = `
      <div class="empty-library-state">
        <div class="empty-library-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
        </div>
        <h3>No Media Added Yet</h3>
        <p>Select photos, videos, or full folders on your device to flick and drop across devices.</p>
        <div class="empty-actions-row">
          <label for="pickerPhotos" class="btn-picker-pill">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            <span>Open Photos</span>
          </label>
          <label for="pickerFiles" class="btn-picker-pill">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            <span>Open Files</span>
          </label>
        </div>
      </div>
    `;
    if (fileCountBadge) fileCountBadge.textContent = "0 items";
  }

  async function handleFilesSelected(files) {
    if (!files || !files.length) return;
    const emptyState = document.querySelector(".empty-library-state");
    if (emptyState) emptyState.remove();

    for (const file of files) {
      const record = {
        id: "file_" + Date.now() + "_" + Math.random().toString(36).substr(2, 6),
        name: file.name,
        size: file.size,
        type: file.type || "application/octet-stream",
        blob: file,
        mtime: file.lastModified || Date.now()
      };
      await saveMediaToDB(record);
      renderCardFromRecord(record, true);
    }
    showToast(`Added ${files.length} item${files.length > 1 ? 's' : ''} to library`);
    filterGrid();
  }

  // Hook up file pickers
  ["pickerPhotos", "pickerFiles", "pickerFolder"].forEach((id) => {
    const input = document.getElementById(id);
    if (input) {
      input.addEventListener("change", (e) => {
        const files = Array.from(e.target.files);
        handleFilesSelected(files);
        input.value = "";
      });
    }
  });

  const btnClearLibrary = document.getElementById("btnClearLibrary");
  if (btnClearLibrary) {
    btnClearLibrary.addEventListener("click", async () => {
      if (confirm("Clear all added local media from this device?")) {
        await clearMediaDB();
        renderEmptyLibraryState();
        showToast("Local Library Cleared");
      }
    });
  }

  // Load Saved Library from IndexedDB & Laptop Shares
  async function loadLibrary() {
    const saved = await getAllMediaFromDB();
    if (saved && saved.length > 0) {
      mediaGrid.innerHTML = "";
      saved.forEach((item) => renderCardFromRecord(item, false));
    } else {
      renderEmptyLibraryState();
    }

    // Also fetch files shared from laptop
    try {
      const res = await fetch(`http://${targetHost}/api/shared_files`);
      if (res.ok) {
        const sharedFiles = await res.json();
        if (sharedFiles && sharedFiles.length > 0) {
          const emptyState = document.querySelector(".empty-library-state");
          if (emptyState) emptyState.remove();
          sharedFiles.forEach((sf) => {
            const card = document.createElement("div");
            const cat = sf.is_image ? "photo" : (sf.is_video ? "video" : "document");
            card.className = "card-item";
            card.setAttribute("data-cat", cat);
            card.setAttribute("data-item-type", cat);
            card.setAttribute("data-title", sf.filename);
            card.setAttribute("data-size", formatFileSize(sf.size));
            card.setAttribute("data-file", sf.url);

            if (sf.is_image) {
              card.innerHTML = `
                <div class="card-thumb"><img src="${sf.url}" alt="${sf.filename}" loading="lazy"></div>
                <div class="card-meta">
                  <span class="title">${sf.filename}</span>
                  <span class="sub">${formatFileSize(sf.size)} • Laptop Share</span>
                </div>
                <div class="card-lift-indicator"></div>
              `;
            } else {
              card.innerHTML = `
                <div class="card-thumb doc-thumb doc-violet">
                  <div class="doc-icon-badge">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                  </div>
                  <div class="doc-key-tag">SHARE</div>
                </div>
                <div class="card-meta">
                  <span class="title">${sf.filename}</span>
                  <span class="sub">${formatFileSize(sf.size)} • Laptop Share</span>
                </div>
                <div class="card-lift-indicator"></div>
              `;
            }
            mediaGrid.insertBefore(card, mediaGrid.firstChild);
            initCardGestures(card);
          });
        }
      }
    } catch (e) {}

    filterGrid();
  }

  loadLibrary();

  // 6. Target Device Controller in Settings
  const targetDeviceName = document.getElementById("targetDeviceName");
  const targetDeviceIp = document.getElementById("targetDeviceIp");
  const peersList = document.getElementById("peersList");
  const inputCustomTarget = document.getElementById("inputCustomTarget");
  const btnApplyTarget = document.getElementById("btnApplyTarget");
  const selectTargetEdge = document.getElementById("selectTargetEdge");
  const toggleMultiSide = document.getElementById("toggleMultiSide");
  const multiSideSubtitle = document.getElementById("multiSideSubtitle");

  function updateMultiSideUI() {
    if (toggleMultiSide) {
      toggleMultiSide.checked = isMultiSideSend;
    }
    if (multiSideSubtitle) {
      if (isMultiSideSend) {
        multiSideSubtitle.textContent = "Flick towards any bezel (Left, Right, Up, Down)";
      } else {
        const primary = targetEdgePref === 'auto' ? 'Left' : (targetEdgePref === 'left' ? 'Right' : (targetEdgePref === 'bottom' ? 'Top' : (targetEdgePref === 'top' ? 'Bottom' : 'Left')));
        multiSideSubtitle.textContent = `Single Edge Only: Flick towards ${primary} bezel`;
      }
    }
  }

  updateMultiSideUI();

  if (toggleMultiSide) {
    toggleMultiSide.addEventListener("change", (e) => {
      isMultiSideSend = e.target.checked;
      localStorage.setItem("drap_multi_side_send", isMultiSideSend);
      updateMultiSideUI();
      showToast(isMultiSideSend ? "Multi-Side Send: Enabled (All Edges)" : "Multi-Side Send: Disabled (Single Edge)");
    });
  }

  if (selectTargetEdge) {
    selectTargetEdge.value = targetEdgePref;
    selectTargetEdge.addEventListener("change", (e) => {
      targetEdgePref = e.target.value;
      localStorage.setItem("drap_target_edge", targetEdgePref);
      updateMultiSideUI();
      showToast(`Desktop alignment: ${targetEdgePref.toUpperCase()}`);
    });
  }

  if (inputCustomTarget) {
    inputCustomTarget.value = targetHost;
  }

  if (btnApplyTarget && inputCustomTarget) {
    btnApplyTarget.addEventListener("click", () => {
      const val = inputCustomTarget.value.trim();
      if (!val) return;
      targetHost = val;
      localStorage.setItem("drap_target_host", targetHost);
      showToast(`Target set to ${targetHost}`);
      connectWS();
      fetchDeviceInfo();
    });
  }

  async function fetchDeviceInfo() {
    try {
      const res = await fetch(`http://${targetHost}/api/device_info`);
      if (res.ok) {
        const info = await res.json();
        if (targetDeviceName) targetDeviceName.textContent = info.alias || "Desktop (Hyprland)";
        if (targetDeviceIp) targetDeviceIp.textContent = `${info.ip || targetHost}:${info.port || 8080} • Connected 🟢`;
      }
    } catch (e) {
      if (targetDeviceIp) targetDeviceIp.textContent = `${targetHost} (Direct)`;
    }
    fetchPeers();
  }

  async function fetchPeers() {
    if (!peersList) return;
    try {
      const res = await fetch(`http://${targetHost}/api/localsend/peers`);
      if (res.ok) {
        const peers = await res.json();
        peersList.innerHTML = `
          <div class="peer-item active">
            <span>🖥️ ${targetDeviceName ? targetDeviceName.textContent : 'Target Desktop'}</span>
            <span class="peer-tag">Active</span>
          </div>
        `;
        if (peers && peers.length > 0) {
          peers.forEach((p) => {
            const peerHost = `${p.ip}:${p.port || 53317}`;
            if (peerHost !== targetHost) {
              const item = document.createElement("div");
              item.className = "peer-item";
              item.innerHTML = `
                <span>📱 ${p.alias || p.device_model || p.ip}</span>
                <span class="peer-tag" style="background: rgba(255,255,255,0.1); color: #fff;">Connect</span>
              `;
              item.addEventListener("click", () => {
                targetHost = `${p.ip}:8080`;
                localStorage.setItem("drap_target_host", targetHost);
                if (inputCustomTarget) inputCustomTarget.value = targetHost;
                showToast(`Switched target to ${p.alias || p.ip}`);
                connectWS();
                fetchDeviceInfo();
              });
              peersList.appendChild(item);
            }
          });
        }
      }
    } catch (e) {}
  }

  // 7. Lightbox Preview
  const lightbox = document.getElementById("lightbox");
  const lightboxImg = document.getElementById("lightboxImg");
  const lightboxTitle = document.getElementById("lightboxTitle");
  const lightboxDownload = document.getElementById("lightboxDownload");
  const lightboxClose = document.getElementById("lightboxClose");

  function openLightbox(src, title) {
    if (!lightbox) return;
    lightboxImg.src = src;
    lightboxTitle.textContent = title;
    lightboxDownload.href = src;
    lightboxDownload.download = title;
    lightbox.classList.add("open");
  }

  if (lightboxClose) {
    lightboxClose.addEventListener("click", () => lightbox.classList.remove("open"));
  }
  if (lightbox) {
    lightbox.addEventListener("click", (e) => {
      if (e.target === lightbox) lightbox.classList.remove("open");
    });
  }

  // 7. Clipboard Quick Send
  const quickSendBtn = document.getElementById("quickSendBtn");
  const quickTextInput = document.getElementById("quickTextInput");

  if (quickSendBtn && quickTextInput) {
    quickSendBtn.addEventListener("click", async () => {
      const text = quickTextInput.value.trim();
      if (!text) return;
      try {
        const formData = new FormData();
        formData.append("text", text);
        await fetch("/api/clipboard", { method: "POST", body: formData });
        showToast("Text Sent to Desktop Clipboard");
        quickTextInput.value = "";
      } catch (e) {
        showToast("Error sending clipboard");
      }
    });
  }

  // 8. Video Player Indicator
  const videoCard = document.getElementById("videoHandoffCard");
  const videoElem = document.getElementById("continuityVideo");
  const videoPlayIndicator = document.getElementById("videoPlayIndicator");
  const videoTime = document.getElementById("videoTime");

  if (videoElem && videoPlayIndicator) {
    videoCard.addEventListener("click", (e) => {
      if (currentMode === 'browse' && !isHoldLifted && !activeDrag) {
        if (videoElem.paused) {
          videoElem.play();
          videoPlayIndicator.style.display = "none";
        } else {
          videoElem.pause();
          videoPlayIndicator.style.display = "flex";
        }
      }
    });

    videoElem.addEventListener("timeupdate", () => {
      if (videoTime && videoElem.duration) {
        const curM = Math.floor(videoElem.currentTime / 60);
        const curS = Math.floor(videoElem.currentTime % 60).toString().padStart(2, '0');
        const durM = Math.floor(videoElem.duration / 60);
        const durS = Math.floor(videoElem.duration % 60).toString().padStart(2, '0');
        videoTime.textContent = `${curM}:${curS} / ${durM}:${durS} • Drag to Desktop`;
      }
    });
  }

  filterGrid();
})();

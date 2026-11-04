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
  const leftBezelHalo = document.getElementById("leftBezelHalo");
  const leftBezelRim = document.getElementById("leftBezelRim");
  const dragGhost = document.getElementById("dragGhost");
  const ghostThumb = document.getElementById("ghostThumb");
  const ghostTitle = document.getElementById("ghostTitle");
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

  // 3. WebSocket Real-Time Gateway
  let ws = null;
  const statusPill = document.getElementById("statusPill");

  function connectWS() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    ws = new WebSocket(`${protocol}//${host}/ws`);

    ws.onopen = () => {
      if (statusPill) {
        statusPill.classList.add("connected");
        const txt = statusPill.querySelector(".status-text");
        if (txt) txt.textContent = "Connected";
      }
    };

    ws.onclose = () => {
      if (statusPill) {
        statusPill.classList.remove("connected");
        const txt = statusPill.querySelector(".status-text");
        if (txt) txt.textContent = "Reconnecting...";
      }
      setTimeout(connectWS, 2000);
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
      }, 550);
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
        ghostTitle.textContent = title;
        if (thumbUrl) {
          ghostThumb.style.backgroundImage = `url('${thumbUrl}')`;
          ghostThumb.style.display = "block";
        } else {
          ghostThumb.style.backgroundImage = "none";
          ghostThumb.style.display = "none";
        }
        updateGhostPosition(x, y);
      }
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

      // Scroll vs Drag Directional Angle Check
      if (!isHoldLifted && !activeDrag) {
        if (Math.abs(dy) > Math.abs(dx) || dy > 8 || dy < -8) {
          // Pure vertical scrolling -> cancel hold timer & lock into scroll!
          isScrolling = true;
          clearTimeout(holdTimer);
          return;
        }

        // In Transfer Mode: Immediate drag on flicking towards ANY edge (left, right, up, down)
        if (currentMode === 'transfer') {
          const isHorizFlick = Math.abs(dx) > 18 && Math.abs(dx) > Math.abs(dy) * 1.25;
          const isVertFlick = Math.abs(dy) > 22 && Math.abs(dy) > Math.abs(dx) * 1.25;
          if (isHorizFlick || isVertFlick) {
            e.preventDefault();
            startActiveDrag(t.clientX, t.clientY);
          }
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
    if (!dragGhost) return;
    dragGhost.style.left = `${x}px`;
    dragGhost.style.top = `${y}px`;
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

    // Distances to all 4 borders of the phone
    const distLeft = clientX;
    const distRight = screenW - clientX;
    const distTop = clientY;
    const distBottom = screenH - clientY;

    const horizReach = screenW * 0.60;
    const vertReach = screenH * 0.38;

    const proxLeft = Math.max(0.0, Math.min(1.0, (horizReach - distLeft) / (horizReach * 0.82)));
    const proxRight = Math.max(0.0, Math.min(1.0, (horizReach - distRight) / (horizReach * 0.82)));
    const proxTop = Math.max(0.0, Math.min(1.0, (vertReach - distTop) / (vertReach * 0.82)));
    const proxBottom = Math.max(0.0, Math.min(1.0, (vertReach - distBottom) / (vertReach * 0.82)));

    let phoneEdge = "left";
    let desktopEdge = "right";
    let proximity = proxLeft;
    let normCoord = normY;

    if (proxRight > proximity) {
      proximity = proxRight;
      phoneEdge = "right";
      desktopEdge = "left";
      normCoord = normY;
    }
    if (proxTop > proximity) {
      proximity = proxTop;
      phoneEdge = "top";
      desktopEdge = "bottom";
      normCoord = normX;
    }
    if (proxBottom > proximity) {
      proximity = proxBottom;
      phoneEdge = "bottom";
      desktopEdge = "top";
      normCoord = normX;
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
        bulb.style.opacity = Math.min(1.0, proximity * 1.8);
        const push = (1.0 - proximity) * -65;
        const scale = 0.85 + proximity * 0.55;

        if (phoneEdge === "left") {
          bulb.style.left = "0";
          bulb.style.right = "auto";
          bulb.style.top = `${clientY}px`;
          bulb.style.bottom = "auto";
          bulb.style.transform = `translateY(-50%) translateX(${push}%) scale(${scale})`;
          if (leftBezelRim) {
            leftBezelRim.style.left = "0"; leftBezelRim.style.right = "auto";
            leftBezelRim.style.top = "0"; leftBezelRim.style.bottom = "0";
            leftBezelRim.style.width = "5px"; leftBezelRim.style.height = "100%";
            leftBezelRim.style.opacity = Math.min(1.0, proximity * 1.9);
          }
        } else if (phoneEdge === "right") {
          bulb.style.left = "auto";
          bulb.style.right = "0";
          bulb.style.top = `${clientY}px`;
          bulb.style.bottom = "auto";
          bulb.style.transform = `translateY(-50%) translateX(${-push}%) rotate(180deg) scale(${scale})`;
          if (leftBezelRim) {
            leftBezelRim.style.left = "auto"; leftBezelRim.style.right = "0";
            leftBezelRim.style.top = "0"; leftBezelRim.style.bottom = "0";
            leftBezelRim.style.width = "5px"; leftBezelRim.style.height = "100%";
            leftBezelRim.style.opacity = Math.min(1.0, proximity * 1.9);
          }
        } else if (phoneEdge === "top") {
          bulb.style.left = `${clientX}px`;
          bulb.style.right = "auto";
          bulb.style.top = "0";
          bulb.style.bottom = "auto";
          bulb.style.transform = `translateX(-50%) translateY(${push}%) rotate(90deg) scale(${scale})`;
          if (leftBezelRim) {
            leftBezelRim.style.left = "0"; leftBezelRim.style.right = "0";
            leftBezelRim.style.top = "0"; leftBezelRim.style.bottom = "auto";
            leftBezelRim.style.width = "100%"; leftBezelRim.style.height = "5px";
            leftBezelRim.style.opacity = Math.min(1.0, proximity * 1.9);
          }
        } else if (phoneEdge === "bottom") {
          bulb.style.left = `${clientX}px`;
          bulb.style.right = "auto";
          bulb.style.top = "auto";
          bulb.style.bottom = "0";
          bulb.style.transform = `translateX(-50%) translateY(${-push}%) rotate(-90deg) scale(${scale})`;
          if (leftBezelRim) {
            leftBezelRim.style.left = "0"; leftBezelRim.style.right = "0";
            leftBezelRim.style.top = "auto"; leftBezelRim.style.bottom = "0";
            leftBezelRim.style.width = "100%"; leftBezelRim.style.height = "5px";
            leftBezelRim.style.opacity = Math.min(1.0, proximity * 1.9);
          }
        }
      }
      if (leftBezelHalo) {
        leftBezelHalo.style.opacity = Math.min(1.0, proximity * 1.8);
      }
    } else {
      if (leftBezelHalo) leftBezelHalo.style.opacity = "0";
      if (leftBezelRim) leftBezelRim.style.opacity = "0";
      if (bulb) bulb.style.opacity = "0";
    }

    if (dragGhost) {
      const velTilt = Math.max(-14, Math.min(14, smoothVelocityY * 18));
      const normTilt = (normY - 0.5) * -10;
      const totalTilt = velTilt + normTilt;
      const squeezeX = proximity > 0.4 ? (1.0 - (proximity - 0.4) * 0.28) : 1.0;
      const squeezeY = proximity > 0.4 ? (1.0 + (proximity - 0.4) * 0.20) : 1.0;
      dragGhost.style.transform = `translate(-50%, -50%) rotate(${totalTilt.toFixed(1)}deg) scaleX(${(1.06 * squeezeX).toFixed(3)}) scaleY(${(1.06 * squeezeY).toFixed(3)})`;
    }

    // Send spatial coordinate packet to desktop
    sendWS({
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
    document.body.classList.remove("is-dragging-active");
    if (leftBezelHalo) leftBezelHalo.style.opacity = "0";
    if (leftBezelRim) leftBezelRim.style.opacity = "0";
    const bulb = document.getElementById("phoneEdgeBulb");
    if (bulb) bulb.style.opacity = "0";
    if (dragGhost) dragGhost.style.display = "none";
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
    const crossedLeft = clientX <= edgeThreshold;
    const crossedRight = clientX >= screenW - edgeThreshold;
    const crossedTop = clientY <= edgeThreshold;
    const crossedBottom = clientY >= screenH - edgeThreshold;
    const crossedThreshold = crossedLeft || crossedRight || crossedTop || crossedBottom;

    let dropPhoneEdge = drag.phoneEdge || "left";
    let dropDesktopEdge = drag.desktopEdge || "right";
    let dropCoord = drag.normCoord || 0.5;
    let waveX = 0;
    let waveY = clientY;

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

    if (crossedThreshold) {
      triggerMobileWaterWave(waveX, waveY);
      haptic([30, 40, 80]);

      if (drag.itemType === "video") {
        const video = document.getElementById("continuityVideo");
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

          fetch("/api/upload", { method: "POST", body: formData });
        } catch (e) {
          console.error(e);
        }
      }
    }
  }

  // 5. System File Picker & Dynamic Card Generation
  const customFileInput = document.getElementById("customFileInput");
  if (customFileInput) {
    customFileInput.addEventListener("change", (e) => {
      const files = Array.from(e.target.files);
      if (!files.length) return;

      files.forEach(file => {
        const isImg = file.type.startsWith("image/");
        const isVid = file.type.startsWith("video/");
        const cat = isImg ? "photo" : (isVid ? "video" : "document");
        const sizeStr = file.size >= 1024 * 1024 ? `${(file.size / (1024 * 1024)).toFixed(1)} MB` : `${Math.round(file.size / 1024)} KB`;

        const card = document.createElement("div");
        card.className = "card-item";
        card.setAttribute("data-cat", cat);
        card.setAttribute("data-item-type", cat);
        card.setAttribute("data-title", file.name);
        card.setAttribute("data-size", sizeStr);
        card.setAttribute("data-theme", "blue");
        card._customFile = file;

        if (isImg) {
          const url = URL.createObjectURL(file);
          card.innerHTML = `
            <div class="card-thumb"><img src="${url}" alt="${file.name}"></div>
            <div class="card-meta">
              <span class="title">${file.name}</span>
              <span class="sub">${sizeStr} • Added</span>
            </div>
            <div class="card-lift-indicator"></div>
          `;
          card.setAttribute("data-file", url);
        } else {
          card.innerHTML = `
            <div class="card-thumb doc-thumb doc-blue">
              <div class="doc-icon-badge">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              </div>
              <div class="doc-key-tag">${file.name.split('.').pop().toUpperCase()}</div>
            </div>
            <div class="card-meta">
              <span class="title">${file.name}</span>
              <span class="sub">${sizeStr} • Added</span>
            </div>
            <div class="card-lift-indicator"></div>
          `;
        }

        mediaGrid.insertBefore(card, mediaGrid.firstChild);
        initCardGestures(card);
      });

      showToast(`Added ${files.length} file${files.length > 1 ? 's' : ''}`);
      filterGrid();
      customFileInput.value = "";
    });
  }

  // Attach gestures to all initial cards
  document.querySelectorAll(".card-item").forEach(card => initCardGestures(card));

  // 6. Lightbox Preview
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

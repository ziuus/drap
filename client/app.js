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
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        if (isIOS) {
          showToast("Tap Share ⎋ below -> Add to Home Screen ⊕");
        } else {
          showToast("Tap Chrome menu ⋮ (top right) -> Add to Home screen");
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
  let activeTheme = localStorage.getItem("drap_effect_theme") || "aurora";
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

    function startActiveDrag(x, y) {
      isHoldLifted = true;
      card.classList.add("is-lifted", "is-dragging");
      document.body.classList.add("is-dragging-active");
      haptic(30);

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

        // In Transfer Mode: Immediate drag if swiping left towards bezel
        if (currentMode === 'transfer' && dx < -18 && Math.abs(dx) > Math.abs(dy) * 1.5) {
          e.preventDefault();
          startActiveDrag(t.clientX, t.clientY);
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

  function onDragStreaming(clientX, clientY) {
    updateGhostPosition(clientX, clientY);

    const screenW = window.innerWidth;
    const screenH = window.innerHeight;
    const normY = Math.max(0.05, Math.min(0.95, clientY / screenH));

    // Calculate proximity and bezel penetration depth
    const leftReach = screenW * 0.70;
    const proximity = clientX > leftReach ? 0.0 : Math.max(0.0, Math.min(1.0, (leftReach - clientX) / (leftReach * 0.85)));
    const peekDepth = Math.max(0.0, Math.min(1.0, (leftReach * 0.45 - clientX) / (leftReach * 0.45)));
    const pressure = 0.5 + (proximity * 0.5);

    if (activeDrag) {
      activeDrag.normalizedY = normY;
    }

    // Phone Edge Glow & Meniscus Bulb feedback
    const bulb = document.getElementById("phoneEdgeBulb");
    if (proximity > 0.05) {
      leftBezelHalo.style.opacity = Math.min(1.0, proximity * 1.8);
      leftBezelRim.style.opacity = Math.min(1.0, proximity * 1.9);
      if (bulb) {
        bulb.style.top = `${clientY}px`;
        bulb.style.opacity = Math.min(1.0, proximity * 1.8);
        const pushX = (1.0 - proximity) * -65;
        bulb.style.transform = `translateY(-50%) translateX(${pushX}%) scale(${0.85 + proximity * 0.55})`;
      }
    } else {
      leftBezelHalo.style.opacity = "0";
      leftBezelRim.style.opacity = "0";
      if (bulb) bulb.style.opacity = "0";
    }

    if (dragGhost) {
      const tilt = Math.max(-14, Math.min(14, (normY - 0.5) * -18 - (proximity * 6)));
      const squeezeX = proximity > 0.4 ? (1.0 - (proximity - 0.4) * 0.28) : 1.0;
      const squeezeY = proximity > 0.4 ? (1.0 + (proximity - 0.4) * 0.20) : 1.0;
      dragGhost.style.transform = `translate(-50%, -50%) rotate(${tilt}deg) scaleX(${(1.06 * squeezeX).toFixed(3)}) scaleY(${(1.06 * squeezeY).toFixed(3)})`;
    }

    // Send spatial coordinate packet to desktop
    sendWS({
      type: "drag_move",
      y: normY,
      proximity: proximity,
      pressure: pressure,
      peek: peekDepth,
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
    wave.style.top = `${y}px`;
    container.appendChild(wave);
    setTimeout(() => {
      if (wave && wave.parentNode) wave.parentNode.removeChild(wave);
    }, 850);
  }

  async function finishDrag(clientX, clientY) {
    document.body.classList.remove("is-dragging-active");
    leftBezelHalo.style.opacity = "0";
    leftBezelRim.style.opacity = "0";
    const bulb = document.getElementById("phoneEdgeBulb");
    if (bulb) bulb.style.opacity = "0";
    if (dragGhost) dragGhost.style.display = "none";

    if (!activeDrag) {
      sendWS({ type: "drag_edge_leave" });
      return;
    }

    const drag = activeDrag;
    activeDrag = null;
    sendWS({ type: "drag_edge_leave" });

    // Threshold: Reached left bezel edge
    const crossedThreshold = clientX <= 55;

    if (crossedThreshold) {
      triggerMobileWaterWave(clientX, clientY);
      haptic([30, 40, 80]);

      if (drag.itemType === "video") {
        const video = document.getElementById("continuityVideo");
        const curTime = video ? video.currentTime : 0.0;
        if (video) video.pause();

        sendWS({
          type: "video_resume",
          url: drag.payload || "/media/continue.mp4",
          time: curTime,
          y: drag.normalizedY
        });
        showToast(`Video Resumed on Desktop (${curTime.toFixed(1)}s)`);
      } else {
        showToast(`Transferred ${drag.title} to Desktop`);
        try {
          const formData = new FormData();
          formData.append("y", drag.normalizedY.toString());
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

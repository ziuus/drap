// Drooop Mobile & Desktop Client - Spatial Touch, PWA, Photo Viewer & Sharing Engine
document.addEventListener("DOMContentLoaded", () => {
  const statusPill = document.getElementById("statusPill");
  const leftBezelAura = document.getElementById("leftBezelAura");
  const leftBezelAuraGlow = document.getElementById("leftBezelAuraGlow");
  const leftBezelRim = document.getElementById("leftBezelRim");
  const dragGhost = document.getElementById("dragGhost");
  const ghostThumb = document.getElementById("ghostThumb");
  const ghostTitle = document.getElementById("ghostTitle");
  const ghostSub = document.getElementById("ghostSub");
  const handoffToast = document.getElementById("handoffToast");
  const toastMessage = document.getElementById("toastMessage");
  const continuityVideo = document.getElementById("continuityVideo");
  const videoTimestampDisplay = document.getElementById("videoTimestampDisplay");
  const customFileInput = document.getElementById("customFileInput");
  const mediaGrid = document.getElementById("mediaGrid");
  const installPwaBtn = document.getElementById("installPwaBtn");

  // Lightbox elements
  const photoLightbox = document.getElementById("photoLightbox");
  const lightboxImg = document.getElementById("lightboxImg");
  const lightboxTitle = document.getElementById("lightboxTitle");
  const lightboxSize = document.getElementById("lightboxSize");
  const lightboxCloseBtn = document.getElementById("lightboxCloseBtn");
  const lightboxDownloadBtn = document.getElementById("lightboxDownloadBtn");
  const lightboxSendBtn = document.getElementById("lightboxSendBtn");
  const lightboxBackdrop = document.querySelector(".lightbox-backdrop");

  // Laptop to Phone elements
  const laptopDropZone = document.getElementById("laptopDropZone");
  const laptopFileInput = document.getElementById("laptopFileInput");
  const receivedSection = document.getElementById("receivedSection");
  const receivedList = document.getElementById("receivedList");

  let ws = null;
  let isConnected = false;
  let activeDrag = null;
  let lastEmittedTime = 0;
  let isPendingEmission = false;
  let currentLightboxItem = null;
  let deferredPrompt = null;

  // 1. PWA Service Worker Registration & Install Prompt
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(err => {
      console.log("Service Worker registration failed:", err);
    });
  }

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (installPwaBtn) {
      installPwaBtn.style.display = "flex";
      installPwaBtn.addEventListener("click", async () => {
        if (deferredPrompt) {
          deferredPrompt.prompt();
          const { outcome } = await deferredPrompt.userChoice;
          if (outcome === "accepted") {
            installPwaBtn.style.display = "none";
          }
          deferredPrompt = null;
        }
      });
    }
  });

  // 2. WebSocket Signaling Connection
  function connectWebSocket() {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${proto}//${window.location.host}/ws`;
    
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      isConnected = true;
      statusPill.classList.add("connected");
      statusPill.innerHTML = `<span>Connected (${window.location.hostname})</span>`;
    };

    ws.onclose = () => {
      isConnected = false;
      statusPill.classList.remove("connected");
      statusPill.innerHTML = "<span>Reconnecting...</span>";
      setTimeout(connectWebSocket, 1500);
    };

    ws.onerror = () => {
      ws.close();
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "file_from_laptop") {
          handleIncomingFromLaptop(msg);
        } else if (msg.type === "text_received" && msg.sender !== "phone") {
          handleIncomingText(msg.text);
        }
      } catch (e) {}
    };
  }

  function sendWS(data) {
    if (ws && isConnected && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  connectWebSocket();

  // 3. Ambient Effect Theme Switcher
  const effectGradients = {
    liquid: "radial-gradient(ellipse at left center, rgba(240, 253, 250, 0.95) 0%, rgba(20, 184, 166, 0.9) 20%, rgba(6, 182, 212, 0.8) 45%, rgba(14, 116, 144, 0.5) 70%, transparent 100%)",
    aurora: "radial-gradient(ellipse at left center, rgba(255, 255, 255, 0.95) 0%, rgba(251, 191, 36, 0.85) 15%, rgba(244, 63, 94, 0.8) 32%, rgba(139, 92, 246, 0.7) 50%, rgba(6, 182, 212, 0.45) 70%, transparent 100%)",
    plasma: "radial-gradient(ellipse at left center, rgba(255, 255, 255, 0.95) 0%, rgba(168, 85, 247, 0.9) 25%, rgba(244, 63, 94, 0.8) 55%, rgba(6, 182, 212, 0.5) 75%, transparent 100%)",
    solar: "radial-gradient(ellipse at left center, rgba(255, 255, 240, 0.98) 0%, rgba(251, 191, 36, 0.92) 20%, rgba(234, 88, 12, 0.82) 48%, rgba(185, 28, 28, 0.5) 75%, transparent 100%)"
  };

  document.querySelectorAll(".effect-pill").forEach(pill => {
    pill.addEventListener("click", () => {
      document.querySelectorAll(".effect-pill").forEach(p => p.classList.remove("active"));
      pill.classList.add("active");
      const theme = pill.getAttribute("data-theme") || "liquid";
      sendWS({ type: "set_effect", theme: theme });
      if (leftBezelAuraGlow && effectGradients[theme]) {
        leftBezelAuraGlow.style.background = effectGradients[theme];
      }
      triggerHaptics([25]);
      showToast(`Effect switched to ${pill.innerText.trim()}`);
    });
  });

  // 4. Haptic & Toast Feedback
  function triggerHaptics(pattern = [40, 20, 50]) {
    if ("vibrate" in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch (e) {}
    }
  }

  function showToast(text) {
    toastMessage.innerText = text;
    handoffToast.classList.add("visible");
    setTimeout(() => {
      handoffToast.classList.remove("visible");
    }, 2800);
  }

  // 4. Fullscreen Photo Viewer / Lightbox
  function openLightbox(title, imgSrc, sizeStr = "High Resolution", filePayload = null) {
    currentLightboxItem = { title, imgSrc, sizeStr, filePayload };
    lightboxImg.src = imgSrc;
    lightboxTitle.innerText = title;
    lightboxSize.innerText = sizeStr;
    lightboxDownloadBtn.href = imgSrc;
    lightboxDownloadBtn.setAttribute("download", title);
    photoLightbox.classList.add("open");
  }

  function closeLightbox() {
    photoLightbox.classList.remove("open");
    currentLightboxItem = null;
  }

  if (lightboxCloseBtn) lightboxCloseBtn.addEventListener("click", closeLightbox);
  if (lightboxBackdrop) lightboxBackdrop.addEventListener("click", closeLightbox);

  if (lightboxSendBtn) {
    lightboxSendBtn.addEventListener("click", async () => {
      if (!currentLightboxItem) return;
      const item = currentLightboxItem;
      closeLightbox();
      showToast(`Pushed ${item.title} to Laptop ~/Downloads`);
      triggerHaptics([40, 20, 60]);

      sendWS({
        type: "drag_drop",
        y: 0.5,
        filename: item.title,
        item_type: "photo"
      });

      try {
        const formData = new FormData();
        formData.append("y", "0.5");
        formData.append("item_type", "photo");
        if (item.filePayload instanceof File || item.filePayload instanceof Blob) {
          formData.append("file", item.filePayload, item.title);
        } else {
          const res = await fetch(item.imgSrc);
          const blob = await res.blob();
          formData.append("file", blob, item.title);
        }
        fetch("/api/upload", { method: "POST", body: formData }).catch(() => {});
      } catch (err) {
        console.error(err);
      }
    });
  }

  // 5. LocalSend Text & Link Sharing
  const localSendText = document.getElementById("localSendText");
  const localSendBtn = document.getElementById("localSendBtn");
  const localSendReceivedBox = document.getElementById("localSendReceivedBox");
  const localSendReceivedText = document.getElementById("localSendReceivedText");
  const copyLocalSendBtn = document.getElementById("copyLocalSendBtn");

  if (localSendBtn && localSendText) {
    localSendBtn.addEventListener("click", () => {
      const text = localSendText.value.trim();
      if (!text) return;
      fetch("/api/send_text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text, sender: "phone" })
      })
      .then(r => r.json())
      .then(() => {
        triggerHaptics([40]);
        showToast("Copied to Laptop Clipboard! 📋");
        localSendText.value = "";
      })
      .catch(e => console.error("LocalSend error:", e));
    });
  }

  function handleIncomingText(text) {
    triggerHaptics([60, 40]);
    showToast("Received Text from Laptop! 📋");
    if (localSendReceivedBox && localSendReceivedText) {
      localSendReceivedBox.style.display = "block";
      localSendReceivedText.innerText = text;
    }
  }

  if (copyLocalSendBtn && localSendReceivedText) {
    copyLocalSendBtn.addEventListener("click", () => {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(localSendReceivedText.innerText).then(() => {
          showToast("Copied to Phone Clipboard! ✓");
          triggerHaptics([30]);
        });
      }
    });
  }

  // 6. Laptop to Phone File Sharing
  function handleIncomingFromLaptop(fileData) {
    triggerHaptics([60, 40, 80]);
    showToast(`Incoming from Laptop: ${fileData.filename}`);
    addReceivedCard(fileData, true);
  }

  function addReceivedCard(fileData, prepend = false) {
    if (!receivedSection) return;
    receivedSection.style.display = "block";

    const card = document.createElement("div");
    card.className = "received-card";
    const sizeKB = (fileData.size / 1024).toFixed(0);
    const sizeStr = fileData.size >= 1048576 ? `${(fileData.size / 1048576).toFixed(1)} MB` : `${sizeKB} KB`;

    card.innerHTML = `
      <div class="received-card-left">
        <div class="received-icon">${fileData.is_image ? "🖼️" : fileData.is_video ? "🎬" : "📄"}</div>
        <div class="received-meta">
          <h4 title="${fileData.filename}">${fileData.filename}</h4>
          <span>${sizeStr} • Just received</span>
        </div>
      </div>
      <div class="received-card-actions">
        ${fileData.is_image ? `<button class="btn-received-action view" type="button">View</button>` : ""}
        <a class="btn-received-action download" href="${fileData.url}" download="${fileData.filename}">Download</a>
      </div>
    `;

    if (fileData.is_image) {
      const viewBtn = card.querySelector(".btn-received-action.view");
      if (viewBtn) {
        viewBtn.addEventListener("click", () => {
          openLightbox(fileData.filename, fileData.url, sizeStr, fileData.url);
        });
      }
    }

    if (prepend && receivedList.firstChild) {
      receivedList.insertBefore(card, receivedList.firstChild);
    } else {
      receivedList.appendChild(card);
    }
  }

  // Load existing shared files on startup
  fetch("/api/shared_files")
    .then(r => r.json())
    .then(files => {
      if (Array.isArray(files) && files.length > 0) {
        files.forEach(f => addReceivedCard(f));
      }
    })
    .catch(() => {});

  // Laptop Drop Zone Event Handlers
  if (laptopDropZone) {
    laptopDropZone.addEventListener("click", () => laptopFileInput.click());

    laptopDropZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      laptopDropZone.classList.add("drag-over");
    });

    laptopDropZone.addEventListener("dragleave", () => {
      laptopDropZone.classList.remove("drag-over");
    });

    laptopDropZone.addEventListener("drop", (e) => {
      e.preventDefault();
      laptopDropZone.classList.remove("drag-over");
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleLaptopUpload(e.dataTransfer.files);
      }
    });

    laptopFileInput.addEventListener("change", (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleLaptopUpload(e.target.files);
      }
    });
  }

  function handleLaptopUpload(fileList) {
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const formData = new FormData();
      formData.append("file", file);

      showToast(`Uploading ${file.name} to Phone...`);

      fetch("/api/share_to_phone", {
        method: "POST",
        body: formData
      })
      .then(r => r.json())
      .then(res => {
        showToast(`Sent ${file.name} to Phone!`);
      })
      .catch(err => {
        console.error(err);
      });
    }
  }

  // 6. Video Player Integration
  if (continuityVideo) {
    continuityVideo.addEventListener("timeupdate", () => {
      const cur = continuityVideo.currentTime;
      const dur = continuityVideo.duration || 0;
      const curM = Math.floor(cur / 60);
      const curS = Math.floor(cur % 60).toString().padStart(2, "0");
      const durM = Math.floor(dur / 60);
      const durS = Math.floor(dur % 60).toString().padStart(2, "0");
      videoTimestampDisplay.innerText = `${curM}:${curS} / ${durM}:${durS} • Drag to hand off`;
    });

    continuityVideo.parentElement.addEventListener("click", (e) => {
      if (activeDrag) return;
      if (continuityVideo.paused) {
        continuityVideo.play().catch(() => {});
      } else {
        continuityVideo.pause();
      }
    });
  }

  // 7. Spatial Drag & Pan Gesture Engine
  function calculatePressure(touch, proximity) {
    let rawPressure = 0.5;
    if (touch) {
      if (typeof touch.force === "number" && touch.force > 0) {
        rawPressure = touch.force;
      } else if (typeof touch.radiusX === "number" && touch.radiusX > 0) {
        rawPressure = Math.min(1.0, Math.max(0.2, touch.radiusX / 20));
      }
    }
    // High-responsiveness pressure scaling: scales deep into desktop display
    const depthScale = Math.pow(proximity, 1.2) * 0.5;
    return Math.min(1.0, Math.max(0.3, rawPressure * 0.4 + proximity * 0.5 + depthScale));
  }

  function startDrag(itemType, title, thumbSrc, fileBlobOrUrl, startX, startY) {
    activeDrag = {
      itemType,
      title,
      thumbSrc,
      fileBlobOrUrl,
      currentX: startX,
      currentY: startY,
      normalizedY: startY / window.innerHeight,
      hasLeftEdgeEntered: false
    };

    ghostThumb.src = thumbSrc || "/media/sample_photo1.jpg";
    ghostTitle.innerText = title;
    ghostSub.innerText = itemType === "video" ? "Video Continuity" : "Drag across left bezel";
    dragGhost.style.display = "flex";
    updateGhostPos(startX, startY);

    sendWS({
      type: "drag_start",
      item_type: itemType,
      title: title
    });

    triggerHaptics([25]);
  }

  function updateGhostPos(x, y) {
    dragGhost.style.left = `${x}px`;
    dragGhost.style.top = `${y}px`;
  }

  function onDragMove(clientX, clientY, touch = null) {
    const normY = Math.max(0.01, Math.min(0.99, clientY / window.innerHeight));
    const screenW = window.innerWidth || 390;
    
    // Alive, expansive reach: responds actively as drag travels leftward
    const reachZone = screenW * 0.88;
    const proximity = clientX > reachZone ? 0.0 : Math.max(0.0, Math.min(1.0, (reachZone - clientX) / (reachZone * 0.78)));
    const pressure = calculatePressure(touch, proximity);

    if (activeDrag) {
      activeDrag.currentX = clientX;
      activeDrag.currentY = clientY;
      activeDrag.normalizedY = normY;
      updateGhostPos(clientX, clientY);
    }

    // Update phone's local bezel aura only when proximity > 0.02
    if (proximity > 0.02) {
      leftBezelAura.style.opacity = Math.min(1.0, proximity * 1.5);
      leftBezelAuraGlow.style.top = `${clientY}px`;
      const scale = 0.8 + proximity * 1.1 + pressure * 1.3;
      leftBezelAuraGlow.style.transform = `translateY(-50%) scale(${scale})`;
      leftBezelRim.style.opacity = Math.min(1.0, proximity * 1.3);
    } else {
      leftBezelAura.style.opacity = "0";
      leftBezelRim.style.opacity = "0";
    }

    if (activeDrag && !activeDrag.hasLeftEdgeEntered && proximity > 0.70) {
      activeDrag.hasLeftEdgeEntered = true;
      sendWS({ type: "drag_edge_enter", y: normY });
      triggerHaptics([30]);
    }

    // Stream real-time coordinates
    sendWS({
      type: "drag_move",
      y: normY,
      proximity: proximity,
      pressure: pressure,
      item_type: activeDrag ? activeDrag.itemType : "ambient",
      title: activeDrag ? activeDrag.title : ""
    });
  }

  async function finishDrag(clientX, clientY) {
    if (!activeDrag) {
      leftBezelAura.style.opacity = "0";
      leftBezelRim.style.opacity = "0";
      sendWS({ type: "drag_edge_leave" });
      return;
    }

    const drag = activeDrag;
    activeDrag = null;

    leftBezelAura.style.opacity = "0";
    leftBezelRim.style.opacity = "0";

    const crossedThreshold = clientX <= 45;

    // Immediately clear edge glow on laptop upon finger release / drop
    sendWS({ type: "drag_edge_leave" });

    if (crossedThreshold) {
      triggerHaptics([50, 30, 80]);

      dragGhost.style.transition = "transform 0.25s cubic-bezier(0.1, 0.9, 0.2, 1), opacity 0.25s";
      dragGhost.style.transform = "translate(-220px, -50%) scale(0.9)";
      dragGhost.style.opacity = "0";
      setTimeout(() => {
        dragGhost.style.display = "none";
        dragGhost.style.transition = "none";
        dragGhost.style.opacity = "1";
      }, 260);

      if (drag.itemType === "video") {
        const curTime = continuityVideo ? continuityVideo.currentTime : 0.0;
        if (continuityVideo) continuityVideo.pause();
        sendWS({
          type: "video_resume",
          url: drag.fileBlobOrUrl || "/media/continue.mp4",
          time: curTime,
          title: drag.title,
          y: drag.normalizedY
        });
        showToast(`Video Resumed on Laptop at ${curTime.toFixed(1)}s`);
      } else {
        showToast(`Transferred ${drag.title} to ~/Downloads`);
        try {
          const formData = new FormData();
          formData.append("y", drag.normalizedY.toString());
          formData.append("item_type", drag.itemType);

          if (drag.fileBlobOrUrl instanceof File || drag.fileBlobOrUrl instanceof Blob) {
            formData.append("file", drag.fileBlobOrUrl, drag.title);
          } else {
            const res = await fetch(drag.fileBlobOrUrl);
            const blob = await res.blob();
            formData.append("file", blob, drag.title);
          }

          fetch("/api/upload", {
            method: "POST",
            body: formData
          }).catch(e => console.error(e));
        } catch (err) {
          console.error(err);
        }
      }
    } else {
      sendWS({ type: "drag_edge_leave" });
      dragGhost.style.display = "none";
    }
  }

  // 8. Attach Listeners to Media Items
  function attachDragListeners(element, itemType, getTitle, getThumb, getPayload) {
    let touchStartX = 0;
    let touchStartY = 0;
    let isTracking = false;

    // View button click
    const viewBtn = element.querySelector(".view-pill-btn");
    if (viewBtn) {
      viewBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openLightbox(getTitle(), getThumb(), "Gallery Photo", getPayload());
      });
    }

    element.addEventListener("touchstart", (e) => {
      const touch = e.touches[0];
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
      isTracking = true;
    }, { passive: true });

    element.addEventListener("touchmove", (e) => {
      if (!isTracking) return;
      const touch = e.touches[0];
      const dx = touch.clientX - touchStartX;
      const dy = touch.clientY - touchStartY;

      if (!activeDrag && (Math.abs(dx) > 15 || Math.abs(dy) > 15)) {
        if (dx < 0 || Math.abs(dx) > Math.abs(dy)) {
          e.preventDefault();
          startDrag(
            itemType,
            getTitle(),
            getThumb(),
            getPayload(),
            touch.clientX,
            touch.clientY
          );
        }
      }

      if (activeDrag) {
        e.preventDefault();
        onDragMove(touch.clientX, touch.clientY, touch);
      }
    }, { passive: false });

    element.addEventListener("touchend", (e) => {
      if (activeDrag) {
        const touch = e.changedTouches[0];
        finishDrag(touch.clientX, touch.clientY);
      }
      isTracking = false;
    });

    element.addEventListener("touchcancel", () => {
      if (activeDrag) {
        finishDrag(9999, 9999);
      }
      isTracking = false;
    });

    // Mouse fallback for laptop browser
    let isMouseDown = false;
    element.addEventListener("mousedown", (e) => {
      if (e.target.classList.contains("view-pill-btn")) return;
      isMouseDown = true;
      touchStartX = e.clientX;
      touchStartY = e.clientY;
    });

    window.addEventListener("mousemove", (e) => {
      if (!isMouseDown) return;
      if (!activeDrag) {
        const dx = e.clientX - touchStartX;
        if (dx < -10 || Math.abs(dx) > 15) {
          startDrag(
            itemType,
            getTitle(),
            getThumb(),
            getPayload(),
            e.clientX,
            e.clientY
          );
        }
      }
      if (activeDrag) {
        onDragMove(e.clientX, e.clientY);
      }
    });

    window.addEventListener("mouseup", (e) => {
      if (isMouseDown) {
        isMouseDown = false;
        if (activeDrag) {
          finishDrag(e.clientX, e.clientY);
        }
      }
    });
  }

  document.querySelectorAll(".media-item").forEach(item => {
    attachDragListeners(
      item,
      "photo",
      () => item.getAttribute("data-title") || "Photo.jpg",
      () => item.querySelector("img") ? item.querySelector("img").src : "",
      () => item.getAttribute("data-file") || "/media/sample_photo1.jpg"
    );
  });

  const videoCard = document.getElementById("videoHandoffCard");
  if (videoCard) {
    attachDragListeners(
      videoCard,
      "video",
      () => "Tokyo Night Motion",
      () => "/media/sample_photo3.jpg",
      () => "/media/continue.mp4"
    );
  }

  // 9. Choose Custom File from Phone Camera / Storage
  if (customFileInput) {
    customFileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const card = document.createElement("div");
      card.className = "media-item";
      card.setAttribute("data-item-type", "file");
      card.setAttribute("data-title", file.name);

      let thumbUrl = "/media/sample_photo2.jpg";
      const isImg = file.type.startsWith("image/");
      if (isImg) {
        thumbUrl = URL.createObjectURL(file);
      }

      card.innerHTML = `
        <img class="media-thumb" src="${thumbUrl}" alt="${file.name}">
        <div class="media-info">
          <div class="media-title">${file.name}</div>
          <div class="media-sub">${(file.size / 1024).toFixed(0)} KB • Custom</div>
        </div>
        ${isImg ? `<button class="view-pill-btn" type="button">🔍 View</button>` : ""}
      `;

      mediaGrid.insertBefore(card, customFileInput.parentElement);

      attachDragListeners(
        card,
        isImg ? "photo" : "file",
        () => file.name,
        () => thumbUrl,
        () => file
      );

      showToast(`Added ${file.name} — Drag to Laptop`);
    });
  }

  // 10. Ambient Edge Touch Tracker (Touch & slide directly from left bezel edge)
  let isAmbientBezelTracking = false;
  window.addEventListener("touchstart", (e) => {
    if (activeDrag) return;
    const touch = e.touches[0];
    // Only engage if touch starts right on the left bezel edge (<= 45px)
    if (touch.clientX <= 45) {
      isAmbientBezelTracking = true;
      onDragMove(touch.clientX, touch.clientY, touch);
    }
  }, { passive: true });

  window.addEventListener("touchmove", (e) => {
    if (!isAmbientBezelTracking || activeDrag) return;
    const touch = e.touches[0];
    onDragMove(touch.clientX, touch.clientY, touch);
  }, { passive: true });

  const resetAllDragState = () => {
    if (isAmbientBezelTracking || activeDrag) {
      isAmbientBezelTracking = false;
      leftBezelAura.style.opacity = "0";
      leftBezelRim.style.opacity = "0";
      sendWS({ type: "drag_edge_leave" });
      if (activeDrag) {
        dragGhost.style.display = "none";
        activeDrag = null;
      }
    }
  };

  window.addEventListener("touchend", (e) => {
    if (isAmbientBezelTracking && !activeDrag) {
      isAmbientBezelTracking = false;
      leftBezelAura.style.opacity = "0";
      leftBezelRim.style.opacity = "0";
      sendWS({ type: "drag_edge_leave" });
    }
  });

  window.addEventListener("touchcancel", resetAllDragState);
  window.addEventListener("blur", resetAllDragState);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) resetAllDragState();
  });
});

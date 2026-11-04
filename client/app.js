// drap - Client Engine (Ultra-clean, zero lag)
document.addEventListener("DOMContentLoaded", () => {
  let ws = null;
  let isConnected = false;
  let activeDrag = null;

  const statusPill = document.getElementById("statusPill");
  const leftBezelHalo = document.getElementById("leftBezelHalo");
  const leftBezelRim = document.getElementById("leftBezelRim");
  const dragGhost = document.getElementById("dragGhost");
  const ghostImg = document.getElementById("ghostImg");
  const ghostTitle = document.getElementById("ghostTitle");
  const toast = document.getElementById("toast");

  // 1. WebSocket Connection
  function connectWebSocket() {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${proto}//${window.location.host}/ws`;
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      isConnected = true;
      statusPill.classList.add("connected");
      statusPill.querySelector(".status-text").innerText = "Connected";
    };

    ws.onclose = () => {
      isConnected = false;
      statusPill.classList.remove("connected");
      statusPill.querySelector(".status-text").innerText = "Reconnecting";
      setTimeout(connectWebSocket, 1500);
    };

    ws.onerror = () => ws.close();
  }

  function sendWS(data) {
    if (ws && isConnected && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  connectWebSocket();

  // 2. Feedback Helpers
  function haptic(pattern = [30]) {
    if ("vibrate" in navigator) {
      try { navigator.vibrate(pattern); } catch (e) {}
    }
  }

  function showToast(text) {
    toast.innerText = text;
    toast.classList.add("visible");
    setTimeout(() => toast.classList.remove("visible"), 2500);
  }

  // 3. Touch Gesture Engine
  function calculatePressure(touch, proximity) {
    let rawPressure = 0.5;
    if (touch) {
      if (typeof touch.force === "number" && touch.force > 0) {
        rawPressure = touch.force;
      } else if (typeof touch.radiusX === "number" && touch.radiusX > 0) {
        rawPressure = Math.min(1.0, Math.max(0.2, touch.radiusX / 22));
      }
    }
    return Math.min(1.0, Math.max(0.25, rawPressure * 0.4 + proximity * 0.6));
  }

  function startDrag(itemType, title, thumbSrc, payload, startX, startY) {
    activeDrag = {
      itemType,
      title,
      thumbSrc,
      payload,
      currentX: startX,
      currentY: startY,
      normalizedY: startY / window.innerHeight
    };

    ghostImg.src = thumbSrc || "/media/sample_photo1.jpg";
    ghostTitle.innerText = title;
    dragGhost.style.display = "flex";
    updateGhostPos(startX, startY);

    sendWS({ type: "drag_edge_enter", y: activeDrag.normalizedY });
    haptic([25]);
  }

  function updateGhostPos(x, y) {
    dragGhost.style.left = `${x}px`;
    dragGhost.style.top = `${y}px`;
  }

  function onDragMove(clientX, clientY, touch = null) {
    const screenW = window.innerWidth || 390;
    const normY = Math.max(0.01, Math.min(0.99, clientY / window.innerHeight));
    // Proximity ramps from 0.0 at center/right to 1.0 at left bezel
    const triggerReach = screenW * 0.75;
    const proximity = clientX > triggerReach ? 0.0 : Math.max(0.0, Math.min(1.0, (triggerReach - clientX) / (triggerReach * 0.85)));
    const pressure = calculatePressure(touch, proximity);

    if (activeDrag) {
      activeDrag.currentX = clientX;
      activeDrag.currentY = clientY;
      activeDrag.normalizedY = normY;
      updateGhostPos(clientX, clientY);
    }

    // Phone edge aura
    if (proximity > 0.05) {
      leftBezelHalo.style.opacity = Math.min(1.0, proximity * 1.4);
      leftBezelRim.style.opacity = Math.min(1.0, proximity * 1.5);
    } else {
      leftBezelHalo.style.opacity = "0";
      leftBezelRim.style.opacity = "0";
    }

    // Stream coordinates directly to laptop
    sendWS({
      type: "drag_move",
      y: normY,
      proximity: proximity,
      pressure: pressure,
      item_type: activeDrag ? activeDrag.itemType : "ambient"
    });
  }

  async function finishDrag(clientX, clientY) {
    leftBezelHalo.style.opacity = "0";
    leftBezelRim.style.opacity = "0";

    if (!activeDrag) {
      sendWS({ type: "drag_edge_leave" });
      return;
    }

    const drag = activeDrag;
    activeDrag = null;

    const crossedThreshold = clientX <= 45;
    dragGhost.style.display = "none";

    // Instantly notify laptop to release drag tracking
    sendWS({ type: "drag_edge_leave" });

    if (crossedThreshold) {
      haptic([40, 30, 60]);

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
        showToast(`Video Resumed on Laptop (${curTime.toFixed(1)}s)`);
      } else {
        showToast(`Transferred ${drag.title}`);
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

  // 4. Attach Listeners to Grid Cards
  function setupCard(element, itemType, getTitle, getThumb, getPayload) {
    let startX = 0;
    let startY = 0;
    let isTracking = false;

    element.addEventListener("touchstart", (e) => {
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      isTracking = true;
    }, { passive: true });

    element.addEventListener("touchmove", (e) => {
      if (!isTracking) return;
      const t = e.touches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;

      if (!activeDrag && (Math.abs(dx) > 12 || Math.abs(dy) > 12)) {
        if (dx < 0 || Math.abs(dx) > Math.abs(dy)) {
          e.preventDefault();
          startDrag(itemType, getTitle(), getThumb(), getPayload(), t.clientX, t.clientY);
        }
      }

      if (activeDrag) {
        e.preventDefault();
        onDragMove(t.clientX, t.clientY, t);
      }
    }, { passive: false });

    element.addEventListener("touchend", (e) => {
      if (activeDrag) {
        const t = e.changedTouches[0];
        finishDrag(t.clientX, t.clientY);
      }
      isTracking = false;
    });

    element.addEventListener("touchcancel", () => {
      if (activeDrag) finishDrag(9999, 9999);
      isTracking = false;
    });
  }

  document.querySelectorAll(".card-item").forEach(card => {
    setupCard(
      card,
      card.getAttribute("data-item-type") || "photo",
      () => card.getAttribute("data-title") || "Photo.jpg",
      () => card.querySelector("img") ? card.querySelector("img").src : "",
      () => card.getAttribute("data-file") || "/media/sample_photo1.jpg"
    );
  });

  const videoCard = document.getElementById("videoHandoffCard");
  const videoElem = document.getElementById("continuityVideo");
  const videoTime = document.getElementById("videoTime");

  if (videoCard && videoElem) {
    setupCard(
      videoCard,
      "video",
      () => "Tokyo Motion",
      () => "/media/sample_photo3.jpg",
      () => "/media/continue.mp4"
    );

    videoElem.addEventListener("timeupdate", () => {
      const cur = Math.floor(videoElem.currentTime);
      const dur = Math.floor(videoElem.duration || 0);
      videoTime.innerText = `${Math.floor(cur/60)}:${(cur%60).toString().padStart(2,'0')} / ${Math.floor(dur/60)}:${(dur%60).toString().padStart(2,'0')} • Drag to Laptop`;
    });

    videoCard.querySelector(".video-wrapper").addEventListener("click", () => {
      if (videoElem.paused) {
        videoElem.play().catch(() => {});
        videoCard.classList.add("playing");
      } else {
        videoElem.pause();
        videoCard.classList.remove("playing");
      }
    });
  }

  // 5. Custom File Picker
  const customFileInput = document.getElementById("customFileInput");
  if (customFileInput) {
    customFileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const card = document.createElement("div");
      card.className = "card-item";
      card.setAttribute("data-item-type", "file");
      card.setAttribute("data-title", file.name);

      let thumbUrl = "/media/sample_photo2.jpg";
      if (file.type.startsWith("image/")) {
        thumbUrl = URL.createObjectURL(file);
      }

      card.innerHTML = `
        <div class="card-thumb"><img src="${thumbUrl}" alt="${file.name}"></div>
        <div class="card-meta">
          <span class="title">${file.name}</span>
          <span class="sub">${(file.size / 1024).toFixed(0)} KB • Custom</span>
        </div>
      `;

      const grid = document.getElementById("mediaGrid");
      grid.insertBefore(card, grid.firstChild);

      setupCard(card, "file", () => file.name, () => thumbUrl, () => file);
      showToast(`Added ${file.name} — Drag to Laptop`);
    });
  }

  // 6. Quick Clipboard Sync
  const quickTextInput = document.getElementById("quickTextInput");
  const quickSendBtn = document.getElementById("quickSendBtn");
  if (quickTextInput && quickSendBtn) {
    quickSendBtn.addEventListener("click", () => {
      const text = quickTextInput.value.trim();
      if (!text) return;
      fetch("/api/send_text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, sender: "phone" })
      })
      .then(() => {
        haptic([30]);
        showToast("Copied to Laptop Clipboard! 📋");
        quickTextInput.value = "";
      });
    });
  }

  // 7. Safety Reset Handlers
  window.addEventListener("touchcancel", () => {
    if (activeDrag) finishDrag(9999, 9999);
  });
  window.addEventListener("blur", () => {
    if (activeDrag) finishDrag(9999, 9999);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && activeDrag) finishDrag(9999, 9999);
  });
});

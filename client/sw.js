// drap PWA Service Worker
const CACHE_NAME = "drap-v4";
const ASSETS_TO_CACHE = [
  "/",
  "/index.html",
  "/style.css",
  "/app.js",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Handle native Android/mobile System Share Sheet incoming files
  if (event.request.method === "POST" && url.pathname === "/share-target") {
    event.respondWith(
      (async () => {
        try {
          const formData = await event.request.formData();
          const files = formData.getAll("files");
          const title = formData.get("title") || "";
          const text = formData.get("text") || "";
          const shareUrl = formData.get("url") || "";

          const shareCache = await caches.open("drap-share-cache");
          const meta = {
            title,
            text,
            url: shareUrl,
            fileCount: files.length,
            filesMeta: files.map((f, i) => ({ name: f.name, type: f.type, size: f.size, index: i })),
            timestamp: Date.now()
          };
          await shareCache.put("/shared-meta", new Response(JSON.stringify(meta)));

          for (let i = 0; i < files.length; i++) {
            await shareCache.put(`/shared-file-${i}`, new Response(files[i]));
          }
        } catch (err) {
          console.error("Share target error:", err);
        }
        return Response.redirect("/?shared=true", 303);
      })()
    );
    return;
  }

  if (event.request.url.includes("/api/") || event.request.url.includes("/ws")) {
    return;
  }
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});

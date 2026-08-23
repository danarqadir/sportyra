const CACHE_NAME = "sportyra-v3";
const STATIC_CACHE = "sportyra-static-v3";
const APP_SHELL = ["/", "/manifest.webmanifest", "/favicon.svg", "/football-editorial.png", "/basketball-editorial.png", "/tennis-editorial.png", "/motorsport-editorial.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== STATIC_CACHE)
          .map((key) => caches.delete(key)),
      ),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  if (request.url.includes("/api/")) return;

  const url = new URL(request.url);
  const isSameOrigin = url.origin === self.location.origin;

  if (isSameOrigin && request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() =>
          caches.match(request).then((cached) =>
            cached || new Response(
              `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Sportyra News — Offline</title></head>
<body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f7f2e8;text-align:center;padding:2rem">
<div><h1 style="font-size:2rem;font-weight:800">Sportyra News</h1>
<p style="color:#666;margin-top:1rem">You are currently offline. Please check your internet connection and try again.</p>
<button onclick="location.reload()" style="margin-top:1.5rem;padding:.75rem 2rem;border:1px solid #333;background:transparent;cursor:pointer;font-weight:600">Retry</button></div></body></html>`,
              { headers: { "Content-Type": "text/html" } }
            )
          )
        ),
    );
    return;
  }

  if (isSameOrigin && (url.pathname.endsWith(".js") || url.pathname.endsWith(".css") || url.pathname.endsWith(".png") || url.pathname.endsWith(".svg") || url.pathname.endsWith(".woff2") || url.pathname.endsWith(".webp"))) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const fetched = fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        }).catch(() => cached);
        return cached || fetched;
      }),
    );
    return;
  }

  event.respondWith(fetch(request).catch(() => caches.match(request)));
});

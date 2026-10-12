/* Ronaq El Hayat — offline-friendly cache for slow/unstable mobile networks.
   Pages: always from the network, cached app shell only if the network is down.
   Built assets (hashed names, never change): cache first.
   Catalog (/api/storefront): network first, cache if the network is down.
   Orders, all POST requests and the admin panel always go to the network.
   __VERSION__ and the shell list are filled in by vite.config.ts at build time. */
const VERSION = "__VERSION__";
const SHELL = ["__SHELL__"];

self.addEventListener("message", (e) => {
  if (e.data === "SKIP_WAITING" || e.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  if (sameOrigin && url.pathname.startsWith("/admin")) return;

  if (url.pathname.endsWith("/api/storefront")) {
    e.respondWith(fetch(req).then((res) => { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); return res; }).catch(() => caches.match(req)));
    return;
  }
  if (url.pathname.startsWith("/api/")) return;

  if (req.mode === "navigate" && sameOrigin) {
    e.respondWith(
      // No timeout: on a slow network a timeout served the previous deploy's page. Cache is only for offline.
      fetch(req, { cache: "no-store" }).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put("/", copy));
        }
        return res;
      }).catch(() => caches.match("/").then((hit) => hit || fetch(req)))
    );
    return;
  }

  const cacheable = sameOrigin || url.hostname === "fonts.gstatic.com" || url.hostname === "fonts.googleapis.com" || url.hostname.endsWith(".convex.cloud");
  if (!cacheable) return;
  e.respondWith(caches.open(VERSION).then((c) => c.match(req).then((hit) => {
    if (hit && sameOrigin && url.pathname.startsWith("/assets/")) return hit; // hashed build file
    const net = fetch(req).then((res) => { if (res.ok || res.type === "opaque") c.put(req, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  })));
});

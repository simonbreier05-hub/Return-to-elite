/**
 * StayClean service worker — static-asset caching only.
 *
 * Scope is deliberately narrow: it speeds up repeat loads of the built JS/CSS
 * bundles, icons and manifest so the app shell paints fast on a hotel's slow
 * staff wifi. It must NEVER cache or intercept anything that carries
 * real-time state:
 *   - API routes (/api/**) — room status, handovers, escalations
 *   - the Socket.IO transport (/socket.io/**) — stays online-only, no
 *     offline queueing or replay at this layer (see src/lib/offline for the
 *     app-level action queue that already handles that)
 *   - page navigations — HTML is always fetched fresh from the network so a
 *     supervisor never sees a stale board
 *
 * Everything not explicitly matched below falls straight through to the
 * network, untouched.
 */

const CACHE_VERSION = "stayclean-static-v2";

const PRECACHE_URLS = [
  "/manifest.json",
  "/favicon.ico",
  "/icon.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
  "/brand/wordmark.png",
  "/brand/crest.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

function isRealtimeOrDynamic(url) {
  return (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/socket.io/")
  );
}

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/brand/") ||
    url.pathname === "/manifest.json" ||
    url.pathname === "/favicon.ico" ||
    url.pathname === "/icon.png"
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isRealtimeOrDynamic(url)) return; // let the network/app handle these directly
  if (request.mode === "navigate") return; // page HTML: always fresh
  if (!isStaticAsset(url)) return;

  // Cache-first, since hashed Next.js build assets and the icon files are
  // immutable for a given deploy — a background revalidate keeps the cache
  // from going stale across deploys.
  event.respondWith(
    caches.open(CACHE_VERSION).then(async (cache) => {
      const cached = await cache.match(request);
      const network = fetch(request)
        .then((response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

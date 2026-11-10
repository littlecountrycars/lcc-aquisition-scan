/* Acquisition Scan offline support. Only clears this app's own old caches, so it never wipes another LCC app's cache on the same site.
   Offline support: the app opens without signal on the lot. Network first so updates arrive; cache as fallback. */
const PREFIX = 'lcc-acquisition-scan-';
const CACHE = PREFIX + 'v3';
const SHELL = ['./', 'index.html', 'obd.js', 'app.js', 'manifest.webmanifest', 'icon.svg', 'icon-app.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // monday.com, NHTSA, fonts: straight to network
  e.respondWith(fetch(e.request).then((res) => {
    const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return res;
  }).catch(() => caches.match(e.request).then((r) => r || caches.match('index.html'))));
});

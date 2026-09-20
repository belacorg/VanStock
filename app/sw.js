const CACHE = 'vanstock-v1';
const BASE  = '/VanStock';

// Nothing here is server-side, so a cached copy is a complete working app, not
// a degraded one. Precaching properly matters more than usual: the moment this
// app is most needed is stood in a customer's drive with no signal, deciding
// whether to drive to the merchant.
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll([
      BASE + '/',
      BASE + '/index.html',
      BASE + '/app.js',
      BASE + '/data.cjs',
      BASE + '/style.css',
      BASE + '/fonts.css',
      BASE + '/fonts/DMSans-latin.woff2',
      BASE + '/manifest.json',
      BASE + '/icons/icon-192.png',
      BASE + '/icons/icon-512.png',
      // iOS asks for these at the moment the app is added to the home screen,
      // which is exactly when an engineer is stood in a yard on one bar.
      BASE + '/icons/apple-touch-icon.png',
      BASE + '/icons/favicon-32.png',
    ])).catch(() => {})   // one 404 must not fail the whole install
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network-first so a deploy lands on the next online load; cache is the
// offline fallback. `ignoreSearch` because assets carry a ?v= cache-buster and
// a strict match would miss app.js?v=1 when asked for app.js?v=2.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});

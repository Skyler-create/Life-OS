// LifeOS service worker — network-first (revalidating), cache fallback (offline read-only)
const CACHE = 'lifeos-v2';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.pathname.includes('/functions/') || url.pathname.includes('/rest/') || url.pathname.includes('/auth/') || url.pathname.includes('/realtime/')) return; // never cache API calls
  e.respondWith(
    // cache:'no-cache' forces revalidation with the server (ETag/304), so new
    // deploys show up on the next reload instead of after a 10-min cache window
    fetch(new Request(e.request, {cache: 'no-cache'})).then(r => {
      const clone = r.clone();
      caches.open(CACHE).then(c => c.put(e.request, clone));
      return r;
    }).catch(() => caches.match(e.request))
  );
});

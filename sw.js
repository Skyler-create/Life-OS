// LifeOS service worker — network-first (revalidating), cache fallback (offline read-only)
const CACHE = 'lifeos-v3';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
/* ---- web push ---- */
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: 'LifeOS', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'LifeOS', {
    body: d.body || '',
    tag: d.kind || 'lifeos',           // one notification per kind — newer replaces older
    data: { url: d.url || './' },
    badge: 'icon-192.png',
    icon: 'icon-192.png',
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) if ('focus' in c) return c.focus();
    return clients.openWindow(e.notification.data?.url || './');
  }));
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

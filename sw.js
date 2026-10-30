'use strict';

const CACHE = 'keepsake-v4';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'data/challenges.json', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// network first so updates land right away; the cache keeps the app working offline
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (url.origin !== location.origin && !isFont) return;
  e.respondWith(fetch(req)
    .then(res => {
      if (res.ok || res.type === 'opaque') {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
      }
      return res;
    })
    .catch(() => caches.match(req, { ignoreSearch: true })
      .then(hit => hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
});

/* ---------- reminders ---------- */
// The page writes { notify, time, evening, date, title, earned } to IndexedDB.
// Browsers that support Periodic Background Sync (Chrome on Android, installed)
// wake this worker now and then; it shows the reminder that is due, once a day.
function meta(mode, fn) {
  return new Promise((res, rej) => {
    const r = indexedDB.open('keepsake', 2);
    r.onupgradeneeded = () => {
      const names = r.result.objectStoreNames;
      if (!names.contains('photos')) r.result.createObjectStore('photos');
      if (!names.contains('meta')) r.result.createObjectStore('meta');
    };
    r.onerror = () => rej(r.error);
    r.onsuccess = () => {
      const tx = r.result.transaction('meta', mode);
      const q = fn(tx.objectStore('meta'));
      tx.oncomplete = () => res(q && q.result);
      tx.onerror = () => rej(tx.error);
    };
  });
}
const dayKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const toMinutes = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const NOTE = { icon: 'icons/icon-192.png', badge: 'icons/icon-192.png' };

async function maybeRemind() {
  const m = await meta('readonly', s => s.get('reminder'));
  if (!m || !m.notify || Notification.permission !== 'granted') return;
  const shown = (await meta('readonly', s => s.get('shown'))) || {};
  const now = new Date();
  const key = dayKey(now);
  const mins = now.getHours() * 60 + now.getMinutes();
  const fresh = m.date === key;
  if (fresh && m.earned) return;
  if (mins >= toMinutes(m.time) && shown.morning !== key) {
    await self.registration.showNotification("Today's challenge", {
      ...NOTE, tag: 'keepsake-morning', body: fresh && m.title ? m.title : 'A new challenge is waiting for you.',
    });
    shown.morning = key;
  } else if (m.evening && mins >= toMinutes('20:00') && shown.evening !== key) {
    await self.registration.showNotification('Did you do it?', {
      ...NOTE, tag: 'keepsake-evening', body: fresh && m.title ? `Seal ${m.title} in your Book before midnight.` : "Today's card is still waiting.",
    });
    shown.evening = key;
  }
  await meta('readwrite', s => s.put(shown, 'shown'));
}
self.addEventListener('periodicsync', e => {
  if (e.tag === 'keepsake-reminder') e.waitUntil(maybeRemind());
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) if ('focus' in c) return c.focus();
    return self.clients.openWindow('./');
  }));
});

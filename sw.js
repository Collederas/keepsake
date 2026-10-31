'use strict';

const CACHE = 'keepsake-v17';
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
  // our own files skip the browser's HTTP cache (GitHub Pages keeps them for 10 minutes),
  // so a new version shows up on the next open instead of up to 10 minutes later
  const live = url.origin === location.origin ? fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }) : fetch(req);
  e.respondWith(live
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

// The reminder policy: invitations, never guilt. At most one a day (plus the check-in on a
// day you planned something), only on your pace days, nothing while you're busy, and it backs
// off when you go quiet: every other day after 3 days, one "Busy?" question around day 5,
// then only fresh starts on Mondays and the 1st, and after two of those a last message and silence.
const PACE_DAYS = { daily: [0, 1, 2, 3, 4, 5, 6], few: [1, 3, 6], weekly: [1, 4] };
const weekStart = d => { const x = new Date(d); x.setHours(12, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return dayKey(x); };
const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00') - new Date(a + 'T12:00')) / 864e5);
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

async function maybeRemind() {
  const m = await meta('readonly', s => s.get('reminder'));
  if (!m || !m.notify || Notification.permission !== 'granted') return;
  const shown = (await meta('readonly', s => s.get('shown'))) || {};
  const now = new Date();
  const key = dayKey(now);
  const mins = now.getHours() * 60 + now.getMinutes();
  const daytime = mins >= 8 * 60 && mins <= 21 * 60 + 30;
  const weekly = m.pace === 'weekly';
  // is the challenge the app last saw still the current one?
  const fresh = weekly ? m.periodStart === weekStart(now) : m.date === key;
  const show = (title, body, tag, extra = {}) => self.registration.showNotification(title, { ...NOTE, tag, body, ...extra });
  const save = () => meta('readwrite', s => s.put(shown, 'shown'));

  if (m.busyUntil === 'open' || (m.busyUntil && m.busyUntil >= key)) return;
  if (shown.skip === key || (fresh && (m.earned || m.capped))) return;

  // first morning after a break
  if (m.busyUntil && m.busyUntil < key && shown.backFor !== m.busyUntil) {
    if (daytime && mins >= toMinutes(m.time)) {
      await show('Back to it?', "Here's an easy one to start.", 'keepsake-back');
      shown.backFor = m.busyUntil;
      shown.morning = key;
      await save();
    }
    return;
  }

  // a day with a plan: the reminder comes at the planned time, then a check-in an hour later
  if (fresh && m.plan && m.plan.date === key) {
    if (mins >= toMinutes(m.plan.time) && shown.plan !== key) {
      await show(`It's time: ${m.title}`, m.plan.body, 'keepsake-plan');
      shown.plan = key;
    } else if (mins >= toMinutes(m.plan.time) + 60 && mins <= 21 * 60 + 30 && shown.evening !== key) {
      await show(`Still up for ${m.title}?`, m.why || '', 'keepsake-evening', { actions: [{ action: 'not-today', title: 'Not today' }] });
      shown.evening = key;
    }
    return save();
  }

  const quiet = m.lastOpen ? daysBetween(m.lastOpen, key) : 0;
  // a weekly rhythm is naturally quieter, so it backs off on a slower clock
  const [askAt, freshAt] = weekly ? [14, 21] : [5, 7];
  if (quiet >= freshAt) {
    if (shown.finalFor === m.lastOpen || !daytime || mins < toMinutes(m.time)) return;
    const landmark = now.getDay() === 1 || now.getDate() === 1;
    if (!landmark || shown.freshDay === key) return;
    const count = shown.freshFor === m.lastOpen ? shown.freshCount || 0 : 0;
    if (count && daysBetween(shown.freshDay, key) < 7) return; // fresh starts at least a week apart
    if (count < 2) {
      await show(now.getDate() === 1 ? 'New month.' : 'New week.', 'Want a small one?', 'keepsake-fresh');
      Object.assign(shown, { freshFor: m.lastOpen, freshCount: count + 1, freshDay: key });
    } else {
      await show('Keepsake', "I'll stop reminding you. Your Book's here whenever you want it.", 'keepsake-final');
      shown.finalFor = m.lastOpen;
    }
    return save();
  }
  if (quiet >= askAt) {
    if (shown.askFor !== m.lastOpen && daytime && mins >= toMinutes(m.time)) {
      await show('Busy?', 'I can go quiet for a week.', 'keepsake-ask', {
        actions: [{ action: 'go-quiet', title: 'Go quiet' }, { action: 'keep', title: 'Keep them' }],
      });
      shown.askFor = m.lastOpen;
      await save();
    }
    return;
  }

  if (!(PACE_DAYS[m.pace] || PACE_DAYS.daily).includes(now.getDay())) return;
  if (!weekly && quiet >= 3 && Math.floor(now / 864e5) % 2) return; // every other day once things go quiet
  if (mins >= toMinutes(m.time) && shown.morning !== key) {
    if (weekly && now.getDay() === 4) {
      if (fresh && m.title) await show(`Still up for ${m.title} this week?`, m.why || '', 'keepsake-morning');
    } else {
      const variants = fresh && m.title
        ? (weekly
          ? [`This week: ${m.title}. ${m.why || ''}`.trim(), `This week: ${m.title}.`, `Something for this week: ${m.title}.`]
          : [`Today: ${m.title}. ${m.why || ''}`.trim(), `Today's one: ${m.title}.`, `Something for today: ${m.title}.`])
        : ["There's a new challenge waiting."];
      await show(weekly ? "This week's challenge" : "Today's challenge", variants[Math.floor(now / 864e5) % variants.length], 'keepsake-morning');
    }
    shown.morning = key;
  } else if (!weekly && m.evening && mins >= toMinutes('20:00') && mins <= 21 * 60 + 30 && shown.evening !== key && fresh) {
    await show(`Still up for ${m.title}?`, m.why || '', 'keepsake-evening', { actions: [{ action: 'not-today', title: 'Not today' }] });
    shown.evening = key;
  }
  return save();
}
self.addEventListener('periodicsync', e => {
  if (e.tag === 'keepsake-reminder') e.waitUntil(maybeRemind());
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const key = dayKey(new Date());
  if (e.action === 'not-today') {
    e.waitUntil(meta('readonly', s => s.get('shown')).then(shown => meta('readwrite', s => s.put({ ...(shown || {}), skip: key }, 'shown'))));
    return;
  }
  if (e.action === 'go-quiet') {
    // the app picks this up next time it opens
    e.waitUntil(meta('readwrite', s => s.put({ busyUntil: dayKey(addDays(new Date(), 6)) }, 'inbox'))
      .then(() => meta('readonly', s => s.get('reminder')))
      .then(m => m && meta('readwrite', s => s.put({ ...m, busyUntil: dayKey(addDays(new Date(), 6)) }, 'reminder'))));
    return;
  }
  if (e.action === 'keep') return;
  // tell the app a reminder brought you back, so testers' stats can show whether reminders work
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) if ('focus' in c) { c.postMessage({ src: 'reminder' }); return c.focus(); }
    return self.clients.openWindow('./?src=reminder');
  }));
});

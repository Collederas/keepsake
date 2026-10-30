'use strict';

/* ================= constants ================= */
// index 0 is the neutral "unrevealed" frame used before a card is sealed
const RARITY = [
  { name: 'Unsealed',  color: '#d9cfc2', light: '#f3ede4', dark: '#5e554b' },
  { name: 'Common',    color: '#a7b0bc', light: '#e3e8ee', dark: '#4f5763' },
  { name: 'Uncommon',  color: '#3ecf8e', light: '#b6f5d6', dark: '#13633f' },
  { name: 'Rare',      color: '#4da3ff', light: '#c2e0ff', dark: '#174a85' },
  { name: 'Epic',      color: '#b56cff', light: '#e6ccff', dark: '#4b1d82' },
  { name: 'Legendary', color: '#ffc53d', light: '#fff1b8', dark: '#8a5a00' },
];
const CATS = {
  social:   { label: 'Social' },
  body:     { label: 'Body' },
  creative: { label: 'Creative' },
  explore:  { label: 'Explore' },
  mind:     { label: 'Mind' },
  kindness: { label: 'Kindness' },
};
const COST = { free: 'Free', '$': 'Small spend', '$$': 'Treat yourself' };
const MAX_REROLLS = 2;
const EVENING_TIME = '20:00';
const APP_URL = location.origin + location.pathname;
const SANS = '"Atkinson Hyperlegible Next", "Atkinson Hyperlegible", sans-serif';
const PREFS = {
  pace:   { label: 'How often?', options: [['weekly', 'Once a week'], ['few', 'A few a week'], ['daily', 'Every day']] },
  social: { label: 'Solo or with people?', options: [['solo', 'Mostly solo'], ['any', 'Either'], ['social', 'With people']] },
  budget: { label: 'Budget', options: [['free', 'Free only'], ['some', 'A little'], ['any', "Don't mind"]] },
  time:   { label: 'Time on a normal day', options: [['short', 'Under 30 min'], ['hour', 'About an hour'], ['any', 'Hours, sometimes']] },
};
// Day Zero: the first card, made during setup from something you've always wanted to try.
// It lives outside the deck, so it never gets picked and never counts toward progress.
const DAY_ZERO = { id: 'day-zero', title: 'Day Zero', category: 'zero', courage: 1, minutes: 1, cost: 'free', solo: true, prompt: '', why: '', easier: '' };
const ZERO_LOOK = { name: 'Day Zero', color: '#ff7a45', light: '#ffd2bf', dark: '#7a2c10' };
const isZero = c => c.challengeId === DAY_ZERO.id;
// Day Zero starts as an empty frame holding a wish, and turns into a real card the day you do it
const isWish = c => isZero(c) && c.pending;
// foil: earned by how you did a challenge, and only found out when the card flips
const FINISH = { planned: 'Planned and done', back: 'Back after a break' };
function finishLabels(card) {
  const ch = state.byId.get(card.challengeId) || {};
  const keys = card.finishes || (card.planned ? ['planned'] : []);
  return keys.map(k => k === 'dared' ? `Dared by ${card.daredBy || 'a friend'}`
    : k === 'first' ? `First ${(CATS[ch.category] || { label: '' }).label} card`
    : FINISH[k]).filter(Boolean);
}
const cardTitle = card => (isZero(card) && card.wish) || (state.byId.get(card.challengeId) || { title: 'Lost challenge' }).title;
const isFoil = card => !!(card.finishes && card.finishes.length);
const realCards = () => state.cards.filter(c => !isZero(c));
// what might get in the way: tap an option, get a suggested plan you can edit
const OBSTACLES = [
  ['tired', 'Too tired', "I'm too tired", 'do the easy version'],
  ['time', 'No time', 'I run out of time', 'move it to tomorrow'],
  ['weather', 'Weather', "the weather's bad", 'go anyway with a jacket'],
  ['nerves', 'I chicken out', 'I chicken out', 'do just the first step, then decide'],
  ['forget', 'I forget', 'I forget', 'put it in my calendar'],
  ['other', 'Something else', '', ''],
];
// rhythm: which days reminders may come on (0 = Sunday); weekly gets a Monday nudge and a Thursday check-in
const PACE_DAYS = { daily: [0, 1, 2, 3, 4, 5, 6], few: [1, 3, 6], weekly: [1, 4] };
const FEW_PER_WEEK = 3;
// courage grows by doing: three cards at your current level unlock the next one
const START_COURAGE = 2;
const CARDS_PER_LEVEL = 3;

/* ================= helpers ================= */
const $ = (s, el = document) => el.querySelector(s);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(3, '0');
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const icon = id => `<svg class="ico" aria-hidden="true"><use href="#i-${id}"/></svg>`;
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const vibrate = p => { if (reduceMotion()) return; try { navigator.vibrate && navigator.vibrate(p); } catch (e) { /* unsupported */ } };

function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function fmtDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtMinutes(m) {
  if (m < 60) return `${m} min`;
  if (m >= 1440) return 'A weekend';
  if (m >= 600) return 'All day';
  const h = m / 60;
  return `${Number.isInteger(h) ? h : h.toFixed(1)} h`;
}
// FNV-1a: stable per-day shuffling
function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

const store = {
  get(k, def) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } },
};

/* ================= photo storage (IndexedDB) ================= */
const memPhotos = new Map();
let dbPromise = null;
function db() {
  if (!dbPromise) {
    dbPromise = new Promise((res, rej) => {
      try {
        const r = indexedDB.open('keepsake', 2);
        r.onupgradeneeded = () => {
          const names = r.result.objectStoreNames;
          if (!names.contains('photos')) r.result.createObjectStore('photos');
          if (!names.contains('meta')) r.result.createObjectStore('meta');
        };
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      } catch (e) { rej(e); }
    });
  }
  return dbPromise;
}
async function idbDo(mode, fn, storeName = 'photos') {
  const d = await db();
  return new Promise((res, rej) => {
    const tx = d.transaction(storeName, mode);
    const req = fn(tx.objectStore(storeName));
    tx.oncomplete = () => res(req && req.result);
    tx.onerror = () => rej(tx.error);
  });
}
// returns false when the photo only lives in memory and will be lost on reload
async function putPhoto(key, blob) {
  memPhotos.set(key, blob);
  forgetPhotoUrl(key);
  try { await idbDo('readwrite', s => s.put(blob, key)); return true; } catch (e) { return false; }
}
async function getPhoto(key) {
  if (memPhotos.has(key)) return memPhotos.get(key);
  try { return await idbDo('readonly', s => s.get(key)); } catch (e) { return null; }
}
async function deletePhoto(key) {
  memPhotos.delete(key);
  forgetPhotoUrl(key);
  try { await idbDo('readwrite', s => s.delete(key)); } catch (e) { /* ignore */ }
}
const photoUrls = new Map();
function forgetPhotoUrl(key) {
  if (photoUrls.has(key)) { URL.revokeObjectURL(photoUrls.get(key)); photoUrls.delete(key); }
}
async function photoUrl(card) {
  if (!card.photo) return null;
  if (photoUrls.has(card.id)) return photoUrls.get(card.id);
  const blob = await getPhoto(card.id);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  photoUrls.set(card.id, url);
  return url;
}
function loadImg(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}
async function resizeImage(file, max = 1080) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImg(url);
    const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * s);
    c.height = Math.round(img.naturalHeight * s);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return await new Promise(r => c.toBlob(r, 'image/jpeg', 0.86));
  } finally { URL.revokeObjectURL(url); }
}

/* ================= state ================= */
const state = {
  challenges: [],
  byId: new Map(),
  cards: store.get('ks.cards', []),
  day: store.get('ks.day', null),
  settings: Object.assign({
    sound: true, name: '', onboarded: false, pendingDare: null, seenSecrets: [], plans: [],
    prefs: { pace: 'weekly', social: 'any', budget: 'any', time: 'any' },
    reminder: { time: '09:00', evening: false, notify: false },
    busyUntil: null, lastOpen: null, dayZeroDone: false,
  }, store.get('ks.settings', {})),
  onboardStep: 0,
  incomingDare: null,   // { id, from } from a dare link
  installPrompt: null,
  deckFilter: 'all',
  deckQuery: '',
  pending: null,   // proof sheet in progress
  justLanded: null,
  welcomeBack: null, // 'gap' or 'busy' when coming back after a while
};
const saveCards = () => store.set('ks.cards', state.cards);
const saveDay = () => store.set('ks.day', state.day);
const saveSettings = () => store.set('ks.settings', state.settings);
const earnedIds = () => new Set(state.cards.map(c => c.challengeId));
const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00') - new Date(a + 'T12:00')) / 864e5);
const isBusy = () => { const b = state.settings.busyUntil; return b === 'open' || (!!b && b >= dayKey()); };
// people who set up before rhythms existed keep their daily challenge
const rhythm = () => ({ weekends: 'weekly' })[state.settings.prefs.pace] || state.settings.prefs.pace || 'daily';
const weekly = () => rhythm() === 'weekly';
const paceDay = (date = new Date()) => PACE_DAYS[rhythm()].includes(date.getDay());
function weekStart(date = new Date()) {
  const x = new Date(date);
  x.setHours(12, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return dayKey(x);
}
const periodKey = (date = new Date()) => weekly() ? weekStart(date) : dayKey(date);
const prevPeriodKey = () => weekly() ? weekStart(addDays(new Date(), -7)) : dayKey(addDays(new Date(), -1));
const periodEnd = () => weekly() ? dayKey(addDays(new Date(weekStart() + 'T12:00'), 6)) : dayKey();
const inPeriod = date => date >= dayKey() && date <= periodEnd();
const weekCount = () => realCards().filter(c => weekStart(new Date(c.date)) === weekStart()).length;
const fewCapped = () => rhythm() === 'few' && weekCount() >= FEW_PER_WEEK;
function nextStart() {
  const now = new Date();
  if (weekly() || fewCapped()) return new Date(addDays(new Date(weekStart() + 'T00:00'), 7));
  return addDays(new Date(now.getFullYear(), now.getMonth(), now.getDate()), 1);
}
// the words that change with the rhythm
const W = () => weekly()
  ? { cur: "this week's", Cur: "This week's", now: 'this week', next: 'next week', see: 'See you next week.', one: 'One card a week' }
  : { cur: "today's", Cur: "Today's", now: 'today', next: 'tomorrow', see: 'See you tomorrow.', one: 'One card a day' };
function pickTiny() {
  const d = today();
  const done = earnedIds();
  let pool = state.challenges.filter(c => c.tiny && !done.has(c.id) && !d.shown.includes(c.id));
  if (!pool.length) pool = state.challenges.filter(c => c.tiny);
  pool.sort((a, b) => hash(d.date + a.id) - hash(d.date + b.id));
  return pool[0].id;
}

/* ================= secret challenges ================= */
// Secret challenges stay hidden in the Deck until their unlock condition is met.
function unlockInfo(ch) {
  const u = ch.unlock;
  if (!ch.secret || !u) return { unlocked: true };
  const result = (have, need, task) => ({ unlocked: have >= need, have: Math.min(have, need), need, hint: `${task} to unlock` });
  if (u.after) {
    const done = earnedIds();
    const names = u.after.map(id => `“${(state.byId.get(id) || {}).title}”`).join(' and ');
    return result(u.after.filter(id => done.has(id)).length, u.after.length, `Complete ${names}`);
  }
  if (u.category) {
    const n = state.cards.filter(c => (state.byId.get(c.challengeId) || {}).category === u.category).length;
    return result(n, u.count, `Do ${u.count} ${CATS[u.category].label} challenges`);
  }
  if (u.cards) return result(realCards().length, u.cards, `Collect ${u.cards} cards`);
  if (u.level) return result(courageProgress().cap, u.level, `Reach courage level ${u.level}`);
  if (u.days) return result(new Set(realCards().map(c => dayKey(new Date(c.date)))).size, u.days, `Do challenges on ${u.days} different days`);
  if (u.rarity) return result(realCards().some(c => c.rarity >= u.rarity && c.revealed !== false) ? 1 : 0, 1, `Get a ${RARITY[u.rarity].name} card`);
  if (u.dare) return result(state.cards.some(c => c.daredBy) ? 1 : 0, 1, 'Do a dare from a friend');
  return { unlocked: true };
}
const isUnlocked = ch => unlockInfo(ch).unlocked;
const unlockedSecretIds = () => new Set(state.challenges.filter(c => c.secret && isUnlocked(c)).map(c => c.id));
const newSecrets = () => {
  const done = earnedIds();
  return [...unlockedSecretIds()].filter(id => !done.has(id) && !state.settings.seenSecrets.includes(id));
};
// a locked secret points at what opens it
function unlockLink(ch) {
  const u = ch.unlock || {};
  if (u.after) {
    const next = u.after.find(id => !earnedIds().has(id));
    if (next) return `<div class="actions"><button class="btn" data-open="${next}">Show me “${esc(state.byId.get(next).title)}”</button></div>`;
  }
  if (u.category) return `<div class="actions"><button class="btn" data-act="filter-cat" data-cat="${u.category}">Show ${CATS[u.category].label} challenges</button></div>`;
  return '';
}
function updateDeckBadge() {
  $('.tab[data-screen="deck"]').classList.toggle('has-new', newSecrets().length > 0);
}
const currentId = d => d.custom || d.shown[d.idx];
// going easy is decided upfront and only sticks to the challenge it was chosen for
const isEasy = d => d.easyId === currentId(d);

function today() {
  const key = periodKey();
  const old = state.day;
  if (old && old.idx == null) old.idx = old.shown.length - 1; // older saved shape
  if (!old || old.date !== key) {
    // a challenge finished just after the period ended can still be added to it
    const prev = old && old.date === prevPeriodKey() && !old.earned ? { id: currentId(old), easy: isEasy(old) } : null;
    state.day = { date: key, shown: [], idx: 0, custom: null, earned: null, prev };
    // a break that ran out ends quietly, with an easy start
    const b = state.settings.busyUntil;
    if (b && b !== 'open' && b < dayKey()) { state.settings.busyUntil = null; state.settings.backFrom = dayKey(); saveSettings(); state.welcomeBack = 'busy'; }
    // a dare accepted after today's card was sealed becomes the next day's challenge
    const pd = state.settings.pendingDare;
    if (pd) {
      if (state.byId.has(pd.id) && !earnedIds().has(pd.id)) { state.day.custom = pd.id; state.day.dare = pd; }
      state.settings.pendingDare = null;
      saveSettings();
    }
    const yesterday = dayKey(addDays(new Date(), -1));
    const kept = plans().filter(p => p.date >= yesterday);
    if (kept.length !== plans().length) savePlans(kept);
    const planned = kept.find(p => inPeriod(p.date) && state.byId.has(p.id) && !earnedIds().has(p.id));
    if (planned && !state.day.custom) state.day.custom = planned.id;
    state.day.shown.push(nextPick());
    saveDay();
  }
  return state.day;
}
function courageProgress() {
  let cap = START_COURAGE, count = 0;
  for (const c of [...state.cards].sort((a, b) => a.no - b.no)) {
    const ch = state.byId.get(c.challengeId);
    if (!ch || c.easier || cap >= 5 || ch.courage < cap) continue;
    if (++count >= CARDS_PER_LEVEL) { cap++; count = 0; }
  }
  return { cap, count, need: CARDS_PER_LEVEL };
}
function fitsPrefs(c) {
  const p = state.settings.prefs;
  if (p.social === 'solo' && !c.solo) return false;
  if (p.budget === 'free' && c.cost !== 'free') return false;
  if (p.budget === 'some' && c.cost === '$$') return false;
  if (p.time === 'short' && c.minutes > 30) return false;
  if (p.time === 'hour' && c.minutes > 90) return false;
  return true;
}
function nextPick() {
  const d = state.day;
  const done = earnedIds();
  const skip = id => d.shown.includes(id) || (d.prev && d.prev.id === id) || plans().some(p => p.id === id && !inPeriod(p.date));
  const { cap } = courageProgress();
  const fresh = state.challenges.filter(c => !done.has(c.id) && !skip(c.id) && isUnlocked(c));
  // the first pool that still has something in it: fits your life and sits at the edge of your courage
  const tiers = [
    c => fitsPrefs(c) && c.courage === cap,
    c => fitsPrefs(c) && c.courage <= cap && c.courage >= cap - 1,
    c => fitsPrefs(c) && c.courage <= cap,
    c => c.courage <= cap,
    () => true,
  ];
  // the very first challenges come from a handpicked set of strong starters
  if (!realCards().length) tiers.unshift(c => c.starter && fitsPrefs(c) && c.courage <= cap);
  let pool = [];
  for (const t of tiers) { pool = fresh.filter(t); if (pool.length) break; }
  if (!pool.length) pool = state.challenges.filter(c => !skip(c.id) && isUnlocked(c));
  if (!pool.length) pool = state.challenges.filter(c => !c.secret);
  // variety: never the same kind of thing as a swap you just passed on or your last few cards,
  // and preferably not the same category twice in a row
  const recent = [...realCards()].sort((a, b) => b.no - a.no).slice(0, 4).map(c => state.byId.get(c.challengeId));
  const passed = [...d.shown, d.prev && d.prev.id].map(id => state.byId.get(id));
  const near = [...passed, ...recent].filter(Boolean);
  const themes = new Set(near.map(c => c.theme));
  const cats = new Set([...passed, recent[0]].filter(Boolean).map(c => c.category));
  const score = c => (themes.has(c.theme) ? 2 : 0) + (cats.has(c.category) ? 1 : 0);
  pool.sort((a, b) => score(a) - score(b) || hash(d.date + a.id) - hash(d.date + b.id));
  return pool[0].id;
}
function currentChallenge() {
  return state.byId.get(currentId(today())) || state.challenges[0];
}

/* ================= rendering: challenge ================= */
function questHTML(ch, { today: onToday = false, easy = false } = {}) {
  const courage = ch.courage;
  const goEasy = ch.tiny ? '' : `<details class="easier"><summary>Not feeling it? Try the easier version</summary><p>${esc(ch.easier)}</p>`;
  const pips = [1, 2, 3, 4, 5].map(i => `<i class="${i <= courage ? 'on' : ''}"></i>`).join('');
  const easier = ch.tiny ? ''
    : !onToday ? `${goEasy}</details>`
    : easy ? `<div class="easier"><button class="link" data-act="easy-off">Switch back to the full challenge</button></div>`
    : `${goEasy}<button class="btn" data-act="easy-on">Go easy this time</button></details>`;
  return `
  <article class="quest${easy ? ' is-easy' : ''}">
    <div class="quest-head">
      <span>${CATS[ch.category].label}${easy ? ' · <b class="easy-tag">Easy version</b>' : ''}</span>
      <span class="courage" role="img" aria-label="Courage ${courage} of 5">Courage ${pips}</span>
    </div>
    <h2>${esc(ch.title)}</h2>
    <p class="prompt">${esc(easy ? ch.easier : ch.prompt)}</p>
    <p class="why">${esc(ch.why)}</p>
    <p class="meta">${easy ? 'Shorter' : fmtMinutes(ch.minutes)} · ${COST[ch.cost]} · ${ch.solo ? 'Solo' : 'Bring someone'}</p>
    ${ch.safety ? `<div class="safety">${esc(ch.safety)}</div>` : ''}
    ${easier}
  </article>`;
}

function todayActions(ch) {
  const d = today();
  const left = MAX_REROLLS - (d.shown.length - 1);
  let secondary;
  if (d.custom) {
    secondary = `<button class="btn ghost" data-act="clear-custom">${icon('prev')} Back to ${W().cur} pick</button>`;
  } else {
    const prev = d.idx > 0 ? `<button class="btn ghost" data-act="prev-pick">${icon('prev')} Previous</button>` : '';
    const label = d.idx < d.shown.length - 1 ? 'Next' : left > 0 ? `Swap · ${left} left` : 'No swaps left';
    const aria = d.idx < d.shown.length - 1 ? 'Next' : left > 0 ? `Swap, ${left} left` : 'No swaps left';
    const disabled = d.idx >= d.shown.length - 1 && left <= 0;
    secondary = `${prev}<button class="btn ghost" data-act="reroll" aria-label="${aria}" ${disabled ? 'disabled' : ''}>${icon('swap')} ${label}</button>`;
  }
  const plan = todayPlan() || ch.tiny ? '' : `<button class="btn ghost" data-act="plan" data-id="${ch.id}">${icon('calendar')} Plan it</button>`;
  return `
  <div class="actions">
    <button class="btn primary big" data-act="done" data-id="${ch.id}">I did it</button>
    <div class="actions-row">${plan}${secondary}</div>
  </div>`;
}

/* ================= rendering: keepsake card ================= */
function cardHTML(card, url, cls = '', tag = 'div') {
  const ch = state.byId.get(card.challengeId) || { title: 'Lost challenge', category: 'mind' };
  const r = /\br0\b/.test(cls) ? 0 : card.rarity;
  const initial = (card.story || cardTitle(card)).trim().charAt(0).toUpperCase();
  const photo = url
    ? `<div class="kf-photo" style="background-image:url('${url}')"></div>`
    : `<div class="kf-photo empty"><span>${esc(initial)}</span></div>`;
  const story = card.story
    ? `<span class="kf-story">“${esc(card.story)}”</span>`
    : card.preview ? '<span class="kf-story placeholder">Your words go here</span>' : '';
  const zero = isZero(card);
  const topLabel = zero ? 'DAY ZERO' : `${ch.secret ? 'SECRET · ' : ''}${CATS[ch.category].label.toUpperCase()}`;
  const footLeft = zero ? 'Where it starts' : r ? `${'★'.repeat(r)}<span class="rn"> ${RARITY[r].name}</span>${isFoil(card) ? '<span class="kf-foil">FOIL</span>' : ''}` : '';
  const marks = [card.easier ? '<span>Easy version</span>' : '', ...finishLabels(card).map(l => `<span class="fin">${esc(l)}</span>`)].filter(Boolean);
  return `
  <${tag} class="kcard r${r}${zero && r ? ' kzero' : ''}${isFoil(card) && r ? ' foil' : ''} ${cls}" data-card="${card.id || ''}">
    <span class="kcard-inner">
      <span class="kcard-face kcard-back"><span class="sigil">${icon('seal')}<small>KEEPSAKE</small></span></span>
      <span class="kcard-face kcard-front">
        <span class="kf">
          <span class="kf-top"><span>${topLabel}</span><span class="kf-no">${card.no || zero ? '#' + pad(card.no) : ''}</span></span>
          ${photo}
          <span class="seal">${icon('seal')}</span>
          <span class="kf-body">
            <span class="kf-title">${esc(cardTitle(card))}</span>
            ${story}
            ${marks.length ? `<span class="kf-planned">${marks.join('<i> · </i>')}</span>` : ''}
          </span>
          <span class="kf-foot">
            <span class="kf-rarity">${footLeft}</span>
            <span class="kf-date">${fmtDate(card.date)}${card.place ? ' · ' + esc(card.place) : ''}</span>
          </span>
        </span>
        <span class="holo"></span>
      </span>
    </span>
  </${tag}>`;
}
function cardLabel(card) {
  const ch = state.byId.get(card.challengeId);
  const foil = isFoil(card) ? `, foil: ${finishLabels(card).join(', ')}` : '';
  return isZero(card) ? `Day Zero: ${card.wish || card.story}` : `Card ${card.no}: ${ch ? ch.title : ''}, ${RARITY[card.rarity].name}${foil}, ${fmtDate(card.date)}`;
}
// the empty frame Day Zero waits in until you go and do it
function wishHTML(card) {
  return `
  <span class="kcard wish mid">
    <span class="wish-frame">
      <span class="kf-top"><span>DAY ZERO</span><span class="kf-no">#000</span></span>
      <span class="wish-text">${esc(card.wish)}</span>
      <span class="wish-foot">Not yet. Do it, then fill it in.</span>
    </span>
  </span>`;
}

function attachTilt(el) {
  if (reduceMotion()) return;
  const inner = $('.kcard-inner', el);
  el.classList.add('tilt');
  const set = (px, py) => {
    inner.style.transform = `rotateY(${(px - 0.5) * 26}deg) rotateX(${(0.5 - py) * 26}deg)`;
    el.style.setProperty('--mx', `${px * 100}%`);
    el.style.setProperty('--my', `${py * 100}%`);
    el.style.setProperty('--ang', `${100 + px * 60}deg`);
  };
  el.addEventListener('pointermove', e => {
    const b = el.getBoundingClientRect();
    set(Math.min(1, Math.max(0, (e.clientX - b.left) / b.width)), Math.min(1, Math.max(0, (e.clientY - b.top) / b.height)));
  });
  el.addEventListener('pointerleave', () => { inner.style.transform = ''; });
  const onOrient = e => {
    if (!el.isConnected) { window.removeEventListener('deviceorientation', onOrient); return; }
    if (e.gamma == null) return;
    set(Math.min(1, Math.max(0, 0.5 + e.gamma / 60)), Math.min(1, Math.max(0, 0.5 + (e.beta - 45) / 60)));
  };
  window.addEventListener('deviceorientation', onOrient);
}

/* ================= screens ================= */
function renderToday() {
  const d = today();
  const el = $('#screen-today');
  const header = `
    <header class="topbar">
      <h1 class="logo">Keep<b>sake</b></h1>
      <span class="topbar-right">
        <span class="topbar-meta">${weekly()
          ? `Week of ${new Date(weekStart() + 'T12:00').toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}`
          : new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</span>
        <button class="icon-btn" data-act="settings" aria-label="Settings">${icon('gear')}</button>
      </span>
    </header>`;
  if (!state.settings.onboarded) {
    el.innerHTML = header + onboardingHTML();
    return;
  }
  const dare = state.incomingDare && state.byId.get(state.incomingDare.id);
  const dareNote = dare ? `
    <aside class="notice dare">
      <div><strong>${esc(state.incomingDare.from || 'A friend')} dared you: ${esc(dare.title)}</strong>
        <span class="notice-sub">${esc(dare.prompt)}</span>
        <button class="btn primary" data-act="take-dare">Take the dare</button>
      </div>
      <button class="icon-btn" data-act="dismiss-dare" aria-label="Not now">${icon('close')}</button>
    </aside>` : '';
  const prevCh = d.prev && state.byId.get(d.prev.id);
  const prevNote = prevCh ? `
    <aside class="notice">
      <div>Did ${weekly() ? "last week's" : "yesterday's"} <strong>${esc(prevCh.title)}</strong> ${weekly() ? 'late on Sunday' : 'after midnight'}?<br>
        <button class="btn" data-act="claim-prev">Add it to ${weekly() ? 'last week' : 'yesterday'}</button>
      </div>
      <button class="icon-btn" data-act="dismiss-prev" aria-label="Dismiss">${icon('close')}</button>
    </aside>` : '';

  if (state.welcomeBack === 'busy' && !d.earned && !d.busyPeek) {
    d.custom = pickTiny();
    d.busyPeek = true;
    saveDay();
  }
  const welcome = state.welcomeBack && !isBusy() ? `
    <aside class="notice welcome">
      <div><strong>Good to see you.</strong>
        ${state.welcomeBack === 'busy' ? '<span class="notice-sub">Here\'s an easy one to start.</span>' : '<span class="notice-sub">Want to start with something small?</span>'}
        <span class="notice-actions">
          ${state.welcomeBack === 'busy' ? '' : '<button class="btn primary" data-act="start-small">Start small</button>'}
          <button class="btn" data-act="${state.welcomeBack === 'busy' ? 'back-to-main' : 'dismiss-welcome'}">Show me ${W().cur} challenge</button>
        </span>
      </div>
    </aside>` : '';
  const zeroNote = !state.settings.dayZeroDone && !isBusy() ? dayZeroHTML(true) : '';

  if (isBusy() && !d.earned && !d.busyPeek) {
    el.innerHTML = `${header}
      <section class="busy">
        <h2>Taking a breather.</h2>
        <p>Your Book's right here when you're ready.</p>
        <div class="actions">
          <button class="btn" data-act="busy-peek">Got two minutes?</button>
          <button class="link" data-act="busy-end">I'm back</button>
        </div>
        <p class="hint">No reminders ${busyUntilText()}.</p>
      </section>`;
    syncReminder();
    return;
  }

  if (isBusy() && !d.earned && d.busyPeek) {
    const tiny = currentChallenge();
    el.innerHTML = `${header}
      <p class="breather-tag">Taking a breather. This one's tiny.</p>
      ${questHTML(tiny)}
      <div class="actions">
        <button class="btn primary big" data-act="done" data-id="${tiny.id}">I did it</button>
        <button class="btn ghost" data-act="busy-unpeek">Not now</button>
      </div>`;
    syncReminder();
    return;
  }

  const earned = d.earned && state.cards.find(c => c.id === d.earned);
  if (!earned && fewCapped()) {
    el.innerHTML = `${header}${dareNote}
      <div class="done-today">
        <h2>That's three this week.</h2>
        <p>Next challenge <span class="countdown" id="countdown"></span>.</p>
        <button class="btn" data-goto="book">See them in your Book</button>
      </div>${upcomingHTML()}`;
    tickCountdown();
    syncReminder();
    return;
  }
  if (earned) {
    el.innerHTML = `${header}${dareNote}${prevNote}
      <div class="done-today">
        <div class="mini-slot"></div>
        ${isBusy() ? `<h2>Nice one. Now rest.</h2>
        <p>You're taking a breather ${busyUntilText()}.</p>
        <button class="btn" data-goto="book">See it in your Book</button>` : `<h2>${fewCapped() ? "That's three this week." : W().see}</h2>
        <p>Next challenge <span class="countdown" id="countdown"></span>.</p>
        <button class="btn" data-goto="deck">Peek at the deck</button>`}
      </div>${upcomingHTML()}`;
    fillTodayCard(el, earned);
    if (!isBusy()) tickCountdown();
  } else {
    const ch = currentChallenge();
    const daredBy = d.dare && d.dare.id === ch.id ? `<p class="dared-by">Dared by ${esc(d.dare.from || 'a friend')}</p>` : '';
    el.innerHTML = `${header}${welcome}${zeroNote}${dareNote}${prevNote}${courageHTML()}${daredBy}${planBlockHTML(ch)}${questHTML(ch, { today: true, easy: isEasy(d) })}${todayActions(ch)}${upcomingHTML()}`;
  }
  syncReminder();
}
function courageText() {
  const { cap, count, need } = courageProgress();
  const n = ['No', 'One', 'Two', 'Three'][need - count] || String(need - count);
  return cap >= 5 ? "Courage 5. Everything's open." : `Courage ${cap}. ${n} more like this and bolder ones open up.`;
}
function courageHTML() {
  if (!realCards().length) return '';
  const { cap, count, need } = courageProgress();
  return `<div class="level"><span>${courageText()} <button class="link" data-act="help">How this works</button></span><span class="bar" aria-hidden="true"><i style="width:${cap >= 5 ? 100 : (count / need) * 100}%"></i></span></div>`;
}

/* ================= onboarding + settings ================= */
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

function onboardingHTML() {
  const step = state.onboardStep;
  if (step === 0) return `
    <section class="onboard">
      <h2>Real-life challenges, at your pace.</h2>
      <ul class="how">
        <li>Go do a challenge, out in the real world.</li>
        <li>Come back and add a photo or a line.</li>
        <li>It turns into a card in your Book.</li>
      </ul>
      <p>A few quick questions so the first ones actually fit your life. You'll start easy and work up to the scary stuff.</p>
      <div class="actions">
        <button class="btn primary big" data-act="onboard-next">Let's go</button>
        <button class="btn ghost" data-act="onboard-done">Skip</button>
      </div>
    </section>`;
  if (step === 3) return dayZeroHTML();
  if (step === 1) return `
    <section class="onboard">
      <h2>What fits your days?</h2>
      ${prefsHTML()}
      <div class="actions"><button class="btn primary big" data-act="onboard-next">Next</button></div>
    </section>`;
  return `
    <section class="onboard">
      <h2>Want a nudge?</h2>
      <p>A reminder when there's a new challenge, and a check-in if you haven't completed it yet. Never more than that, and it backs off when you're busy.</p>
      <div id="reminder-box">${reminderHTML()}</div>
      ${installHTML()}
      <div class="actions"><button class="btn primary big" data-act="onboard-next">Next</button></div>
    </section>`;
}
// Day Zero: a tiny real commitment instead of a promise to an app
function dayZeroHTML(inline = false) {
  if (inline && !state.zeroOpen) return `
    <aside class="notice zero compact">
      <div><strong>Day Zero.</strong> What's one thing you've always wanted to try?
        <button class="link" data-act="zero-open">Add it</button></div>
      <button class="icon-btn" data-act="zero-skip" aria-label="Not now">${icon('close')}</button>
    </aside>`;
  return `
    <${inline ? 'aside class="notice zero"' : 'section class="onboard"'}>
      ${inline ? '' : '<h2>Day Zero</h2>'}
      <div>
        <p>${inline ? '<strong>One quick thing.</strong> ' : ''}This only works if you actually go out and do things. Here's the first one.</p>
        <label class="field"><span class="field-label">What's one thing you've always wanted to try?</span>
          <input id="zero-input" maxlength="80" placeholder="e.g. Sing in front of people" autocomplete="off"></label>
        <div class="actions">
          <button class="btn primary big" id="zero-btn" data-act="zero-make" disabled>Make it my first card</button>
          <button class="btn ghost" data-act="${inline ? 'zero-skip' : 'onboard-done'}">Skip</button>
        </div>
      </div>
    </${inline ? 'aside' : 'section'}>`;
}
function makeDayZero() {
  const text = ($('#zero-input').value || '').trim().slice(0, 80);
  if (!text) return;
  const card = { id: uid(), no: 0, challengeId: DAY_ZERO.id, rarity: 1, easier: false, wish: text, story: '', place: '', date: new Date().toISOString(), photo: false, pending: true };
  state.cards = state.cards.filter(c => !isZero(c));
  state.cards.push(card);
  saveCards();
  state.settings.dayZeroDone = true;
  saveSettings();
  state.zeroOpen = false;
  if (!state.settings.onboarded) finishOnboarding(); else renderToday();
  toast("It's card #000 in your Book. Fill it in once you've done it.");
}
function prefsHTML() {
  return Object.entries(PREFS).map(([k, p]) => `
    <fieldset class="seg"><legend>${p.label}</legend>
      <div>${p.options.map(([v, l]) => `<label><input type="radio" name="pref-${k}" value="${v}" data-pref="${k}" ${state.settings.prefs[k] === v ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>
    </fieldset>`).join('');
}
function reminderHTML() {
  const r = state.settings.reminder;
  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  const iosNeedsInstall = isIOS() && !isStandalone();
  let notify;
  if (iosNeedsInstall) notify = '<p class="hint">On iPhone, notifications only work once Keepsake is on your Home Screen (tap Share, then Add to Home Screen). The calendar works right away.</p>';
  else if (perm === 'unsupported') notify = '<p class="hint">This browser can\'t do notifications. The calendar works everywhere.</p>';
  else if (perm === 'denied') notify = '<p class="hint">Notifications are blocked for this site. Turn them on in your browser settings, or use the calendar.</p>';
  else if (r.notify && perm === 'granted') notify = `<p class="ok">Notifications are on. <button class="link" data-act="notify-test">Send a test</button> · <button class="link" data-act="notify-off">Turn off</button></p>`;
  else notify = `<button class="btn" data-act="notify-on">${icon('bell')} Turn on notifications</button>`;
  return `
    <label class="field inline"><span class="field-label">Reminder time</span><input type="time" id="reminder-time" value="${r.time}"></label>
    ${weekly()
      ? '<p class="hint">On a weekly rhythm you get a nudge on Monday and a check-in on Thursday, only if you haven\'t done it yet.</p>'
      : `<label class="check"><input type="checkbox" id="reminder-evening" ${r.evening ? 'checked' : ''}><span>Evening check-in at 8pm<small>Only if you haven't done the challenge yet.</small></span></label>`}
    <div class="reminder-ways">
      ${notify}
      <button class="btn" data-act="calendar">${icon('calendar')} Add to my calendar</button>
    </div>
    <p class="hint">Heads up: phones sometimes delay notifications from web apps. Calendar reminders are always on time, but they can't back off when you're busy.</p>`;
}
function installHTML() {
  if (isStandalone()) return '';
  if (state.installPrompt) return `<div class="install"><button class="btn" data-act="install">${icon('share')} Install Keepsake</button></div>`;
  if (isIOS()) return '<p class="hint install">To install: tap Share in Safari, then Add to Home Screen.</p>';
  return '';
}
function settingsHTML() {
  return `
    <h2 class="proof-title">Settings</h2>
    <h3 class="sub first">Busy?</h3>
    ${busySettingsHTML()}
    <h3 class="sub">You</h3>
    <label class="field"><span class="field-label">Your first name <span class="opt">So friends know who dared them</span></span>
      <input id="set-name" maxlength="24" value="${esc(state.settings.name)}" autocomplete="given-name"></label>
    <h3 class="sub">Challenges</h3>
    <button class="link" data-act="help">How courage, colours and foil work</button>
    ${prefsHTML()}
    <p class="hint">Kicks in from your next challenge.</p>
    <h3 class="sub">Reminders</h3>
    <div id="reminder-box">${reminderHTML()}</div>
    ${installHTML() ? `<h3 class="sub">App</h3>${installHTML()}` : ''}`;
}
function busyUntilText() {
  const b = state.settings.busyUntil;
  return b === 'open' ? 'until you say you\'re back' : `until ${new Date(b + 'T12:00').toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}`;
}
function busySettingsHTML() {
  if (isBusy()) return `<p class="ok">You're taking a break ${busyUntilText()}. <button class="link" data-act="busy-end">I'm back</button></p>`;
  return `
    <div class="busy-opts">
      <button class="btn" data-act="busy-set" data-len="7">1 week</button>
      <button class="btn" data-act="busy-set" data-len="14">2 weeks</button>
      <button class="btn" data-act="busy-set" data-len="open">Until I'm back</button>
    </div>
    <p class="hint">Pauses all reminders. Nothing piles up while you're away.</p>`;
}
function refreshReminderUI() {
  const box = $('#reminder-box');
  if (box) box.innerHTML = reminderHTML();
}
function finishOnboarding() {
  state.settings.onboarded = true;
  saveSettings();
  // re-pick today's challenge with the answers, unless the user already chose one
  const d = today();
  if (!d.earned && !d.custom) { d.shown = []; d.idx = 0; d.shown.push(nextPick()); saveDay(); }
  renderToday();
  window.scrollTo(0, 0);
}

/* ================= reminders ================= */
async function swReg() {
  if (!('serviceWorker' in navigator)) return null;
  return Promise.race([navigator.serviceWorker.ready, sleep(3000).then(() => null)]);
}
async function showNote(title, body, tag) {
  const opts = { body, tag, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png' };
  const reg = await swReg();
  if (reg) return reg.showNotification(title, opts);
  try { new Notification(title, opts); } catch (e) { /* not allowed outside a worker */ }
}
async function notifyOn() {
  if (!('Notification' in window)) return;
  const perm = await Notification.requestPermission();
  if (perm === 'granted') {
    state.settings.reminder.notify = true;
    saveSettings();
    const reg = await swReg();
    if (reg && 'periodicSync' in reg) {
      try { await reg.periodicSync.register('keepsake-reminder', { minInterval: 60 * 60 * 1000 }); } catch (e) { /* not installed, or not allowed */ }
    }
    syncReminder();
    toast('Notifications on');
  } else {
    toast("No notifications then. The calendar works too.");
  }
  refreshReminderUI();
}
let reminderTimers = [];
// Writes what the service worker needs, and schedules reminders while the app stays open.
function syncReminder() {
  const d = state.day;
  if (!d) return;
  const ch = state.byId.get(currentId(d));
  const r = state.settings.reminder;
  const pp = todayPlan();
  const tp = pp && pp.date === dayKey() ? pp : null;
  const planBody = tp ? [tp.where ? `At ${tp.where}.` : '', ifLine(tp)].filter(Boolean).join(' ') || 'This is the time you picked.' : '';
  const meta = { notify: r.notify, time: r.time, evening: r.evening, date: d.date, title: ch ? ch.title : '', why: ch ? ch.why : '', earned: !!d.earned,
    plan: pp ? { date: pp.date, time: pp.time, body: [pp.where ? `At ${pp.where}.` : '', ifLine(pp)].filter(Boolean).join(' ') || 'This is the time you picked.' } : null,
    capped: fewCapped(),
    pace: rhythm(), periodStart: d.date, busyUntil: state.settings.busyUntil, lastOpen: dayKey() };
  idbDo('readwrite', s => s.put(meta, 'reminder'), 'meta').catch(() => {});
  reminderTimers.forEach(clearTimeout);
  reminderTimers = [];
  if (!r.notify || !('Notification' in window) || Notification.permission !== 'granted' || !ch || isBusy()) return;
  const until = hhmm => { const [h, m] = hhmm.split(':').map(Number); const t = new Date(); t.setHours(h, m, 0, 0); return t - Date.now(); };
  const morning = until(r.time);
  const thursday = weekly() && new Date().getDay() === 4;
  if (morning > 0 && !d.earned && !tp && paceDay() && !fewCapped()) {
    reminderTimers.push(setTimeout(() => thursday
      ? showNote(`Still up for ${ch.title} this week?`, 'No rush. Next week is fine too.', 'keepsake-morning')
      : showNote(`${W().Cur} challenge`, ch.title, 'keepsake-morning'), morning));
  }
  const planned = tp ? until(tp.time) : -1;
  if (planned > 0 && !d.earned) {
    reminderTimers.push(setTimeout(() => showNote(`It's time: ${ch.title}`, planBody, 'keepsake-plan'), planned));
  }
  // the evening check-in waits until an hour after a planned time
  const evening = tp ? Math.max(until(EVENING_TIME), planned + 60 * 60 * 1000) : until(EVENING_TIME);
  // the evening check-in is opt-in, except on days you planned something
  if (((r.evening && !weekly()) || tp) && evening > 0 && evening <= until('21:30')) {
    reminderTimers.push(setTimeout(() => { if (!today().earned) showNote(`Still up for ${ch.title}?`, "Tomorrow's fine too.", 'keepsake-evening'); }, evening));
  }
}
function calendarFile() {
  const r = state.settings.reminder;
  const p2 = n => String(n).padStart(2, '0');
  const t = new Date();
  const ymd = `${t.getFullYear()}${p2(t.getMonth() + 1)}${p2(t.getDate())}`;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const rule = { daily: 'RRULE:FREQ=DAILY', few: 'RRULE:FREQ=WEEKLY;BYDAY=MO,WE,SA', weekly: 'RRULE:FREQ=WEEKLY;BYDAY=MO' }[rhythm()];
  const firstOn = rrule => {
    const days = (rrule.match(/BYDAY=([A-Z,]+)/) || [])[1];
    if (!days) return ymd;
    const want = days.split(',').map(x => ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'].indexOf(x));
    for (let i = 0; i < 7; i++) { const x = addDays(t, i); if (want.includes(x.getDay())) return dayKey(x).replace(/-/g, ''); }
    return ymd;
  };
  const event = (id, time, summary, desc, rrule = rule) => [
    'BEGIN:VEVENT', `UID:keepsake-${id}-${ymd}@keepsake`, `DTSTAMP:${stamp}`,
    `DTSTART:${firstOn(rrule)}T${time.replace(':', '')}00`, 'DURATION:PT5M', rrule,
    `SUMMARY:${summary}`, `DESCRIPTION:${desc} ${APP_URL}`, `URL:${APP_URL}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:PT0M', `DESCRIPTION:${summary}`, 'END:VALARM', 'END:VEVENT',
  ];
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Keepsake//Reminders//EN', 'CALSCALE:GREGORIAN',
    ...event('morning', r.time, `${W().Cur} Keepsake challenge`, `Open Keepsake to see ${W().cur} challenge:`),
    ...(weekly()
      ? event('thursday', r.time, 'Keepsake: still up for it this week?', "No rush. Here's this week's challenge:", 'RRULE:FREQ=WEEKLY;BYDAY=TH')
      : r.evening ? event('evening', EVENING_TIME, 'Keepsake: still up for it?', "Tomorrow's fine too. Here's the challenge:") : []),
    'END:VCALENDAR',
  ];
  download(new Blob([lines.join('\r\n')], { type: 'text/calendar' }), 'keepsake-reminders.ics');
  toast('Open the file to add it to your calendar');
}

/* ================= plans: when and where ================= */
// Deciding in advance when and where you'll do something ("implementation intentions")
// makes follow-through far more likely. Plans live in settings.plans as { id, date, time, where }.
const plans = () => state.settings.plans || (state.settings.plans = []);
const planFor = (id, date) => plans().find(p => p.id === id && (!date || p.date === date));
const todayPlan = () => { const d = today(); return plans().find(p => inPeriod(p.date) && p.id === currentId(d)); };
const upcomingPlans = () => plans().filter(p => p.date > dayKey()).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
function savePlans(list) { state.settings.plans = list; saveSettings(); }

function fmtTime(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const t = new Date(); t.setHours(h, m, 0, 0);
  return t.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
function dayPhrase(date, time) {
  const k = dayKey();
  const h = Number(time.split(':')[0]);
  if (date === k) return h >= 20 ? 'Tonight' : h >= 17 ? 'This evening' : 'Today';
  if (date === dayKey(addDays(new Date(), 1))) return 'Tomorrow';
  return `On ${new Date(date + 'T12:00').toLocaleDateString(undefined, { weekday: 'long' })}`;
}
const planSentence = p => `${dayPhrase(p.date, p.time)} at ${fmtTime(p.time)}${p.where ? `, at ${p.where}` : ''}.`;
// "If I'm too tired, I'll do the easy version." from the obstacle the user picked or wrote
function ifLine(p) {
  if (!p || !p.obstacle || !p.ifThen) return '';
  const o = OBSTACLES.find(x => x[0] === p.obstacle);
  const clause = p.obstacle === 'other' ? (p.obstacleText || '').replace(/[.!]+$/, '') : o && o[2];
  if (!clause) return '';
  const lower = /^I\b/.test(clause) ? clause : clause.charAt(0).toLowerCase() + clause.slice(1);
  return `If ${lower}, I'll ${p.ifThen.replace(/^i'll\s+/i, '').replace(/[.!]+$/, '')}.`;
}

function planSheetHTML(ch) {
  const d = today();
  const existing = planFor(ch.id);
  const now = new Date();
  const hour = now.getHours();
  const days = [];
  if (weekly()) {
    // on a weekly rhythm: the rest of this week, or next week once this week's is done
    const start = d.earned ? addDays(new Date(weekStart() + 'T12:00'), 7) : now;
    const end = d.earned ? addDays(start, 6) : new Date(periodEnd() + 'T12:00');
    for (let x = new Date(start); dayKey(x) <= dayKey(end); x = addDays(x, 1)) days.push(dayKey(x));
  } else {
    for (let i = d.earned ? 1 : 0; i < 7; i++) days.push(dayKey(addDays(now, i)));
  }
  const defaultDate = existing && days.includes(existing.date) ? existing.date : hour >= 21 && !d.earned && days[1] ? days[1] : days[0];
  const defaultTime = existing ? existing.time : hour < 18 || hour >= 21 ? '18:00' : '21:00';
  const dayLabel = k => k === dayKey() ? 'Today' : k === dayKey(addDays(now, 1)) ? 'Tomorrow'
    : new Date(k + 'T12:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
  const quick = [['12:30', 'Lunchtime'], ['18:00', 'After work'], ['21:00', 'Tonight']];
  return `
    <h2 class="proof-title">When and where?</h2>
    <p class="plan-for">${esc(ch.title)}</p>
    <fieldset class="seg days"><legend>Day</legend>
      <div>${days.map(k => `<label><input type="radio" name="plan-day" value="${k}" ${k === defaultDate ? 'checked' : ''}><span>${dayLabel(k)}</span></label>`).join('')}</div>
    </fieldset>
    <fieldset class="seg"><legend>Time</legend>
      <div>${quick.map(([v, l]) => `<label><input type="radio" name="plan-quick" value="${v}" ${v === defaultTime ? 'checked' : ''}><span>${l}<small>${fmtTime(v)}</small></span></label>`).join('')}</div>
    </fieldset>
    <label class="field inline"><span class="field-label">Or pick a time</span><input type="time" id="plan-time" value="${defaultTime}"></label>
    <label class="field"><span class="field-label">Where? <span class="opt">Optional</span></span>
      <input id="plan-where" maxlength="40" placeholder="e.g. Café Lux" value="${esc(existing ? existing.where : '')}" autocomplete="off"></label>
    <fieldset class="seg chips"><legend>What might get in the way? <span class="opt">Optional</span></legend>
      <div>${OBSTACLES.map(([v, l]) => `<label><input type="radio" name="plan-obstacle" value="${v}" ${existing && existing.obstacle === v ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>
    </fieldset>
    <label class="field" id="obstacle-other-row" ${existing && existing.obstacle === 'other' ? '' : 'hidden'}><span class="field-label">What might get in the way?</span>
      <input id="plan-obstacle-text" maxlength="60" placeholder="e.g. My friend cancels" value="${esc(existing ? existing.obstacleText || '' : '')}" autocomplete="off"></label>
    <label class="field" id="ifthen-row" ${existing && existing.obstacle ? '' : 'hidden'}><span class="field-label">If it happens, I'll…</span>
      <input id="plan-ifthen" maxlength="80" value="${esc(existing ? existing.ifThen || '' : '')}" ${existing && existing.ifThen ? 'data-edited="1"' : ''} autocomplete="off"></label>
    <p class="plan-preview" id="plan-preview" aria-live="polite"></p>
    <div class="actions">
      <button class="btn primary big" data-act="plan-commit" data-id="${ch.id}">That's the plan</button>
      <div class="actions-row">
        <button class="btn" data-act="plan-calendar" data-id="${ch.id}">${icon('calendar')} Add to calendar</button>
        <button class="btn" data-act="plan-tell" data-id="${ch.id}">${icon('share')} Tell a friend</button>
      </div>
    </div>
    <p class="sheet-note">Picking a time and place makes you way more likely to actually do it.</p>`;
}
function planForm(id) {
  const day = $('input[name="plan-day"]:checked');
  const ob = $('input[name="plan-obstacle"]:checked');
  return {
    id, date: day ? day.value : dayKey(), time: $('#plan-time').value || '18:00', where: $('#plan-where').value.trim().slice(0, 40),
    obstacle: ob ? ob.value : null,
    obstacleText: ob && ob.value === 'other' ? $('#plan-obstacle-text').value.trim().slice(0, 60) : '',
    ifThen: ob ? $('#plan-ifthen').value.trim().slice(0, 80) : '',
  };
}
function updatePlanPreview() {
  const el = $('#plan-preview');
  if (!el) return;
  const p = planForm('');
  el.textContent = `${planSentence(p)} ${ifLine(p)}`.trim();
}
// picking an obstacle suggests a plan for it, unless the user already wrote their own
function pickObstacle(value) {
  const o = OBSTACLES.find(x => x[0] === value);
  $('#obstacle-other-row').hidden = value !== 'other';
  $('#ifthen-row').hidden = false;
  const input = $('#plan-ifthen');
  if (!input.dataset.edited) input.value = o ? o[3] : '';
  if (value === 'other') $('#plan-obstacle-text').focus();
  updatePlanPreview();
}
function openPlanSheet(ch) {
  openSheet(planSheetHTML(ch), 'When and where?');
  updatePlanPreview();
}
// Saves a plan; a plan inside the current day or week makes it the current challenge, a later one frees it up.
function commitPlan(p) {
  const d = today();
  savePlans([...plans().filter(x => x.id !== p.id && x.date !== p.date), p]);
  if (inPeriod(p.date)) {
    if (!d.earned && currentId(d) !== p.id) d.custom = p.id;
  } else if (!d.earned && currentId(d) === p.id) {
    if (d.custom === p.id) d.custom = null;
    else d.shown[d.idx] = nextPick();
  }
  saveDay();
  closeDeckSheets();
  show('today');
  const t = fmtTime(p.time).replace(':00', '');
  const day = p.date === dayKey() ? '' : ` ${dayPhrase(p.date, p.time).replace(/^On /, 'on ')}`;
  toast(`See you${p.where ? ` at ${p.where}` : ''}${day} at ${t}.`);
}
function cancelPlan(id) {
  savePlans(plans().filter(p => p.id !== id));
  renderToday();
  toast('Plan cancelled');
}
const icsText = t => String(t).replace(/[\\;,]/g, m => '\\' + m);
function planCalendarFile(p) {
  const ch = state.byId.get(p.id);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Keepsake//Plan//EN', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT', `UID:keepsake-plan-${p.id}-${p.date}@keepsake`, `DTSTAMP:${stamp}`,
    `DTSTART:${p.date.replace(/-/g, '')}T${p.time.replace(':', '')}00`, `DURATION:PT${Math.max(15, Math.min(ch.minutes, 240))}M`,
    `SUMMARY:${icsText(`Keepsake: ${ch.title}`)}`, ...(p.where ? [`LOCATION:${icsText(p.where)}`] : []),
    `DESCRIPTION:${icsText(`${ch.prompt} When you've done it, add it in Keepsake:`)} ${APP_URL}`, `URL:${APP_URL}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:-PT15M', `DESCRIPTION:${icsText(ch.title)}`, 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ];
  download(new Blob([lines.join('\r\n')], { type: 'text/calendar' }), `keepsake-${p.id}.ics`);
}
async function tellFriend(p) {
  const ch = state.byId.get(p.id);
  const when = `${dayPhrase(p.date, p.time).toLowerCase()} at ${fmtTime(p.time)}${p.where ? ` at ${p.where}` : ''}`;
  const text = `I'm doing “${ch.title}” ${when}. Hold me to it.`;
  try {
    if (navigator.share) { await navigator.share({ title: 'Keepsake', text, url: dareLink(ch.id) }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  copyText(`${text} ${dareLink(ch.id)}`, 'Copied. Send it to a friend.');
}
function planBlockHTML(ch) {
  const p = todayPlan();
  if (!p) return '';
  return `
    <aside class="plan-block">
      <span class="plan-label">${icon('calendar')} Your plan</span>
      <p>${esc(planSentence(p))}</p>
      ${ifLine(p) ? `<p class="plan-if">${esc(ifLine(p))}</p>` : ''}
      <span class="plan-links"><button class="link" data-act="plan" data-id="${ch.id}">Change</button>${
        p.obstacle === 'tired' && !isEasy(today()) ? '<button class="link" data-act="easy-on">Go easy this time</button>' : ''}${
        p.obstacle === 'forget' ? `<button class="link" data-act="plan-calendar-saved" data-id="${ch.id}">Add to calendar</button>` : ''}<button class="link quiet" data-act="plan-cancel" data-id="${ch.id}">Cancel plan</button></span>
    </aside>`;
}
function upcomingHTML() {
  const list = upcomingPlans().filter(p => state.byId.has(p.id));
  if (!list.length) return '';
  return `<div class="upcoming"><h3 class="sub">Coming up</h3>${list.map(p => `
    <p><strong>${esc(state.byId.get(p.id).title)}</strong> · ${esc(planSentence(p))}
      <button class="link" data-act="plan" data-id="${p.id}">Change</button></p>`).join('')}</div>`;
}

/* ================= dares + sharing ================= */
const dareLink = id => `${APP_URL}?dare=${encodeURIComponent(id)}${state.settings.name ? `&from=${encodeURIComponent(state.settings.name)}` : ''}`;
async function copyText(text, done) {
  try { await navigator.clipboard.writeText(text); toast(done); } catch (e) { window.prompt('Copy this link:', text); }
}
async function shareDare(ch, card) {
  const link = dareLink(ch.id);
  const text = card ? `I did "${ch.title}" on Keepsake. Your turn:` : `I dare you: ${ch.title}.`;
  try {
    if (navigator.share) { await navigator.share({ title: 'Keepsake', text, url: link }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  copyText(`${text} ${link}`, 'Dare link copied');
}
function openShareSheet(card) {
  openSheet(`
    <h2 class="proof-title">Share card #${pad(card.no)}</h2>
    <div class="share-list">
      <button class="btn primary big" data-act="share-story" data-id="${card.id}">${icon('share')} Share to Stories</button>
      ${isZero(card) ? '' : `<button class="btn big" data-act="share-dare" data-id="${card.id}">Dare a friend</button>`}
      <button class="btn big ghost" data-act="save-img" data-id="${card.id}">Save image</button>
    </div>
    <p class="sheet-note">Stories gets a tall version of your card. A dare sends your friend a link to this challenge.</p>`, 'Share', { over: true });
}
async function fillTodayCard(el, card) {
  const slot = $('.mini-slot', el);
  if (card.revealed === false) {
    slot.innerHTML = `<button class="waiting-card" data-act="reveal" data-id="${card.id}">${cardHTML(card, null, 'r0', 'span')}<span>Your card's waiting. Tap to flip it.</span></button>`;
    return;
  }
  const url = await photoUrl(card);
  if (!slot.isConnected) return;
  slot.innerHTML = `<button class="cardbtn-plain" data-view="${card.id}" aria-label="${esc(cardLabel(card))}" style="border:0;background:none;padding:0;border-radius:16px">${cardHTML(card, url, 'static', 'span')}</button>`;
  const k = $('.kcard', slot);
  attachTilt(k);
  if (state.justLanded === card.id) { k.classList.add('land'); state.justLanded = null; }
}

function renderDeck() {
  const el = $('#screen-deck');
  const done = earnedIds();
  const filters = [['all', 'All'], ['todo', 'To do'], ['secret', 'Secret'], ...Object.entries(CATS).map(([k, v]) => [k, v.label])];
  const hidden = state.challenges.filter(c => !isUnlocked(c)).length;
  el.innerHTML = `
    <header class="topbar"><h1 class="logo">The Deck</h1><span class="topbar-meta">${realCards().length} of ${state.challenges.length - hidden} done${hidden ? ` · ${hidden} secret` : ''}</span></header>
    <label class="sr-only" for="deck-search">Search challenges</label>
    <input class="search" id="deck-search" type="search" placeholder="Search challenges" value="${esc(state.deckQuery)}" autocomplete="off">
    <div class="filters" role="group" aria-label="Filter">${filters.map(([k, l]) => `<button class="filter" data-filter="${k}" aria-pressed="${k === state.deckFilter}">${l}</button>`).join('')}</div>
    <div class="deck-list" id="deck-list"></div>`;
  renderDeckList();
}
function renderDeckList() {
  const done = earnedIds();
  const d = today();
  const f = state.deckFilter;
  const q = state.deckQuery.trim().toLowerCase();
  const fresh = newSecrets();
  const { cap } = courageProgress();
  const rank = c => !isUnlocked(c) ? 4 : done.has(c.id) ? 3 : c.courage > cap ? 2 : 1;
  const list = state.challenges.filter(c => {
    const open = isUnlocked(c);
    if (f === 'todo' && (done.has(c.id) || !open)) return false;
    if (f === 'secret' && !c.secret) return false;
    if (CATS[f] && c.category !== f) return false;
    if (q) return open && (c.title + ' ' + c.prompt).toLowerCase().includes(q);
    return true;
  }).sort((a, b) => rank(a) - rank(b) || (rank(a) === 1 ? b.courage - a.courage : a.courage - b.courage));
  $('#deck-list').innerHTML = list.length ? list.map(c => {
    const info = unlockInfo(c);
    if (!info.unlocked) return `
      <button class="deck-item locked" data-locked="${c.id}">
        <span class="t"><span>Secret ${CATS[c.category].label} challenge</span>${icon('lock')}</span>
        <span class="s">${esc(info.hint)}</span>
        ${info.need > 1 ? `<span class="m">${info.have} of ${info.need}</span>` : ''}
        ${info.need > 1 ? `<span class="bar" aria-hidden="true"><i style="width:${(info.have / info.need) * 100}%"></i></span>` : ''}
      </button>`;
    const pill = done.has(c.id) ? '<span class="pill">Earned</span>'
      : currentId(d) === c.id && !d.earned ? '<span class="pill today">Today</span>'
      : fresh.includes(c.id) ? '<span class="pill new">New</span>'
      : c.secret ? '<span class="pill secret">Secret</span>' : '';
    return `
      <button class="deck-item${c.secret ? ' secret' : ''}${rank(c) === 2 ? ' above' : ''}" data-open="${c.id}">
        <span class="t"><span>${esc(c.title)}</span>${pill}</span>
        <span class="s">${esc(c.prompt)}</span>
        <span class="m">${CATS[c.category].label} · ${rank(c) === 2 ? `Opens at courage ${c.courage}` : `Courage ${c.courage} of 5`} · ${fmtMinutes(c.minutes)}</span>
      </button>`;
  }).join('') : `<p class="empty-list">No challenges match “${esc(state.deckQuery)}”.</p>`;
}
function deckActions(ch) {
  const d = today();
  const card = state.cards.find(c => c.challengeId === ch.id);
  const dare = `<button class="btn ghost big" data-act="plan" data-id="${ch.id}">${icon('calendar')} ${planFor(ch.id) ? 'Change plan' : 'Plan it'}</button>`
    + `<button class="btn ghost big" data-act="dare-friend" data-id="${ch.id}">${icon('share')} Dare a friend</button>`;
  if (card) return `<div class="actions"><button class="btn big" data-view="${card.id}">See your card</button><button class="btn ghost big" data-act="dare-friend" data-id="${ch.id}">${icon('share')} Dare a friend</button></div>`;
  if (ch.courage > courageProgress().cap && currentId(d) !== ch.id) return `<div class="actions"><button class="btn ghost big" data-act="dare-friend" data-id="${ch.id}">${icon('share')} Dare a friend</button></div>
    <p class="sheet-note">This one opens at courage ${ch.courage}. You're at ${courageProgress().cap}, and every three at your level gets you one closer.</p>`;
  if (d.earned || fewCapped()) return `<div class="actions">${dare}</div><p class="sheet-note">You've done ${fewCapped() ? 'three this week' : weekly() ? 'one this week' : "today's"}. Save this one for ${fewCapped() || weekly() ? 'next week' : 'tomorrow'}? Plan it.</p>`;
  if (currentId(d) === ch.id) return `<div class="actions"><button class="btn primary big" data-act="done" data-id="${ch.id}">I did it</button>${dare}</div><p class="sheet-note">This is ${W().cur} challenge.</p>`;
  return `<div class="actions"><button class="btn primary big" data-act="pick" data-id="${ch.id}">Do this one ${W().now}</button>${dare}</div>
    <p class="sheet-note">${W().one}, so this swaps out ${W().cur} challenge.</p>`;
}

async function renderBook() {
  const el = $('#screen-book');
  const cards = [...state.cards].sort((a, b) => b.no - a.no);
  const counts = [0, 0, 0, 0, 0, 0];
  cards.forEach(c => { if (c.revealed !== false && !isZero(c)) counts[c.rarity]++; });
  const header = '<header class="topbar"><h1 class="logo">Your Book</h1></header>';
  if (!cards.length) {
    el.innerHTML = `${header}
      <p class="empty-book">Every challenge you do ends up here as a card, with your photo and your words.</p>
      <div class="grid"><div class="ghost-card">${icon('seal')}<span>Your first card goes here</span></div></div>
      <div class="actions"><button class="btn" data-goto="today">See ${W().cur} challenge</button></div>`;
    return;
  }
  const n = realCards().length;
  const parts = [`${n} card${n === 1 ? '' : 's'}`];
  for (let r = 5; r >= 1; r--) if (counts[r]) parts.push(`<b style="--rc:${RARITY[r].color}">${counts[r]} ${RARITY[r].name}</b>`);
  parts.push(`courage level ${courageProgress().cap}`);
  const done = earnedIds();
  const urls = await Promise.all(cards.map(photoUrl));
  el.innerHTML = `${header}
    <p class="book-summary">${parts.join(' · ')}</p>
    <div class="grid">
      ${cards.map((c, i) => isWish(c)
        ? `<button class="cardbtn" data-act="zero-fill" aria-label="${esc(`Day Zero, not done yet: ${c.wish}. Fill it in`)}">${wishHTML(c)}</button>`
        : c.revealed === false
        ? `<button class="cardbtn" data-act="reveal" data-id="${c.id}" aria-label="Card ${c.no}, not revealed yet">${cardHTML(c, null, 'r0 mid', 'span')}</button>`
        : `<button class="cardbtn" data-view="${c.id}" aria-label="${esc(cardLabel(c))}">${cardHTML(c, urls[i], 'static mid', 'span')}</button>`).join('')}
    </div>
    <details class="progress">
      <summary>Progress by category</summary>
      <ul>${Object.entries(CATS).map(([k, v]) => {
        const all = state.challenges.filter(c => c.category === k);
        const n = all.filter(c => done.has(c.id)).length;
        return `<li><span>${v.label}</span><span class="bar"><i style="width:${all.length ? (n / all.length) * 100 : 0}%"></i></span><span>${n}/${all.length}</span></li>`;
      }).join('')}</ul>
    </details>`;
}

function show(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === `screen-${name}`));
  document.querySelectorAll('.tab').forEach(t => {
    const on = t.dataset.screen === name;
    t.classList.toggle('active', on);
    if (on) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current');
  });
  ({ today: renderToday, deck: renderDeck, book: renderBook })[name]();
  updateDeckBadge();
  window.scrollTo(0, 0);
}
const activeScreen = () => $('.tab.active').dataset.screen;

let countdownTimer = null;
function tickCountdown() {
  clearInterval(countdownTimer);
  const upd = () => {
    const el = $('#countdown');
    if (!el) { clearInterval(countdownTimer); return; }
    const now = new Date();
    if (periodKey(now) !== state.day.date) { renderToday(); return; }
    const next = nextStart();
    const mins = Math.ceil((next - now) / 60000);
    el.textContent = mins > 24 * 60
      ? `on ${next.toLocaleDateString(undefined, { weekday: 'long' })}`
      : `in ${Math.floor(mins / 60)}h ${mins % 60}m`;
  };
  upd();
  countdownTimer = setInterval(upd, 30000);
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), 2600);
}
const announce = msg => { $('#sr-live').textContent = msg; };

/* ================= sheets ================= */
function openSheet(html, label, { over = false } = {}) {
  const opener = document.activeElement;
  const sh = document.createElement('div');
  sh.className = `sheet deck-sheet${over ? ' over' : ''}`;
  sh.innerHTML = `<div class="sheet-panel" role="dialog" aria-modal="true" aria-label="${esc(label)}"><button class="icon-btn sheet-close" data-close aria-label="Close">${icon('close')}</button>${html}</div>`;
  sh.close = () => { sh.remove(); if (opener && opener.isConnected) opener.focus(); };
  sh.addEventListener('click', e => { if (e.target === sh || e.target.closest('[data-close]')) sh.close(); });
  document.body.appendChild(sh);
  $('.sheet-close', sh).focus();
  return sh;
}
const closeDeckSheets = () => document.querySelectorAll('.deck-sheet').forEach(s => s.remove());

/* ================= proof flow ================= */
async function openProof(challengeId, { kind = 'today', edit = null, easy = false } = {}) {
  const ch = state.byId.get(challengeId);
  state.pending = { challengeId, kind, edit, easy, blob: null, keepPhoto: !!(edit && edit.photo), previewUrl: null, ownUrl: false, opener: document.activeElement };
  if (edit && edit.photo) state.pending.previewUrl = await photoUrl(edit);
  const wish = kind === 'zero' && state.cards.find(isWish);
  $('#proof-title').textContent = edit ? `Edit card #${pad(edit.no)}` : wish ? wish.wish : ch.title;
  $('#story-input').value = edit ? edit.story : '';
  $('#place-input').value = edit ? edit.place : '';
  $('#upgrade-input').checked = false;
  $('#proof-easy').hidden = !!edit || !easy;
  $('#upgrade-row').hidden = !!edit || !easy || ch.courage <= 1;
  $('#seal-btn').textContent = edit ? 'Save changes' : 'Make my card';
  $('#photo-input').value = '';
  updateProof();
  $('#proof').hidden = false;
  $('#photo-btn').focus();
}
function closeProof() {
  const p = state.pending;
  $('#proof').hidden = true;
  if (p && p.ownUrl) URL.revokeObjectURL(p.previewUrl);
  if (p && p.opener && p.opener.isConnected) p.opener.focus();
  state.pending = null;
}
function updateProof() {
  const p = state.pending;
  if (!p) return;
  const ta = $('#story-input');
  ta.style.height = 'auto';
  ta.style.height = `${ta.scrollHeight + 2}px`;
  const story = ta.value;
  $('#story-count').textContent = `${story.length} / 120`;
  const hasPhoto = !!(p.blob || p.keepPhoto);
  const can = hasPhoto || !!story.trim();
  $('#seal-btn').disabled = !can;
  $('#seal-hint').hidden = can;
  $('#photo-btn-label').textContent = hasPhoto ? 'Change photo' : 'Add a photo';
  $('#photo-btn').classList.toggle('has-photo', hasPhoto);
  const preview = {
    no: p.edit ? p.edit.no : 0, challengeId: p.challengeId, rarity: p.edit ? p.edit.rarity : 0,
    wish: p.kind === 'zero' ? (state.cards.find(isWish) || {}).wish : p.edit && p.edit.wish,
    story: story.trim(), place: $('#place-input').value.trim(), date: p.edit ? p.edit.date : new Date().toISOString(), preview: true,
  };
  $('#preview-slot').innerHTML = cardHTML(preview, p.previewUrl, 'static mid');
}

async function seal() {
  const p = state.pending;
  if (!p) return;
  const ch = state.byId.get(p.challengeId);
  const story = $('#story-input').value.trim();
  const place = $('#place-input').value.trim();
  let photoOk = true;

  if (p.edit) {
    const card = p.edit;
    card.story = story;
    card.place = place;
    if (p.blob) { photoOk = await putPhoto(card.id, p.blob); card.photo = true; }
    saveCards();
    closeProof();
    show(activeScreen());
    toast(photoOk ? 'Card updated' : "Saved, but this browser couldn't keep the photo");
    return;
  }

  if (p.kind === 'zero') {
    const card = state.cards.find(isWish);
    if (!card) return closeProof();
    Object.assign(card, { story, place, date: new Date().toISOString(), photo: !!p.blob, pending: false, revealed: false });
    if (p.blob) photoOk = await putPhoto(card.id, p.blob);
    saveCards();
    closeProof();
    if (!photoOk) toast("This browser couldn't save the photo, so it'll be gone after a reload.");
    startReveal(card, { from: 'zero' });
    return;
  }

  const easier = p.easy && !$('#upgrade-input').checked && ch.courage > 1;
  const dare = today().dare;
  const capBefore = courageProgress().cap;
  const planned = plans().some(x => x.id === ch.id && x.date <= dayKey());
  const daredBy = dare && dare.id === ch.id ? (dare.from || 'a friend') : null;
  const lastCard = realCards().reduce((m, c) => (c.date > m ? c.date : m), '');
  const finishes = [
    planned && 'planned',
    daredBy && 'dared',
    !realCards().some(c => (state.byId.get(c.challengeId) || {}).category === ch.category) && 'first',
    (state.settings.backFrom || (lastCard && daysBetween(dayKey(new Date(lastCard)), dayKey()) >= 14)) && 'back',
  ].filter(Boolean);
  const secretsBefore = unlockedSecretIds();
  const card = {
    id: uid(),
    no: state.cards.reduce((m, c) => Math.max(m, c.no), 0) + 1,
    challengeId: ch.id,
    rarity: ch.courage, // going easy is marked on the card, never graded down
    easier,
    story,
    place,
    date: new Date().toISOString(),
    photo: !!p.blob,
    revealed: false,
    daredBy,
    planned,
    finishes,
  };
  if (state.settings.backFrom) { state.settings.backFrom = null; saveSettings(); }
  savePlans(plans().filter(x => x.id !== ch.id)); // done early or on time, the plan is finished either way
  if (p.blob) photoOk = await putPhoto(card.id, p.blob);
  state.cards.push(card);
  saveCards();
  const d = today();
  if (p.kind === 'prev') d.prev = null; else d.earned = card.id;
  d.custom = null;
  saveDay();
  const kind = p.kind;
  closeProof();
  if (!photoOk) toast("This browser couldn't save the photo, so it'll be gone after a reload.");
  const capAfter = courageProgress().cap;
  const unlocked = [...unlockedSecretIds()].filter(id => !secretsBefore.has(id));
  updateDeckBadge();
  startReveal(card, { from: kind, levelUp: capAfter > capBefore ? capAfter : 0, unlocked });
}

/* ================= audio ================= */
let actx = null;
function audio() {
  if (!state.settings.sound) return null;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    return actx;
  } catch (e) { return null; }
}
function tone(freq, t0, dur, type = 'sine', gain = 0.12) {
  const a = audio();
  if (!a) return;
  const o = a.createOscillator(), g = a.createGain();
  const t = a.currentTime + t0;
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}
function noise(dur, from, to, gain) {
  const a = audio();
  if (!a) return;
  const len = a.sampleRate * dur;
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  src.buffer = buf;
  f.type = 'bandpass';
  f.frequency.setValueAtTime(from, a.currentTime);
  f.frequency.exponentialRampToValueAtTime(to, a.currentTime + dur * 0.8);
  g.gain.value = gain;
  src.connect(f).connect(g).connect(a.destination);
  src.start();
}
const whoosh = () => noise(0.5, 400, 4000, 0.22);
const tick = step => tone(330 * Math.pow(2, (step * 4) / 12), 0, 0.14, 'triangle', 0.12);
const develop = () => { tone(220, 0, 1.6, 'sine', 0.05); tone(330, 0.2, 1.4, 'sine', 0.04); };
const thud = () => { tone(90, 0, 0.35, 'sine', 0.4); tone(140, 0, 0.2, 'triangle', 0.12); noise(0.12, 300, 120, 0.25); };
const shimmer = () => [1318, 1568, 1976, 2637].forEach((f, i) => tone(f, i * 0.07, 0.9 - i * 0.1, 'sine', 0.05));
function chime(r) {
  const notes = [523.25, 659.25, 783.99, 1046.5];
  for (let i = 0; i < Math.min(4, r + 1); i++) tone(notes[i], i * 0.09, 0.9, 'sine', 0.08);
}
function fanfare(r) {
  const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98];
  for (let i = 0; i <= r; i++) tone(notes[i], i * 0.07, 0.7, 'triangle', 0.1);
  const end = (r + 1) * 0.07;
  [523.25, 659.25, 783.99].forEach(f => tone(f * 2, end, 1.4, 'sine', 0.06));
  for (let i = 0; i < 8; i++) tone(2093 + Math.random() * 1500, end + 0.1 + i * 0.08, 0.25, 'sine', 0.03);
  if (r >= 5) { tone(65.4, 0, 1.6, 'sine', 0.35); tone(98, 0.02, 1.2, 'sine', 0.2); }
}

/* ================= particles ================= */
const fx = { parts: [], raf: 0, rain: 0, ctx: null, w: 0, h: 0 };
function fxSetup() {
  const c = $('#fx');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  fx.w = c.clientWidth; fx.h = c.clientHeight;
  c.width = fx.w * dpr; c.height = fx.h * dpr;
  fx.ctx = c.getContext('2d');
  fx.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
function spawn(x, y, r, n, { spread = Math.PI * 2, dir = 0, speed = [4, 15], rain = false, size = 1 } = {}) {
  const rc = RARITY[r];
  const palette = [rc.color, rc.light, '#ffffff', r >= 4 ? '#ffd27a' : rc.color];
  for (let i = 0; i < n; i++) {
    const a = dir + (Math.random() - 0.5) * spread;
    const v = speed[0] + Math.random() * (speed[1] - speed[0]);
    fx.parts.push({
      x, y,
      vx: Math.cos(a) * v, vy: Math.sin(a) * v - (rain ? 0 : 3),
      g: rain ? 0.06 : 0.22, drag: rain ? 0.995 : 0.975,
      life: 0, max: 70 + Math.random() * 80,
      s: (3 + Math.random() * 6) * size, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
      color: palette[(Math.random() * palette.length) | 0],
      shape: Math.random() < 0.15 && r >= 3 ? 'star' : Math.random() < 0.55 ? 'rect' : 'dot',
    });
  }
  if (!fx.raf) fx.raf = requestAnimationFrame(fxLoop);
}
function drawStar(ctx, s) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const rad = i % 2 ? s * 0.4 : s * 1.4;
    const a = (i * Math.PI) / 4;
    ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
  }
  ctx.closePath();
  ctx.fill();
}
function fxLoop() {
  const { ctx } = fx;
  ctx.clearRect(0, 0, fx.w, fx.h);
  fx.parts = fx.parts.filter(p => p.life < p.max && p.y < fx.h + 40);
  for (const p of fx.parts) {
    p.life++; p.vx *= p.drag; p.vy = p.vy * p.drag + p.g; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
    ctx.save();
    ctx.globalAlpha = Math.min(1, 1.6 - p.life / p.max);
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.fillStyle = p.color;
    if (p.shape === 'rect') ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
    else if (p.shape === 'star') drawStar(ctx, p.s);
    else { ctx.beginPath(); ctx.arc(0, 0, p.s / 2.4, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }
  fx.raf = fx.parts.length ? requestAnimationFrame(fxLoop) : 0;
}
function celebrate(r, x, y) {
  fxSetup();
  const n = r >= 5 ? 260 : 180;
  spawn(x, y, r, n);
  setTimeout(() => {
    spawn(0, fx.h * 0.75, r, n / 3, { dir: -Math.PI / 3, spread: 0.6, speed: [10, 20] });
    spawn(fx.w, fx.h * 0.75, r, n / 3, { dir: -Math.PI * 2 / 3, spread: 0.6, speed: [10, 20] });
  }, 250);
  if (r >= 5) {
    let k = 0;
    clearInterval(fx.rain);
    fx.rain = setInterval(() => {
      for (let i = 0; i < 6; i++) spawn(Math.random() * fx.w, -10, r, 1, { dir: Math.PI / 2, spread: 0.4, speed: [1, 3], rain: true });
      if (++k > 60) clearInterval(fx.rain);
    }, 50);
  }
}
function sealDust(r, x, y) {
  fxSetup();
  spawn(x, y, r, 16, { speed: [2, 6], size: 0.6 });
}
function flash(color) {
  const f = document.createElement('div');
  f.className = 'flash';
  f.style.setProperty('--flash', color);
  document.body.appendChild(f);
  setTimeout(() => f.remove(), 600);
}

/* ================= stage: reveal + viewer ================= */
let run = null; // the reveal in progress
const stage = {
  opener: null,
  open() {
    this.opener = document.activeElement;
    $('#toast').classList.remove('show');
    $('#stage').hidden = false;
    $('.rays').classList.remove('on');
    $('#rarity-banner').className = 'rarity-banner';
    $('#rarity-banner').textContent = '';
    $('#stage-actions').className = 'stage-actions';
    $('#stage-actions').innerHTML = '';
    $('#stage-hint').textContent = '';
    $('#stage-hint').className = 'stage-hint';
    syncSoundBtn();
    document.body.style.overflow = 'hidden';
  },
  close() {
    $('#stage').hidden = true;
    clearInterval(fx.rain);
    fx.parts = [];
    run = null;
    document.body.style.overflow = '';
  },
};
function syncSoundBtn() {
  const b = $('#sound-btn');
  b.setAttribute('aria-pressed', String(state.settings.sound));
  b.setAttribute('aria-label', state.settings.sound ? 'Sound on' : 'Sound off');
  b.innerHTML = icon(state.settings.sound ? 'sound' : 'mute');
}

async function startReveal(card, { from = 'book', levelUp = 0, unlocked = [] } = {}) {
  const url = await photoUrl(card);
  stage.open();
  const slot = $('#stage-card-slot');
  slot.innerHTML = cardHTML(card, url, 'waiting dev-photo dev-ink dev-seal dev-fin', 'button');
  const el = slot.firstElementChild;
  el.setAttribute('aria-label', 'Reveal your card');
  el.style.setProperty('--rc', RARITY[0].color);
  const hint = $('#stage-hint');
  hint.textContent = state.keyboard ? 'Press Enter to flip your card' : 'Tap to flip your card';
  hint.classList.add('pulse');
  hint.classList.remove('levelup');
  run = { card, el, url, from, levelUp, unlocked, started: false, startedAt: 0, done: false };
  const myRun = run;
  el.addEventListener('click', () => reveal(myRun), { once: true });
  el.focus();
}

async function reveal(rn) {
  if (rn.started || rn !== run) return;
  rn.started = true;
  rn.startedAt = performance.now();
  audio();
  const { card, el } = rn;
  const r = card.rarity;
  const rm = reduceMotion();
  const wait = async ms => { await sleep(rm ? Math.min(ms, 250) : ms); return rn.done; };
  // after the first few, say how to skip
  $('#stage-hint').textContent = realCards().filter(c => c.revealed !== false).length >= 2 ? (state.keyboard ? 'Esc to skip' : 'Tap to skip') : '';
  $('#stage-hint').classList.remove('pulse');
  el.classList.remove('waiting');
  el.setAttribute('aria-label', 'Revealing your card');

  // the charge-up climbs through the tiers; the tier is never shown before this
  if (!rm) {
    el.style.setProperty('--shake-dur', `${r * 320 + 150}ms`);
    el.classList.add('charging');
    for (let i = 1; i <= r; i++) {
      el.style.setProperty('--rc', RARITY[i].color);
      tick(i);
      vibrate(15 + i * 10);
      if (await wait(320)) return;
    }
    el.classList.remove('charging');
  }
  el.style.removeProperty('--rc');
  whoosh();
  el.classList.add('flipped');
  if (await wait(800)) return;

  // the ritual: the photo develops, the words ink in, the seal presses down
  el.classList.remove('dev-photo');
  if (rn.url) develop();
  if (await wait(rn.url ? 1500 : 400)) return;
  el.classList.remove('dev-ink');
  if (await wait(1000)) return;
  el.classList.remove('dev-seal');
  el.classList.add('stamped');
  thud();
  vibrate(45);
  const s = $('.seal', el).getBoundingClientRect();
  if (!rm) sealDust(r, s.left + s.width / 2, s.top + s.height / 2);
  if (await wait(500)) return;
  // the surprise: a foil finish you didn't know you'd earned
  if (isFoil(card)) {
    $('#stage-hint').textContent = '';
    el.classList.remove('dev-fin');
    el.classList.add('foiling');
    shimmer();
    vibrate([20, 30, 20, 30, 60]);
    if (await wait(1300)) return;
  }
  finishReveal(rn);
}

function finishReveal(rn) {
  if (!rn || rn.done) return;
  rn.done = true;
  rn.started = true;
  const { card, el } = rn;
  const r = card.rarity;
  const rc = isZero(card) ? ZERO_LOOK : RARITY[r];
  const rm = reduceMotion();
  el.classList.remove('waiting', 'charging', 'dev-photo', 'dev-ink', 'dev-seal', 'dev-fin');
  el.style.removeProperty('--rc');
  el.classList.add('flipped');
  $('#stage-hint').textContent = '';
  $('#stage-hint').classList.remove('pulse');

  // a short flourish, saved for the hardest challenges
  if (r >= 4) {
    const b = el.getBoundingClientRect();
    if (!rm) {
      flash(rc.light);
      celebrate(r, b.left + b.width / 2, b.top + b.height / 2);
      $('.rays').style.setProperty('--ray', rc.color);
      $('.rays').classList.add('on');
    }
    fanfare(r);
    vibrate([60, 40, 60, 40, 200]);
    const banner = $('#rarity-banner');
    banner.style.setProperty('--rc', rc.color);
    banner.textContent = rc.name;
    banner.classList.add('show');
  } else {
    chime(r);
  }

  card.revealed = true;
  saveCards();
  const ch = state.byId.get(card.challengeId);
  const news = [];
  const fin = finishLabels(card);
  if (isFoil(card)) news.push(`Foil: ${fin.join(' · ')}`);
  if (rn.levelUp) news.push("You're braver than you were. Harder ones are open now.");
  if (rn.unlocked.length === 1) news.push(`You unlocked a secret challenge: ${state.byId.get(rn.unlocked[0]).title}. It's in the Deck.`);
  if (rn.unlocked.length > 1) news.push(`You unlocked ${rn.unlocked.length} secret challenges. They're in the Deck.`);
  if (isZero(card)) news.push('You did it. Day Zero is done.');
  announce(isZero(card) ? `Day Zero is done: ${card.wish || card.story}.` : `${rc.name} card revealed: ${ch.title}. It's in your Book. ${news.join(' ')}`);
  if (news.length) {
    const hint = $('#stage-hint');
    hint.textContent = news.join('\n');
    hint.classList.add('levelup');
  }

  setTimeout(() => {
    if (run !== rn) return;
    const slot = $('#stage-card-slot');
    slot.innerHTML = cardHTML(card, rn.url, 'static', 'div');
    attachTilt(slot.firstElementChild);
    const actions = $('#stage-actions');
    actions.innerHTML = `
      <button class="btn" data-act="share" data-id="${card.id}">${icon('share')} Share</button>
      <button class="btn primary" data-act="reveal-done">Done</button>`;
    actions.classList.add('show');
    $('[data-act="reveal-done"]', actions).focus();
  }, rm ? 50 : 650);
}

async function openViewer(card) {
  if (card.revealed === false) return startReveal(card);
  const url = await photoUrl(card);
  stage.open();
  const slot = $('#stage-card-slot');
  slot.innerHTML = cardHTML(card, url, 'static', 'div');
  attachTilt(slot.firstElementChild);
  const actions = $('#stage-actions');
  actions.innerHTML = `
    <button class="btn" data-act="edit" data-id="${card.id}">Edit</button>
    <button class="btn" data-act="share" data-id="${card.id}">${icon('share')} Share</button>
    <button class="btn primary" data-act="close-stage">Close</button>
    <button class="link danger" data-act="delete" data-id="${card.id}">Delete this card</button>`;
  actions.classList.add('show');
  $('[data-act="close-stage"]', actions).focus();
}
function closeStage() {
  const opener = stage.opener;
  stage.close();
  if (opener && opener.isConnected) opener.focus();
}

/* ================= PNG export ================= */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function wrap(ctx, text, maxW, maxLines) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    let last = lines[maxLines - 1];
    while (ctx.measureText(last + '…').width > maxW && last.length) last = last.slice(0, -1);
    lines[maxLines - 1] = last + '…';
  }
  return lines;
}
function drawSeal(x, cx, cy, rad, r) {
  const g = x.createRadialGradient(cx - rad * 0.3, cy - rad * 0.35, rad * 0.1, cx, cy, rad);
  g.addColorStop(0, r.light); g.addColorStop(0.5, r.color); g.addColorStop(1, r.dark);
  x.save();
  x.shadowColor = 'rgba(0,0,0,0.5)'; x.shadowBlur = 18; x.shadowOffsetY = 8;
  x.beginPath(); x.arc(cx, cy, rad, 0, Math.PI * 2); x.fillStyle = g; x.fill();
  x.restore();
  x.beginPath();
  const pts = [[12, 3.5], [14.1, 9.4], [20, 12], [14.1, 14.6], [12, 20.5], [9.9, 14.6], [4, 12], [9.9, 9.4]];
  pts.forEach(([px, py], i) => {
    const X = cx + (px - 12) * rad / 20, Y = cy + (py - 12) * rad / 20;
    if (i) x.lineTo(X, Y); else x.moveTo(X, Y);
  });
  x.closePath();
  x.fillStyle = 'rgba(0,0,0,0.42)';
  x.fill();
}
async function renderCardCanvas(card) {
  try { await document.fonts.ready; } catch (e) { /* ignore */ }
  const W = 1080, H = 1512;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  const ch = state.byId.get(card.challengeId);
  const r = isZero(card) ? ZERO_LOOK : RARITY[card.rarity];

  const g = x.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, r.light); g.addColorStop(0.4, r.color); g.addColorStop(1, r.dark);
  roundRect(x, 0, 0, W, H, 54); x.fillStyle = g; x.fill();
  if (isFoil(card)) {
    const foil = x.createLinearGradient(0, 0, W, H);
    ['#ff9ad5', '#9ef3ff', '#fff6a0', '#a8ffc4', '#ff9ad5'].forEach((col, i) => foil.addColorStop(i / 4, col));
    x.globalAlpha = 0.45; roundRect(x, 0, 0, W, H, 54); x.fillStyle = foil; x.fill(); x.globalAlpha = 1;
  }
  roundRect(x, 28, 28, W - 56, H - 56, 34); x.fillStyle = '#171310'; x.fill();

  x.textBaseline = 'alphabetic';
  x.font = `700 30px ${SANS}`;
  x.fillStyle = '#d2c9bd';
  x.textAlign = 'left';
  x.fillText(isZero(card) ? 'DAY ZERO' : `${ch.secret ? 'SECRET · ' : ''}${CATS[ch.category].label.toUpperCase()}`, 64, 92);
  x.textAlign = 'right';
  x.fillStyle = r.color;
  x.font = '700 34px Literata, Georgia, serif';
  x.fillText(`#${pad(card.no)}`, W - 64, 92);

  const px = 54, py = 120, pw = W - 108, ph = 880;
  x.save();
  roundRect(x, px, py, pw, ph, 18); x.clip();
  const url = await photoUrl(card);
  if (url) {
    const img = await loadImg(url);
    const s = Math.max(pw / img.naturalWidth, ph / img.naturalHeight);
    const iw = img.naturalWidth * s, ih = img.naturalHeight * s;
    x.drawImage(img, px + (pw - iw) / 2, py + (ph - ih) / 2, iw, ih);
  } else {
    const pg = x.createRadialGradient(px + pw * 0.3, py + ph * 0.2, 10, px + pw * 0.5, py + ph * 0.5, ph);
    pg.addColorStop(0, r.color); pg.addColorStop(1, '#171310');
    x.fillStyle = pg; x.fillRect(px, py, pw, ph);
    x.font = 'italic 900 560px Literata, Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = 'rgba(255,255,255,0.8)';
    x.fillText((card.story || cardTitle(card)).trim().charAt(0).toUpperCase(), px + pw / 2, py + ph / 2 + 40);
    x.textBaseline = 'alphabetic';
  }
  if (card.rarity >= 3) {
    const sheen = x.createLinearGradient(px, py, px + pw, py + ph);
    sheen.addColorStop(0.35, 'rgba(255,255,255,0)'); sheen.addColorStop(0.5, 'rgba(255,255,255,0.22)'); sheen.addColorStop(0.65, 'rgba(255,255,255,0)');
    x.fillStyle = sheen; x.fillRect(px, py, pw, ph);
  }
  x.restore();
  drawSeal(x, W - 150, py + ph - 70, 78, r);

  x.textAlign = 'left';
  x.fillStyle = '#f4efe6';
  x.font = '900 72px Literata, Georgia, serif';
  let y = py + ph + 92;
  for (const line of wrap(x, cardTitle(card), W - 128, 2)) { x.fillText(line, 64, y); y += 74; }
  if (card.story) {
    x.fillStyle = '#d2c9bd';
    x.font = 'italic 500 38px Literata, Georgia, serif';
    y += 4;
    for (const line of wrap(x, `“${card.story}”`, W - 128, 2)) { x.fillText(line, 64, y); y += 48; }
  }

  const marks = [card.easier ? 'Easy version' : '', ...finishLabels(card)].filter(Boolean);
  if (marks.length) {
    x.fillStyle = '#ffb08f';
    x.font = 'italic 500 32px Literata, Georgia, serif';
    x.fillText(marks.join(' · '), 64, H - 160, W - 128);
  }
  x.fillStyle = 'rgba(255,255,255,0.08)';
  x.fillRect(64, H - 128, W - 128, 2);
  x.font = `700 30px ${SANS}`;
  x.fillStyle = r.color;
  x.fillText(isZero(card) ? 'WHERE IT STARTS' : `${'★'.repeat(card.rarity)}  ${r.name.toUpperCase()}${isFoil(card) ? ' · FOIL' : ''}`, 64, H - 72);
  x.textAlign = 'right';
  x.font = '500 30px Literata, Georgia, serif';
  x.fillStyle = '#a0968a';
  x.fillText(`${fmtDate(card.date)}${card.place ? ' · ' + card.place : ''}`, W - 64, H - 72);
  return c;
}
// A tall 1080x1920 image for Instagram and TikTok Stories: the card over its own blurred photo.
async function renderStoryCanvas(card) {
  const W = 1080, H = 1920;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  const r = isZero(card) ? ZERO_LOOK : RARITY[card.rarity];
  const cardCanvas = await renderCardCanvas(card);
  const url = await photoUrl(card);
  x.fillStyle = '#110f0d';
  x.fillRect(0, 0, W, H);
  if (url) {
    // blur by drawing the photo tiny and scaling it back up; works in every browser
    const img = await loadImg(url);
    const t = document.createElement('canvas');
    t.width = 27; t.height = 48;
    const s = Math.max(t.width / img.naturalWidth, t.height / img.naturalHeight);
    t.getContext('2d').drawImage(img, (t.width - img.naturalWidth * s) / 2, (t.height - img.naturalHeight * s) / 2, img.naturalWidth * s, img.naturalHeight * s);
    x.imageSmoothingEnabled = true;
    x.imageSmoothingQuality = 'high';
    x.drawImage(t, 0, 0, W, H);
    x.fillStyle = 'rgba(17, 15, 13, 0.55)';
    x.fillRect(0, 0, W, H);
  } else {
    const g = x.createRadialGradient(W / 2, H * 0.4, 40, W / 2, H * 0.4, H * 0.7);
    g.addColorStop(0, r.dark); g.addColorStop(1, '#110f0d');
    x.fillStyle = g;
    x.fillRect(0, 0, W, H);
  }
  try { await document.fonts.ready; } catch (e) { /* ignore */ }
  x.textBaseline = 'alphabetic';
  x.font = '900 60px Literata, Georgia, serif';
  const wk = x.measureText('Keep').width, ws = x.measureText('sake').width;
  x.textAlign = 'left';
  x.fillStyle = '#f4efe6'; x.fillText('Keep', W / 2 - (wk + ws) / 2, 170);
  x.fillStyle = '#ff7a45'; x.fillText('sake', W / 2 - (wk + ws) / 2 + wk, 170);

  const cw = 800, chh = Math.round(cw * cardCanvas.height / cardCanvas.width);
  const cy = 240;
  x.save();
  x.shadowColor = 'rgba(0, 0, 0, 0.6)'; x.shadowBlur = 60; x.shadowOffsetY = 30;
  x.drawImage(cardCanvas, (W - cw) / 2, cy, cw, chh);
  x.restore();

  const y = cy + chh;
  x.textAlign = 'center';
  x.fillStyle = '#f4efe6';
  x.font = '900 68px Literata, Georgia, serif';
  x.fillText(card.daredBy ? `Dared by ${card.daredBy}. Done.` : 'I did it.', W / 2, y + 130, W - 120);
  x.font = `400 38px ${SANS}`;
  x.fillStyle = '#d2c9bd';
  x.fillText('Your turn. Find it on Keepsake', W / 2, y + 200, W - 120);
  x.font = `400 30px ${SANS}`;
  x.fillStyle = '#a0968a';
  x.fillText(APP_URL.replace(/^https?:\/\//, '').replace(/\/$/, ''), W / 2, y + 255, W - 120);
  return c;
}
function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
// on phones, hand the image to the share sheet; elsewhere, download it
async function shareImage(canvas, name, text, savedMsg) {
  const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
  try {
    const file = new File([blob], name, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] }) && matchMedia('(pointer: coarse)').matches) {
      await navigator.share({ files: [file], text });
      return;
    }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  download(blob, name);
  toast(savedMsg);
}
async function saveCardImage(card) {
  shareImage(await renderCardCanvas(card), `keepsake-${pad(card.no)}.png`, 'My Keepsake card', 'Card image saved');
}
async function shareStory(card) {
  const ch = state.byId.get(card.challengeId);
  shareImage(await renderStoryCanvas(card), `keepsake-${pad(card.no)}-story.png`,
    `I did "${ch.title}" on Keepsake. Your turn: ${dareLink(ch.id)}`, 'Story image saved');
}

/* ================= events ================= */
function onAction(t) {
  const d = today();
  const card = id => state.cards.find(c => c.id === id);
  switch (t.dataset.act) {
    case 'reroll':
      d.custom = null;
      if (d.idx < d.shown.length - 1) d.idx++;
      else if (d.shown.length - 1 < MAX_REROLLS) { d.shown.push(nextPick()); d.idx++; }
      saveDay();
      renderToday();
      break;
    case 'prev-pick':
      d.custom = null;
      if (d.idx > 0) d.idx--;
      saveDay();
      renderToday();
      break;
    case 'clear-custom':
      d.custom = null;
      saveDay();
      renderToday();
      break;
    case 'pick': {
      if (d.earned) return;
      d.custom = t.dataset.id;
      saveDay();
      closeDeckSheets();
      show('today');
      toast(`${W().Cur} challenge: ${state.byId.get(t.dataset.id).title}`);
      break;
    }
    case 'done':
      if (d.earned || fewCapped()) return;
      closeDeckSheets();
      openProof(t.dataset.id, { kind: 'today', easy: isEasy(d) && currentId(d) === t.dataset.id });
      break;
    case 'claim-prev':
      if (d.prev) openProof(d.prev.id, { kind: 'prev', easy: !!d.prev.easy });
      break;
    case 'busy-unpeek':
      d.busyPeek = false;
      d.custom = null;
      saveDay();
      renderToday();
      break;
    case 'back-to-main':
      d.custom = null;
      d.busyPeek = false;
      saveDay();
      state.welcomeBack = null;
      renderToday();
      break;
    case 'filter-cat':
      closeDeckSheets();
      state.deckFilter = t.dataset.cat;
      state.deckQuery = '';
      show('deck');
      break;
    case 'help':
      openSheet(`
        <h2 class="proof-title">How this works</h2>
        <p><strong>Courage</strong> is how bold your challenges get. You start at 2. Do three challenges at your level and the next level opens up. Easy versions don't count toward it, but they still go in your Book.</p>
        <p><strong>Card colours</strong> come from how much nerve a challenge takes, from Common (grey) to Legendary (gold).</p>
        <p><strong>Foil</strong> is the surprise. Some cards come out foil because of how you did the challenge. You find out when you flip it.</p>
        <p><strong>Secret challenges</strong> are the big ones. They open up as you go. The Deck shows what opens each one.</p>`, 'How this works');
      break;
    case 'zero-make':
      makeDayZero();
      break;
    case 'zero-open':
      state.zeroOpen = true;
      renderToday();
      $('#zero-input').focus();
      break;
    case 'zero-fill':
      openProof(DAY_ZERO.id, { kind: 'zero' });
      break;
    case 'zero-skip':
      state.settings.dayZeroDone = true;
      saveSettings();
      renderToday();
      break;
    case 'busy-set': {
      const len = t.dataset.len;
      state.settings.busyUntil = len === 'open' ? 'open' : dayKey(addDays(new Date(), Number(len) - 1));
      saveSettings();
      closeDeckSheets();
      show('today');
      toast('Got it. No reminders while you\'re busy.');
      break;
    }
    case 'busy-end':
      state.settings.busyUntil = null;
      state.settings.backFrom = dayKey();
      saveSettings();
      state.welcomeBack = 'busy';
      closeDeckSheets();
      show('today');
      break;
    case 'busy-peek':
    case 'start-small':
      d.custom = pickTiny();
      d.busyPeek = true;
      saveDay();
      state.welcomeBack = null;
      renderToday();
      break;
    case 'dismiss-welcome':
      state.welcomeBack = null;
      renderToday();
      break;
    case 'plan-calendar-saved': {
      const p = planFor(t.dataset.id);
      if (p) planCalendarFile(p);
      break;
    }
    case 'easy-on':
      d.easyId = currentId(d);
      saveDay();
      renderToday();
      break;
    case 'easy-off':
      d.easyId = null;
      saveDay();
      renderToday();
      break;
    case 'dismiss-prev':
      d.prev = null;
      saveDay();
      renderToday();
      break;
    case 'settings':
      openSheet(settingsHTML(), 'Settings');
      break;
    case 'onboard-next':
      state.onboardStep++;
      renderToday();
      window.scrollTo(0, 0);
      break;
    case 'onboard-done':
      finishOnboarding();
      break;
    case 'notify-on':
      notifyOn();
      break;
    case 'notify-off':
      state.settings.reminder.notify = false;
      saveSettings();
      syncReminder();
      refreshReminderUI();
      break;
    case 'notify-test':
      showNote("Today's challenge", currentChallenge().title, 'keepsake-test');
      break;
    case 'calendar':
      calendarFile();
      break;
    case 'install':
      if (state.installPrompt) {
        state.installPrompt.prompt();
        state.installPrompt.userChoice.finally(() => { state.installPrompt = null; });
      }
      break;
    case 'take-dare': {
      const dr = state.incomingDare;
      state.incomingDare = null;
      if (!dr) return;
      const ch = state.byId.get(dr.id);
      if (earnedIds().has(dr.id)) toast(`You've already earned ${ch.title}`);
      else if (d.earned) {
        state.settings.pendingDare = dr;
        saveSettings();
        toast(`You've already done ${W().cur}. The dare's up ${W().next}.`);
      } else {
        d.custom = dr.id;
        d.dare = dr;
        saveDay();
        toast(`Dare accepted: ${ch.title}`);
      }
      renderToday();
      window.scrollTo(0, 0);
      break;
    }
    case 'dismiss-dare':
      state.incomingDare = null;
      renderToday();
      break;
    case 'plan':
      openPlanSheet(state.byId.get(t.dataset.id));
      break;
    case 'plan-commit':
      commitPlan(planForm(t.dataset.id));
      break;
    case 'plan-calendar': {
      const p = planForm(t.dataset.id);
      planCalendarFile(p);
      commitPlan(p);
      break;
    }
    case 'plan-tell': {
      const p = planForm(t.dataset.id);
      commitPlan(p);
      tellFriend(p);
      break;
    }
    case 'plan-cancel':
      cancelPlan(t.dataset.id);
      break;
    case 'dare-friend':
      shareDare(state.byId.get(t.dataset.id));
      break;
    case 'share': {
      const c = card(t.dataset.id);
      if (c) openShareSheet(c);
      break;
    }
    case 'share-story': {
      const c = card(t.dataset.id);
      if (c) shareStory(c);
      break;
    }
    case 'share-dare': {
      const c = card(t.dataset.id);
      if (c) shareDare(state.byId.get(c.challengeId), c);
      break;
    }
    case 'reveal': {
      const c = card(t.dataset.id);
      if (c) startReveal(c, { from: activeScreen() });
      break;
    }
    case 'reveal-done': {
      const from = run && run.from;
      const c = run && run.card;
      stage.close();
      if (from === 'zero') {
        show(activeScreen());
        break;
      }
      if (c && (from === 'today' || from === 'prev')) {
        state.justLanded = c.id;
        show('today');
        const k = $('#screen-today .mini-slot button');
        if (k) k.focus();
      } else {
        show(activeScreen());
      }
      toast('Added to your Book');
      break;
    }
    case 'save-img': {
      const c = card(t.dataset.id);
      if (c) saveCardImage(c);
      break;
    }
    case 'edit': {
      const c = card(t.dataset.id);
      if (!c) return;
      stage.close();
      openProof(c.challengeId, { edit: c });
      break;
    }
    case 'close-stage':
      closeStage();
      break;
    case 'delete': {
      const c = card(t.dataset.id);
      if (!c) return;
      if (!t.dataset.armed) {
        t.dataset.armed = '1';
        t.textContent = 'Tap again to delete';
        setTimeout(() => { if (t.isConnected) { delete t.dataset.armed; t.textContent = 'Delete this card'; } }, 3000);
        return;
      }
      state.cards = state.cards.filter(x => x.id !== c.id);
      saveCards();
      if (d.earned === c.id) { d.earned = null; saveDay(); }
      deletePhoto(c.id);
      stage.close();
      show(activeScreen());
      toast(`Card #${pad(c.no)} deleted`);
      break;
    }
  }
}

function bind() {
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-act],[data-goto],[data-filter],[data-open],[data-locked],[data-view],.tab');
    if (!t) return;
    if (t.classList.contains('tab')) return show(t.dataset.screen);
    if (t.dataset.goto) return show(t.dataset.goto);
    if (t.dataset.filter) {
      state.deckFilter = t.dataset.filter;
      document.querySelectorAll('.filter').forEach(b => b.setAttribute('aria-pressed', String(b === t)));
      return renderDeckList();
    }
    if (t.dataset.open) {
      const ch = state.byId.get(t.dataset.open);
      if (ch.secret && !state.settings.seenSecrets.includes(ch.id)) {
        state.settings.seenSecrets.push(ch.id);
        saveSettings();
        updateDeckBadge();
        if ($('#deck-list')) renderDeckList();
      }
      return openSheet((ch.secret ? '<p class="secret-tag">Secret challenge</p>' : '') + questHTML(ch) + deckActions(ch), ch.title);
    }
    if (t.dataset.locked) {
      const ch = state.byId.get(t.dataset.locked);
      const info = unlockInfo(ch);
      return openSheet(`
        <div class="locked-detail">
          ${icon('lock')}
          <h2>Secret challenge</h2>
          <p class="locked-hint">${esc(info.hint)}</p>
          ${unlockLink(ch)}
          ${info.need > 1 ? `<div class="level"><span>${CATS[ch.category].label} · ${info.have} of ${info.need}</span><span class="bar" aria-hidden="true"><i style="width:${(info.have / info.need) * 100}%"></i></span></div>` : ''}
          <p class="sheet-note">Secret challenges are the big ones: weirder, harder, more personal. They open up as you go, or when a friend dares you.</p>
        </div>`, 'Secret challenge');
    }
    if (t.dataset.view) {
      const c = state.cards.find(x => x.id === t.dataset.view);
      closeDeckSheets();
      if (!$('#stage').hidden) stage.close();
      return c && openViewer(c);
    }
    onAction(t);
  });

  document.addEventListener('input', e => {
    if (e.target.id === 'deck-search') { state.deckQuery = e.target.value; renderDeckList(); }
    if (e.target.id === 'set-name') { state.settings.name = e.target.value.trim().slice(0, 24); saveSettings(); }
    if (e.target.id === 'plan-where' || e.target.id === 'plan-obstacle-text') updatePlanPreview();
    if (e.target.id === 'plan-ifthen') { e.target.dataset.edited = '1'; updatePlanPreview(); }
    if (e.target.id === 'zero-input') $('#zero-btn').disabled = !e.target.value.trim();
  });
  document.addEventListener('change', e => {
    const t = e.target;
    const r = state.settings.reminder;
    if (t.name === 'plan-obstacle') pickObstacle(t.value);
    else if (t.name === 'plan-quick') { $('#plan-time').value = t.value; updatePlanPreview(); }
    else if (t.id === 'plan-time') {
      document.querySelectorAll('input[name="plan-quick"]').forEach(q => { q.checked = q.value === t.value; });
      updatePlanPreview();
    }
    else if (t.name === 'plan-day') updatePlanPreview();
    else if (t.dataset.pref) {
      state.settings.prefs[t.dataset.pref] = t.value;
      saveSettings();
      if (t.dataset.pref === 'pace' && state.settings.onboarded) renderToday(); // a new rhythm starts a new period
    }
    else if (t.id === 'reminder-time' && t.value) { r.time = t.value; saveSettings(); syncReminder(); }
    else if (t.id === 'reminder-evening') { r.evening = t.checked; saveSettings(); syncReminder(); }
  });

  // tapping anywhere during the reveal skips to the finished card
  $('#stage').addEventListener('click', e => {
    if (!run || !run.started || run.done) return;
    if (performance.now() - run.startedAt < 400) return;
    if (e.target.closest('.sound-btn, .stage-actions')) return;
    finishReveal(run);
  });
  $('#sound-btn').addEventListener('click', () => {
    state.settings.sound = !state.settings.sound;
    saveSettings();
    syncSoundBtn();
  });

  $('#proof').addEventListener('click', e => {
    if (e.target.id === 'proof' || e.target.closest('[data-close]')) closeProof();
  });
  $('#photo-btn').addEventListener('click', () => $('#photo-input').click());
  $('#photo-input').addEventListener('change', async e => {
    const f = e.target.files && e.target.files[0];
    const p = state.pending;
    if (!f || !p) return;
    try {
      const blob = await resizeImage(f);
      p.blob = blob;
      if (p.ownUrl) URL.revokeObjectURL(p.previewUrl);
      p.previewUrl = URL.createObjectURL(blob);
      p.ownUrl = true;
    } catch (err) {
      toast("That file didn't open as an image. Try a JPG or PNG.");
    }
    updateProof();
  });
  $('#story-input').addEventListener('input', updateProof);
  $('#place-input').addEventListener('input', updateProof);
  $('#seal-btn').addEventListener('click', seal);

  document.addEventListener('pointerdown', () => { state.keyboard = false; });
  document.addEventListener('keydown', e => {
    if (e.key === 'Tab' || e.key === 'Enter') state.keyboard = true;
    const stageOpen = !$('#stage').hidden;
    if (e.key === 'Escape') {
      const over = document.querySelectorAll('.deck-sheet');
      if (over.length) return over[over.length - 1].close();
      if (stageOpen) {
        if (run && !run.done) finishReveal(run); // Esc skips straight to the card
        else if ($('#stage-actions').classList.contains('show')) {
          const done = $('[data-act="reveal-done"]');
          if (done) done.click(); else closeStage();
        }
        return;
      }
      const sheets = document.querySelectorAll('.deck-sheet');
      if (sheets.length) return sheets[sheets.length - 1].close();
      if (!$('#proof').hidden) closeProof();
      return;
    }
    if (e.key === 'Tab') {
      const sheets = document.querySelectorAll('.deck-sheet .sheet-panel');
      const scope = sheets.length ? sheets[sheets.length - 1]
        : stageOpen ? $('#stage') : (!$('#proof').hidden && $('#proof .sheet-panel'));
      if (!scope) return;
      const f = [...scope.querySelectorAll('button:not([disabled]), input, textarea, summary, [tabindex="0"]')].filter(x => x.offsetParent !== null || x === document.activeElement);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || !scope.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !scope.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
    }
  });
}

/* ================= boot ================= */
async function boot() {
  bind();
  try {
    const res = await fetch('data/challenges.json');
    // retired challenges stay loadable so cards already earned still show, but never come up again
    const all = await res.json();
    all.forEach(c => state.byId.set(c.id, c));
    state.challenges = all.filter(c => !c.retired);
  } catch (e) {
    $('#screen-today').innerHTML = '<p class="empty-list">Couldn\'t load the challenges. Check your connection and try again.</p>';
    return;
  }
  state.byId.set(DAY_ZERO.id, DAY_ZERO);

  // dare links look like ?dare=<challenge id>&from=<first name>
  const qs = new URLSearchParams(location.search);
  const dareId = qs.get('dare');
  if (dareId && state.challenges.some(c => c.id === dareId)) state.incomingDare = { id: dareId, from: (qs.get('from') || '').trim().slice(0, 24) };
  if (location.search) history.replaceState(null, '', location.pathname);
  if (!state.settings.onboarded && state.cards.length) { state.settings.onboarded = true; saveSettings(); }

  // coming back after a while gets a warm welcome, never a count of the days
  const last = state.settings.lastOpen;
  if (last && daysBetween(last, dayKey()) >= 5 && !state.welcomeBack) state.welcomeBack = 'gap';
  state.settings.lastOpen = dayKey();
  saveSettings();
  // answers given on notification buttons while the app was closed
  try {
    const inbox = await idbDo('readonly', st => st.get('inbox'), 'meta');
    if (inbox && inbox.busyUntil && !isBusy()) {
      state.settings.busyUntil = inbox.busyUntil;
      saveSettings();
      state.welcomeBack = null;
    }
    if (inbox) await idbDo('readwrite', st => st.delete('inbox'), 'meta');
  } catch (e) { /* no IndexedDB */ }

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    state.installPrompt = e;
  });
  renderToday();
  updateDeckBadge();
}
boot();

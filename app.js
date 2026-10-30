'use strict';

/* ================= constants ================= */
const RARITY = [null,
  { name: 'Common',    color: '#a7b0bc', light: '#e3e8ee', dark: '#4f5763' },
  { name: 'Uncommon',  color: '#3ecf8e', light: '#b6f5d6', dark: '#13633f' },
  { name: 'Rare',      color: '#4da3ff', light: '#c2e0ff', dark: '#174a85' },
  { name: 'Epic',      color: '#b56cff', light: '#e6ccff', dark: '#4b1d82' },
  { name: 'Legendary', color: '#ffc53d', light: '#fff1b8', dark: '#8a5a00' },
];
const CATS = {
  social:   { label: 'Social',   icon: '💬' },
  body:     { label: 'Body',     icon: '💪' },
  creative: { label: 'Creative', icon: '🎨' },
  explore:  { label: 'Explore',  icon: '🧭' },
  mind:     { label: 'Mind',     icon: '🧠' },
  kindness: { label: 'Kindness', icon: '💛' },
};
const COST = { free: 'Free', '$': 'Small spend', '$$': 'Treat yourself' };
const MAX_REROLLS = 2;

/* ================= helpers ================= */
const $ = (s, el = document) => el.querySelector(s);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(3, '0');
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const vibrate = p => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) { /* unsupported */ } };

function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function fmtDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtMinutes(m) {
  if (m < 60) return `${m} min`;
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
        const r = indexedDB.open('keepsake', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('photos');
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      } catch (e) { rej(e); }
    });
  }
  return dbPromise;
}
async function idbDo(mode, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const tx = d.transaction('photos', mode);
    const req = fn(tx.objectStore('photos'));
    tx.oncomplete = () => res(req && req.result);
    tx.onerror = () => rej(tx.error);
  });
}
async function putPhoto(key, blob) {
  memPhotos.set(key, blob);
  try { await idbDo('readwrite', s => s.put(blob, key)); } catch (e) { /* memory only */ }
}
async function getPhoto(key) {
  if (memPhotos.has(key)) return memPhotos.get(key);
  try { return await idbDo('readonly', s => s.get(key)); } catch (e) { return null; }
}
async function deletePhoto(key) {
  memPhotos.delete(key);
  try { await idbDo('readwrite', s => s.delete(key)); } catch (e) { /* ignore */ }
}
const photoUrls = new Map();
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
  deckFilter: 'all',
  pending: null, // { challengeId, fromToday, blob }
};
const saveCards = () => store.set('ks.cards', state.cards);
const saveDay = () => store.set('ks.day', state.day);
const earnedIds = () => new Set(state.cards.map(c => c.challengeId));

function today() {
  const key = dayKey();
  if (!state.day || state.day.date !== key) {
    state.day = { date: key, shown: [], earned: null };
    state.day.shown.push(nextPick());
    saveDay();
  }
  return state.day;
}
function nextPick() {
  const d = state.day;
  const done = earnedIds();
  let pool = state.challenges.filter(c => !done.has(c.id) && !d.shown.includes(c.id));
  if (!pool.length) pool = state.challenges.filter(c => !d.shown.includes(c.id));
  if (!pool.length) pool = state.challenges;
  pool.sort((a, b) => hash(d.date + a.id) - hash(d.date + b.id));
  return pool[0].id;
}
function currentChallenge() {
  const d = today();
  return state.byId.get(d.shown[d.shown.length - 1]) || state.challenges[0];
}

/* ================= rendering: quest ================= */
function questHTML(ch, { rerolls = null } = {}) {
  const r = RARITY[ch.courage];
  const cat = CATS[ch.category];
  return `
  <article class="quest">
    <div class="quest-head">
      <span class="chip">${cat.icon} ${cat.label}</span>
      <span class="drop" style="--rc:${r.color}"><i></i>${r.name} drop</span>
    </div>
    <h2>${esc(ch.title)}</h2>
    <p class="prompt">${esc(ch.prompt)}</p>
    <p class="why">${esc(ch.why)}</p>
    <div class="meta">
      <span class="chip">⏱ ${fmtMinutes(ch.minutes)}</span>
      <span class="chip">${ch.cost === 'free' ? '✦' : '💸'} ${COST[ch.cost]}</span>
      <span class="chip">${ch.solo ? '🙋 Solo' : '👥 Bring someone'}</span>
    </div>
    ${ch.safety ? `<div class="safety">⚠︎ ${esc(ch.safety)}</div>` : ''}
    <details class="easier"><summary>Too much today? Easier version</summary><p>${esc(ch.easier)}</p></details>
  </article>
  <div class="btn-row">
    ${rerolls !== null ? `<button class="btn ghost" data-act="reroll" ${rerolls <= 0 ? 'disabled' : ''}>↻ Another (${rerolls})</button>` : ''}
    <button class="btn primary" data-act="done" data-id="${ch.id}">I did it ✦</button>
  </div>`;
}

/* ================= rendering: keepsake card ================= */
function cardHTML(card, url, cls = '') {
  const ch = state.byId.get(card.challengeId) || { title: 'Lost challenge', category: 'mind' };
  const r = RARITY[card.rarity];
  const cat = CATS[ch.category];
  const photo = url
    ? `<div class="kf-photo" style="background-image:url('${url}')"></div>`
    : `<div class="kf-photo empty">${cat.icon}</div>`;
  return `
  <div class="kcard r${card.rarity} ${cls}" data-card="${card.id}">
    <div class="kcard-inner">
      <div class="kcard-face kcard-back"><div class="sigil">✦<small>KEEPSAKE</small></div></div>
      <div class="kcard-face kcard-front">
        <div class="kf">
          <div class="kf-top"><span>${cat.icon} ${cat.label.toUpperCase()}</span><span class="kf-no">#${pad(card.no)}</span></div>
          ${photo}
          <div class="kf-body">
            <p class="kf-title">${esc(ch.title)}</p>
            ${card.story ? `<p class="kf-story">“${esc(card.story)}”</p>` : ''}
          </div>
          <div class="kf-foot">
            <span class="kf-rarity">${'★'.repeat(card.rarity)}<span class="rn"> ${r.name}</span></span>
            <span class="kf-date">${fmtDate(card.date)}${card.place ? ' · ' + esc(card.place) : ''}</span>
          </div>
        </div>
        <div class="holo"></div>
      </div>
    </div>
  </div>`;
}

function attachTilt(el) {
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
      <span class="topbar-meta">${new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</span>
    </header>`;
  const earned = d.earned && state.cards.find(c => c.id === d.earned);
  if (earned) {
    el.innerHTML = `${header}
      <div class="done-today">
        <p class="eyebrow">Today's card is in your book</p>
        <div class="mini-slot"></div>
        <h2>See you tomorrow.</h2>
        <p>A new challenge unlocks in <span class="countdown" id="countdown"></span></p>
        <button class="btn" data-goto="deck">Hungry for more? Browse the deck</button>
      </div>`;
    photoUrl(earned).then(url => {
      const slot = $('.mini-slot', el);
      if (!slot) return;
      slot.innerHTML = cardHTML(earned, url, 'static');
      attachTilt(slot.firstElementChild);
      slot.firstElementChild.addEventListener('click', () => openViewer(earned));
    });
    tickCountdown();
  } else {
    el.innerHTML = `${header}<p class="eyebrow">Today's challenge</p>${questHTML(currentChallenge(), { rerolls: MAX_REROLLS - (d.shown.length - 1) })}`;
  }
}

function renderDeck() {
  const el = $('#screen-deck');
  const done = earnedIds();
  const f = state.deckFilter;
  const list = state.challenges.filter(c => f === 'all' || (f === 'todo' ? !done.has(c.id) : c.category === f));
  const filters = [['all', 'All'], ['todo', 'Not done yet'], ...Object.entries(CATS).map(([k, v]) => [k, `${v.icon} ${v.label}`])];
  el.innerHTML = `
    <header class="topbar"><h1 class="logo">The Deck</h1><span class="topbar-meta">${done.size} / ${state.challenges.length} done</span></header>
    <div class="filters">${filters.map(([k, l]) => `<button class="filter ${k === f ? 'on' : ''}" data-filter="${k}">${l}</button>`).join('')}</div>
    <div class="deck-list">
      ${list.map(c => `
        <button class="deck-item ${done.has(c.id) ? 'earned' : ''}" data-open="${c.id}" style="--rc:${RARITY[c.courage].color}">
          <span class="ico">${CATS[c.category].icon}</span>
          <span class="txt"><span class="t">${esc(c.title)}</span><br><span class="s">${esc(c.prompt)}</span></span>
          <span class="pip" title="${RARITY[c.courage].name}"></span>
        </button>`).join('')}
    </div>`;
}

async function renderBook() {
  const el = $('#screen-book');
  const cards = [...state.cards].sort((a, b) => b.no - a.no);
  const counts = [0, 0, 0, 0, 0, 0];
  cards.forEach(c => counts[c.rarity]++);
  const done = earnedIds();
  const catTotals = {};
  state.challenges.forEach(c => {
    catTotals[c.category] = catTotals[c.category] || { total: 0, done: 0 };
    catTotals[c.category].total++;
    if (done.has(c.id)) catTotals[c.category].done++;
  });
  const urls = await Promise.all(cards.map(photoUrl));
  const slots = Math.max(0, Math.max(6, Math.ceil((cards.length + 1) / 3) * 3) - cards.length);
  el.innerHTML = `
    <header class="topbar"><h1 class="logo">Your Book</h1><span class="topbar-meta">${cards.length} card${cards.length === 1 ? '' : 's'}</span></header>
    <div class="stats">
      ${RARITY.slice(1).map((r, i) => `<div class="stat" style="--rc:${r.color}"><b>${counts[i + 1]}</b><span>${r.name}</span></div>`).join('')}
    </div>
    <div class="cat-progress">
      ${Object.entries(CATS).map(([k, v]) => {
        const t = catTotals[k] || { total: 0, done: 0 };
        return `<div class="cp">${v.icon} ${v.label} <b>${t.done}/${t.total}</b><div class="bar"><i style="width:${t.total ? (t.done / t.total) * 100 : 0}%"></i></div></div>`;
      }).join('')}
    </div>
    ${cards.length ? '' : `<div class="empty-book"><h3>Your book is empty.</h3><p>Every challenge you complete becomes a card here: your photo, your words, forever.</p></div>`}
    <div class="grid">
      ${cards.map((c, i) => `<button class="cardbtn" data-view="${c.id}" aria-label="Card ${c.no}">${cardHTML(c, urls[i], 'static small')}</button>`).join('')}
      ${'<div class="slot">✦</div>'.repeat(slots)}
    </div>`;
}

function show(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === `screen-${name}`));
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.screen === name));
  ({ today: renderToday, deck: renderDeck, book: renderBook })[name]();
  window.scrollTo(0, 0);
}

let countdownTimer = null;
function tickCountdown() {
  clearInterval(countdownTimer);
  const upd = () => {
    const el = $('#countdown');
    if (!el) { clearInterval(countdownTimer); return; }
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    if (dayKey(now) !== state.day.date) { renderToday(); return; }
    const s = Math.floor((next - now) / 1000);
    el.textContent = `${Math.floor(s / 3600)}h ${String(Math.floor(s / 60) % 60).padStart(2, '0')}m ${String(s % 60).padStart(2, '0')}s`;
  };
  upd();
  countdownTimer = setInterval(upd, 1000);
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), 2400);
}

/* ================= generic sheet (deck detail) ================= */
function openSheet(html) {
  const sh = document.createElement('div');
  sh.className = 'sheet';
  sh.innerHTML = `<div class="sheet-panel" role="dialog" aria-modal="true"><button class="sheet-close" data-close aria-label="Close">✕</button>${html}</div>`;
  sh.addEventListener('click', e => { if (e.target === sh || e.target.closest('[data-close]')) sh.remove(); });
  document.body.appendChild(sh);
  return sh;
}

/* ================= proof flow ================= */
function openProof(challengeId, fromToday) {
  const ch = state.byId.get(challengeId);
  state.pending = { challengeId, fromToday, blob: null };
  $('#proof-title').textContent = ch.title;
  $('#story-input').value = '';
  $('#place-input').value = '';
  $('#easier-input').checked = false;
  $('#easier-row').hidden = ch.courage <= 1;
  $('#photo-preview').hidden = true;
  $('.photo-empty').hidden = false;
  $('#photo-input').value = '';
  updateSeal();
  $('#proof').hidden = false;
}
function closeProof() { $('#proof').hidden = true; }
function updateSeal() {
  const p = state.pending;
  $('#seal-btn').disabled = !(p && (p.blob || $('#story-input').value.trim()));
}

async function seal() {
  const p = state.pending;
  if (!p) return;
  const ch = state.byId.get(p.challengeId);
  const easier = $('#easier-input').checked && ch.courage > 1;
  const card = {
    id: uid(),
    no: state.cards.reduce((m, c) => Math.max(m, c.no), 0) + 1,
    challengeId: ch.id,
    rarity: easier ? ch.courage - 1 : ch.courage,
    easier,
    story: $('#story-input').value.trim(),
    place: $('#place-input').value.trim(),
    date: new Date().toISOString(),
    photo: !!p.blob,
  };
  if (p.blob) await putPhoto(card.id, p.blob);
  state.cards.push(card);
  saveCards();
  if (p.fromToday) { today().earned = card.id; saveDay(); }
  state.pending = null;
  closeProof();
  startReveal(card);
}

/* ================= audio ================= */
let actx = null;
function audio() {
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
function whoosh() {
  const a = audio();
  if (!a) return;
  const len = a.sampleRate * 0.5;
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  src.buffer = buf;
  f.type = 'bandpass';
  f.frequency.setValueAtTime(400, a.currentTime);
  f.frequency.exponentialRampToValueAtTime(4000, a.currentTime + 0.4);
  g.gain.value = 0.25;
  src.connect(f).connect(g).connect(a.destination);
  src.start();
}
const tick = step => tone(330 * Math.pow(2, (step * 4) / 12), 0, 0.14, 'triangle', 0.14);
function fanfare(r) {
  const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98];
  for (let i = 0; i <= r; i++) tone(notes[i], i * 0.07, 0.7, 'triangle', 0.1);
  const end = (r + 1) * 0.07;
  [523.25, 659.25, 783.99].forEach(f => tone(f * (r >= 4 ? 2 : 1), end, 1.4, 'sine', 0.06));
  if (r >= 3) for (let i = 0; i < 8; i++) tone(2093 + Math.random() * 1500, end + 0.1 + i * 0.08, 0.25, 'sine', 0.03);
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
function spawn(x, y, r, n, { spread = Math.PI * 2, dir = 0, speed = [4, 15], rain = false } = {}) {
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
      s: 3 + Math.random() * 6, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
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
  const n = [0, 40, 70, 120, 180, 260][r];
  spawn(x, y, r, n);
  if (r >= 2) setTimeout(() => { spawn(0, fx.h * 0.75, r, n / 3, { dir: -Math.PI / 3, spread: 0.6, speed: [10, 20] }); spawn(fx.w, fx.h * 0.75, r, n / 3, { dir: -Math.PI * 2 / 3, spread: 0.6, speed: [10, 20] }); }, 250);
  if (r >= 4) setTimeout(() => spawn(x, y, r, n / 2, { speed: [8, 18] }), 450);
  if (r >= 5) {
    let k = 0;
    clearInterval(fx.rain);
    fx.rain = setInterval(() => {
      for (let i = 0; i < 6; i++) spawn(Math.random() * fx.w, -10, r, 1, { dir: Math.PI / 2, spread: 0.4, speed: [1, 3], rain: true });
      if (++k > 60) clearInterval(fx.rain);
    }, 50);
  }
}
function flash(color) {
  const f = document.createElement('div');
  f.className = 'flash';
  f.style.setProperty('--flash', color);
  document.body.appendChild(f);
  setTimeout(() => f.remove(), 600);
}

/* ================= stage: reveal + viewer ================= */
const stage = {
  el: () => $('#stage'),
  open() {
    $('#stage').hidden = false;
    $('.rays').classList.remove('on');
    $('#rarity-banner').className = 'rarity-banner';
    $('#rarity-banner').textContent = '';
    $('#stage-actions').className = 'stage-actions';
    $('#stage-actions').innerHTML = '';
    $('#stage-hint').hidden = true;
    document.body.style.overflow = 'hidden';
  },
  close() {
    $('#stage').hidden = true;
    clearInterval(fx.rain);
    fx.parts = [];
    document.body.style.overflow = '';
  },
};

async function startReveal(card) {
  const url = await photoUrl(card);
  stage.open();
  const slot = $('#stage-card-slot');
  slot.innerHTML = cardHTML(card, url, 'mystery waiting');
  const el = slot.firstElementChild;
  el.style.setProperty('--rc', '#d8cfe6');
  $('#stage-hint').hidden = false;
  $('#stage-hint').textContent = 'Tap to reveal';
  el.addEventListener('click', () => reveal(card, el, url), { once: true });
}

async function reveal(card, el, url) {
  audio();
  const r = card.rarity;
  const rc = RARITY[r];
  $('#stage-hint').hidden = true;
  el.classList.remove('waiting');
  const stepMs = 420;
  el.style.setProperty('--shake-dur', `${r * stepMs + 150}ms`);
  el.classList.add('charging');
  // climb through the rarity tiers: the longer it climbs, the bigger the pull
  for (let i = 1; i <= r; i++) {
    el.style.setProperty('--rc', RARITY[i].color);
    tick(i);
    vibrate(15 + i * 12);
    await sleep(stepMs);
  }
  el.classList.remove('charging', 'mystery');
  whoosh();
  el.classList.add('flipped');
  await sleep(380);

  const b = el.getBoundingClientRect();
  flash(r >= 4 ? rc.light : '#ffffff');
  celebrate(r, b.left + b.width / 2, b.top + b.height / 2);
  fanfare(r);
  vibrate(r >= 4 ? [60, 40, 60, 40, 200] : [40, 30, 90]);
  const rays = $('.rays');
  rays.style.setProperty('--ray', rc.color);
  rays.classList.toggle('on', r >= 3);
  const banner = $('#rarity-banner');
  banner.style.setProperty('--rc', rc.color);
  banner.textContent = rc.name;
  banner.classList.add('show');

  await sleep(500);
  // swap to a tiltable static card
  const slot = $('#stage-card-slot');
  slot.innerHTML = cardHTML(card, url, 'static revealed');
  attachTilt(slot.firstElementChild);
  const actions = $('#stage-actions');
  actions.innerHTML = `
    <button class="btn" data-act="save-img" data-id="${card.id}">⤓ Save image</button>
    <button class="btn primary" data-act="to-book">Add to my Book</button>`;
  actions.classList.add('show');
}

async function openViewer(card) {
  const url = await photoUrl(card);
  stage.open();
  const r = RARITY[card.rarity];
  const slot = $('#stage-card-slot');
  slot.innerHTML = cardHTML(card, url, 'static revealed');
  attachTilt(slot.firstElementChild);
  const banner = $('#rarity-banner');
  banner.style.setProperty('--rc', r.color);
  banner.textContent = r.name;
  banner.classList.add('show');
  $('.rays').style.setProperty('--ray', r.color);
  $('.rays').classList.toggle('on', card.rarity >= 4);
  const actions = $('#stage-actions');
  actions.innerHTML = `
    <button class="btn ghost" data-act="delete" data-id="${card.id}">Delete</button>
    <button class="btn" data-act="save-img" data-id="${card.id}">⤓ Save image</button>
    <button class="btn primary" data-act="close-stage">Close</button>`;
  actions.classList.add('show');
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
async function renderCardCanvas(card) {
  try { await document.fonts.ready; } catch (e) { /* ignore */ }
  const W = 1080, H = 1512;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  const ch = state.byId.get(card.challengeId);
  const r = RARITY[card.rarity];
  const cat = CATS[ch.category];

  const g = x.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, r.light); g.addColorStop(0.4, r.color); g.addColorStop(1, r.dark);
  roundRect(x, 0, 0, W, H, 54); x.fillStyle = g; x.fill();
  roundRect(x, 28, 28, W - 56, H - 56, 34); x.fillStyle = '#15121c'; x.fill();

  x.textBaseline = 'alphabetic';
  x.font = '700 30px Inter, sans-serif';
  x.fillStyle = '#b9b1c6';
  x.textAlign = 'left';
  x.fillText(`${cat.icon}  ${cat.label.toUpperCase()}`, 64, 92);
  x.textAlign = 'right';
  x.fillStyle = r.color;
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
    pg.addColorStop(0, r.color); pg.addColorStop(1, '#15121c');
    x.fillStyle = pg; x.fillRect(px, py, pw, ph);
    x.font = '220px serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(cat.icon, px + pw / 2, py + ph / 2);
    x.textBaseline = 'alphabetic';
  }
  if (card.rarity >= 3) {
    const sheen = x.createLinearGradient(px, py, px + pw, py + ph);
    sheen.addColorStop(0.35, 'rgba(255,255,255,0)'); sheen.addColorStop(0.5, 'rgba(255,255,255,0.22)'); sheen.addColorStop(0.65, 'rgba(255,255,255,0)');
    x.fillStyle = sheen; x.fillRect(px, py, pw, ph);
  }
  x.restore();

  x.textAlign = 'left';
  x.fillStyle = '#f4efe6';
  x.font = '900 72px Fraunces, Georgia, serif';
  let y = py + ph + 92;
  for (const line of wrap(x, ch.title, W - 128, 2)) { x.fillText(line, 64, y); y += 74; }
  if (card.story) {
    x.fillStyle = '#b9b1c6';
    x.font = 'italic 500 38px Fraunces, Georgia, serif';
    y += 4;
    for (const line of wrap(x, `“${card.story}”`, W - 128, 2)) { x.fillText(line, 64, y); y += 48; }
  }

  x.fillStyle = 'rgba(255,255,255,0.08)';
  x.fillRect(64, H - 128, W - 128, 2);
  x.font = '800 30px Inter, sans-serif';
  x.fillStyle = r.color;
  x.fillText(`${'★'.repeat(card.rarity)}  ${r.name.toUpperCase()}`, 64, H - 72);
  x.textAlign = 'right';
  x.font = '500 28px Inter, sans-serif';
  x.fillStyle = '#7d7590';
  x.fillText(`${fmtDate(card.date)}${card.place ? ' · ' + card.place : ''}`, W - 64, H - 72);
  return c;
}
async function saveCardImage(card) {
  const c = await renderCardCanvas(card);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  const name = `keepsake-${pad(card.no)}.png`;
  try {
    const file = new File([blob], name, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] }) && matchMedia('(pointer: coarse)').matches) {
      await navigator.share({ files: [file], title: 'My Keepsake card' });
      return;
    }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast('Card image saved');
}

/* ================= events ================= */
function bind() {
  document.addEventListener('click', async e => {
    const t = e.target.closest('[data-act],[data-goto],[data-filter],[data-open],[data-view],.tab');
    if (!t) return;
    if (t.classList.contains('tab')) return show(t.dataset.screen);
    if (t.dataset.goto) return show(t.dataset.goto);
    if (t.dataset.filter) { state.deckFilter = t.dataset.filter; return renderDeck(); }
    if (t.dataset.open) {
      const ch = state.byId.get(t.dataset.open);
      return openSheet(`<p class="eyebrow">From the deck</p>${questHTML(ch)}`);
    }
    if (t.dataset.view) return openViewer(state.cards.find(c => c.id === t.dataset.view));
    switch (t.dataset.act) {
      case 'reroll': {
        const d = today();
        if (d.shown.length - 1 >= MAX_REROLLS) return;
        d.shown.push(nextPick());
        saveDay();
        renderToday();
        break;
      }
      case 'done': {
        const id = t.dataset.id;
        const d = today();
        document.querySelectorAll('.sheet:not(#proof)').forEach(s => s.remove());
        openProof(id, !d.earned && d.shown[d.shown.length - 1] === id);
        break;
      }
      case 'save-img': {
        const card = state.cards.find(c => c.id === t.dataset.id);
        if (card) saveCardImage(card);
        break;
      }
      case 'to-book':
        stage.close();
        show('book');
        toast('Sealed in your Book ✦');
        break;
      case 'close-stage':
        stage.close();
        break;
      case 'delete': {
        const card = state.cards.find(c => c.id === t.dataset.id);
        if (!card || !confirm(`Delete card #${pad(card.no)}? This can't be undone.`)) return;
        state.cards = state.cards.filter(c => c.id !== card.id);
        saveCards();
        if (state.day && state.day.earned === card.id) { state.day.earned = null; saveDay(); }
        deletePhoto(card.id);
        stage.close();
        show($('.tab.active').dataset.screen);
        break;
      }
    }
  });

  $('#proof').addEventListener('click', e => {
    if (e.target.id === 'proof' || e.target.closest('[data-close]')) closeProof();
  });
  $('#photo-input').addEventListener('change', async e => {
    const f = e.target.files && e.target.files[0];
    if (!f || !state.pending) return;
    try {
      const blob = await resizeImage(f);
      state.pending.blob = blob;
      const prev = $('#photo-preview');
      if (prev.src) URL.revokeObjectURL(prev.src);
      prev.src = URL.createObjectURL(blob);
      prev.hidden = false;
      $('.photo-empty').hidden = true;
    } catch (err) {
      toast('Could not read that image');
    }
    updateSeal();
  });
  $('#story-input').addEventListener('input', updateSeal);
  $('#seal-btn').addEventListener('click', seal);
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!$('#proof').hidden) closeProof();
    else if (!$('#stage').hidden && $('#stage-actions').classList.contains('show')) stage.close();
  });
}

/* ================= boot ================= */
async function boot() {
  bind();
  try {
    const res = await fetch('data/challenges.json');
    state.challenges = await res.json();
  } catch (e) {
    $('#screen-today').innerHTML = '<p class="empty-book">Could not load challenges. Serve this folder over http(s).</p>';
    return;
  }
  state.challenges.forEach(c => state.byId.set(c.id, c));
  renderToday();
}
boot();

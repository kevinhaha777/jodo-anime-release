/* jodo-anime-hub 前端：單頁 App（hash 路由）＋ 方向鍵／手把操作 ＋ YouTube 嵌入播放器 */
'use strict';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const main = $('#main');
const qEl = $('#q');

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const thumb = (id, q = 'mqdefault') => `https://i.ytimg.com/vi/${encodeURIComponent(id)}/${q}.jpg`;
const enc = encodeURIComponent;

function fmtTime(sec) {
  sec = Math.max(0, Math.round(sec || 0));
  const h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, s = sec % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0');
}
function fmtDate(ymd) {  // YYYYMMDD 或 YYYYMMDDHHMM（動畫瘋有到分鐘）
  if (!ymd || ymd.length < 8) return '';
  const d = `${ymd.slice(0, 4)}/${ymd.slice(4, 6)}/${ymd.slice(6, 8)}`;
  return ymd.length >= 12 ? `${d} ${ymd.slice(8, 10)}:${ymd.slice(10, 12)}` : d;
}
function timeAgo(ts) {
  const m = Math.floor((Date.now() / 1000 - ts) / 60);
  if (m < 1) return '剛剛';
  if (m < 60) return m + ' 分鐘前';
  const h = Math.floor(m / 60);
  if (h < 24) return h + ' 小時前';
  const d = Math.floor(h / 24);
  return d < 30 ? d + ' 天前' : Math.floor(d / 30) + ' 個月前';
}

// 靜態網站版（GitHub Pages）：沒有 server，改由 local-api.js 在瀏覽器裡處理
const STATIC = !!window.STATIC_MODE;
async function api(path, body) {
  if (STATIC) return window.localApi(path, body);
  const opt = body === undefined ? { cache: 'no-store' }
    : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
  const r = await fetch(path, opt);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || r.statusText);
  return data;
}

let toastTimer = 0;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
}

function store(k, v) { try { localStorage.setItem('ah_' + k, JSON.stringify(v)); } catch (e) { /* 私密模式 */ } }
function recall(k, d) { try { const v = localStorage.getItem('ah_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }

/* ================================================================ 熱鍵（可在設定重新綁定） */
const ACTIONS = [
  ['up', '上 / 音量＋'], ['down', '下 / 音量－'], ['left', '左 / 倒退 10 秒'], ['right', '右 / 快轉 10 秒'],
  ['select', '確認 / 播放暫停'], ['back', '返回'], ['tabPrev', '上一個分頁 / 上一集'], ['tabNext', '下一個分頁 / 下一集'],
  ['search', '搜尋'], ['settings', '設定'], ['play', '播放暫停（播放器）'], ['fullscreen', '全螢幕（播放器）'],
];
const DEFAULT_KEYS = {
  up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', select: 'Enter', back: 'Escape',
  tabPrev: 'l', tabNext: 'r', search: '/', settings: 'c', play: ' ', fullscreen: 'f',
};
const DEFAULT_PADS = {
  up: 12, down: 13, left: 14, right: 15, select: 0, back: 1, tabPrev: 4, tabNext: 5,
  search: 3, settings: 9, play: null, fullscreen: 2,
};
let KEYS = { ...DEFAULT_KEYS, ...recall('keys', {}) };
let PADS = { ...DEFAULT_PADS, ...recall('pads', {}) };
const PAD_NAMES = { 0: 'A', 1: 'B', 2: 'X', 3: 'Y', 4: 'LB', 5: 'RB', 6: 'LT', 7: 'RT', 8: 'View', 9: 'Menu',
  10: 'L3', 11: 'R3', 12: 'D▲', 13: 'D▼', 14: 'D◀', 15: 'D▶', 16: 'Guide' };
function keyLabel(k) {
  if (k == null || k === '') return '—';
  return ({ ' ': 'Space', ArrowUp: '▲', ArrowDown: '▼', ArrowLeft: '◀', ArrowRight: '▶', Escape: 'Esc' }[k])
    || (k.length === 1 ? k.toUpperCase() : k);
}
const padLabel = i => (i == null ? '—' : (PAD_NAMES[i] || 'B' + i));
function actionOfKey(key) {
  const k = key.length === 1 ? key.toLowerCase() : key;
  return Object.keys(KEYS).find(a => {
    const v = KEYS[a];
    return v != null && (v.length === 1 ? v.toLowerCase() : v) === k;
  });
}

let inputMode = 'kb';
function markInput(mode) {
  if (inputMode === mode) return;
  inputMode = mode;
  $('#devbadge').textContent = mode === 'pad' ? '🎮' : '⌨';
  updateHint();
}
function updateHint() {
  const kb = inputMode !== 'pad';
  const g = a => (kb ? keyLabel(KEYS[a]) : padLabel(PADS[a]));
  if (P.open) {
    const play = kb ? `${keyLabel(KEYS.play)}/${g('select')}` : g('select');
    $('#pHint').textContent = `${play} 播放暫停 · ${g('left')}${g('right')} 10 秒 · ${g('up')}${g('down')} 音量 · `
      + `${g('tabPrev')}/${g('tabNext')} 上一集／下一集 · ${g('fullscreen')} 全螢幕 · ${g('back')} 返回`;
  } else {
    $('#hintbar').textContent = `${g('up')}${g('down')}${g('left')}${g('right')} 移動 · ${g('select')} 開啟 · `
      + `${g('back')} 返回 · ${g('tabPrev')}/${g('tabNext')} 分頁 · ${g('search')} 搜尋`;
  }
}

/* ================================================================ 選取框（方向鍵／手把） */
let focused = null;
const focusMemory = {};  // 每個頁面記住上次選到哪個（data-key）

function scopeEl() { return settingsOpen ? $('#cfgpanel') : document; }
function focusables() {
  return $$('.focusable', scopeEl()).filter(el => el.offsetParent !== null || el === qEl);
}
function setFocus(el, scroll = true) {
  if (focused) focused.classList.remove('focused');
  focused = el || null;
  if (!focused) return;
  focused.classList.add('focused');
  if (!settingsOpen && focused.dataset.key) focusMemory[location.hash] = focused.dataset.key;
  if (scroll) {
    if (focused.closest('#bar')) window.scrollTo({ top: Math.min(window.scrollY, 0) });
    else focused.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}
function restoreFocus(preferKey) {
  const keys = [preferKey, focusMemory[location.hash]].filter(Boolean);
  for (const k of keys) {
    const el = $$('.focusable', main).find(e => e.dataset.key === k);
    if (el) { setFocus(el); return; }
  }
  setFocus($('.focusable', main) || $('.tab.active'), false);
}
function move(dir) {
  const list = focusables();
  if (!list.length) return;
  if (!focused || !list.includes(focused)) { setFocus(list[0]); return; }
  const cur = focused.getBoundingClientRect();
  const cx = (cur.left + cur.right) / 2, cy = (cur.top + cur.bottom) / 2;
  let best = null, bestScore = Infinity;
  for (const el of list) {
    if (el === focused) continue;
    const r = el.getBoundingClientRect();
    const dx = (r.left + r.right) / 2 - cx, dy = (r.top + r.bottom) / 2 - cy;
    let ok = false, prim = 0, sec = 0;
    if (dir === 'left') { ok = dx < -4 && r.right <= cur.left + 8; prim = -dx; sec = Math.abs(dy); }
    if (dir === 'right') { ok = dx > 4 && r.left >= cur.right - 8; prim = dx; sec = Math.abs(dy); }
    if (dir === 'up') { ok = dy < -4 && r.bottom <= cur.top + 8; prim = -dy; sec = Math.abs(dx); }
    if (dir === 'down') { ok = dy > 4 && r.top >= cur.bottom - 8; prim = dy; sec = Math.abs(dx); }
    if (!ok) continue;
    const score = prim + sec * 2.2;
    if (score < bestScore) { bestScore = score; best = el; }
  }
  if (best) setFocus(best);
  else if (dir === 'up' && !settingsOpen) setFocus($('.tab.active') || $('.tab'));
}
function activate(el) {
  if (!el) return;
  if (el === qEl) { qEl.focus(); qEl.select(); return; }
  el.click();
}

/* ================================================================ 路由 */
const TABS = ['home', 'browse', 'fav', 'history'];
let lastTab = 'home';
const navStack = [location.hash || '#/home'];
let replacing = false;

function parseHash() {
  const h = (location.hash || '#/home').slice(1);
  const [path, qs] = h.split('?');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  const params = new URLSearchParams(qs || '');
  const name = parts[0] || 'home';
  if (name === 's') return { name: 'series', id: parts[1], params };
  if (name === 'w') return { name: 'watch', id: parts[1], vid: parts[2], params };
  return { name, params };
}
function go(hash, replace = false) {
  if (replace) { replacing = true; location.replace(hash); } else location.hash = hash;
}
function goBack() {
  const r = parseHash();
  if (navStack.length > 1) { history.back(); return; }
  if (r.name === 'watch') go('#/s/' + enc(r.id), true);
  else if (r.name !== 'home') go('#/home');
}
window.addEventListener('hashchange', () => {
  const h = location.hash || '#/home';
  if (replacing) { navStack[navStack.length - 1] = h; replacing = false; }
  else if (navStack.length > 1 && navStack[navStack.length - 2] === h) navStack.pop();
  else navStack.push(h);
  route();
});

let renderToken = 0;
async function route() {
  const r = parseHash();
  const token = ++renderToken;
  if (TABS.includes(r.name)) lastTab = r.name;
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === (r.name === 'search' || r.name === 'blocked' ? '' : lastTab)));
  try {
    if (r.name === 'watch') {
      if (!S.cur || S.cur.id !== r.id || !$('.hero', main)) await viewSeries(r.id, token);
      await openPlayer(r.id, r.vid, r.params.get('t'));
      return;
    }
    if (P.open) closePlayer();
    const views = { home: viewHome, browse: viewBrowse, fav: viewFav, history: viewHistory, search: viewSearch, blocked: viewBlocked };
    if (r.name === 'series') await viewSeries(r.id, token);
    else await (views[r.name] || viewHome)(token, r.params);
  } catch (e) {
    if (token !== renderToken) return;
    main.innerHTML = `<div class="empty">載入失敗：${esc(e.message)}<br><br>
      <a class="btn focusable" data-key="retry" href="${esc(location.hash)}" data-act="retry">重試</a></div>`;
    restoreFocus();
  }
}
function paint(token, html, preferKey) {
  if (token !== renderToken) return false;  // 已經切到別頁了
  main.innerHTML = html;
  if (document.activeElement !== qEl) restoreFocus(preferKey);
  return true;
}

/* ================================================================ 卡片 */
function cardHTML(c, o = {}) {
  const href = o.href || '#/s/' + enc(c.id);
  const sub = c.kind === 'movie' ? `電影${c.minutes ? ' · ' + c.minutes + ' 分' : ''}` : `${c.count} 集`;
  const tags = c.tags && c.tags.length ? ' · ' + c.tags.join('／') : '';
  const extra = o.extra != null ? o.extra : `${esc(c.channelName || '')} · ${sub}${esc(tags)}`;
  // o.ext：這一集在外站（動畫瘋）播放 → 開新分頁，同時記一筆紀錄
  const ext = o.ext ? ` target="_blank" rel="noopener" data-act="ext" data-sid="${esc(c.id)}" data-vid="${esc(o.vid)}"` : '';
  return `<a class="card focusable" href="${esc(href)}"${ext} data-key="${esc(o.key || 'c:' + c.id)}"
    title="${esc(c.vipAll ? c.title + '（頻道會員專屬，這裡無法播放）' : c.title)}">
    <div class="cov"><img loading="lazy" src="${c.thumbUrl ? esc(c.thumbUrl) : thumb(c.thumb)}" alt="" data-alt="${esc(c.thumb2 || '')}" onload="thumbOk(this)" onerror="thumbOk(this, true)">
      ${c.newEps ? `<span class="badge new">+${c.newEps} 新集數</span>` : ''}
      ${c.limited ? '<span class="badge lim">期間限定</span>' : ''}
      ${c.score ? `<span class="badge score" title="${esc(c.channelName)} 評分">★ ${c.score.toFixed(1)}</span>` : ''}
      ${c.gone ? '<span class="badge gone">已下架</span>' : ''}
      ${c.blocked ? '<span class="badge blk">🚫 已封鎖</span>' : ''}
      ${c.vip ? `<span class="badge vip" title="要加入頻道會員才能看">🔒 ${c.vipAll ? '會員限定' : c.vip + ' 集會員'}</span>` : ''}
      ${o.ep ? `<span class="eplbl">${esc(o.ep)}</span>` : ''}
      ${o.pct != null ? `<div class="prog"><i style="width:${Math.min(100, o.pct)}%"></i></div>` : ''}
    </div>
    <div class="t">${esc(c.title)}</div>
    <div class="s">${extra}</div></a>`;
}
const grid = items => `<div class="grid">${items.join('')}</div>`;
// 5 顆星，依分數填滿（4.7 → 4 顆滿＋第 5 顆填 70%）
function starsHTML(score) {
  return [0, 1, 2, 3, 4].map(i => `<i style="--fill:${Math.round(Math.max(0, Math.min(1, score - i)) * 100)}%">★</i>`).join('');
}
// 第一集被官方下架時，YouTube 會回 120×90 的灰色預設圖 → 改用另一集的縮圖
window.thumbOk = (img, failed) => {
  if ((failed || img.naturalWidth === 120) && img.dataset.alt) { img.src = thumb(img.dataset.alt); img.dataset.alt = ''; }
};

/* ================================================================ 各頁面 */
async function viewHome(token) {
  const d = await api('/api/home');
  showStatus(d.status);
  if (!d.status.total) {
    paint(token, `<div class="empty"><b>片單建立中…</b><br>第一次要讀取所有官方頻道，大約 5–10 分鐘。<br>完成後這裡會自動出現作品。</div>`);
    return;
  }
  let html = '';
  if (d.continue.length) {
    html += `<h2>繼續觀看</h2>` + grid(d.continue.map(c => cardHTML(c, {
      href: c.ext || `#/w/${enc(c.id)}/${enc(c.video)}`, ext: !!c.ext, vid: c.video, key: 'cont:' + c.id, ep: c.epLabel, pct: c.pct,
      extra: `${esc(c.epLabel)}${c.t ? ' · 看到 ' + fmtTime(c.t) : ''} · <span class="when">${timeAgo(c.at)}</span>`,
    })));
  }
  if (d.updates.length) html += `<h2>收藏有新集數</h2>` + grid(d.updates.map(c => cardHTML(c, { key: 'upd:' + c.id })));
  html += `<h2>最近更新 <span class="count">各來源最新上架</span></h2>` + grid(d.recent.map(c => cardHTML(c)));
  paint(token, html);
}

async function viewBrowse(token, params) {
  const ch = params.get('ch') || '', kind = params.get('kind') || '', sort = params.get('sort') || 'updated';
  const page = +params.get('page') || 1;
  const [d, st] = await Promise.all([
    api(`/api/browse?channel=${enc(ch)}&kind=${enc(kind)}&sort=${enc(sort)}&page=${page}`),
    api('/api/status'),
  ]);
  showStatus(st);
  const link = (k, v) => {
    const p = new URLSearchParams({ ch, kind, sort });
    p.set(k, v); p.delete('page');
    for (const [a, b] of [...p]) if (!b) p.delete(a);
    return '#/browse' + (p.toString() ? '?' + p : '');
  };
  const chip = (k, v, label, cur) =>
    `<a class="chip focusable ${cur === v ? 'on' : ''}" data-key="f:${k}:${v}" href="${link(k, v)}">${esc(label)}</a>`;
  let html = `<div class="filters"><span class="lbl">頻道</span>${chip('ch', '', '全部', ch)}`
    + st.channels.map(c => chip('ch', c.key, c.name, ch)).join('') + `</div>`
    + `<div class="filters"><span class="lbl">類型</span>${chip('kind', '', '全部', kind)}${chip('kind', 'series', '影集', kind)}${chip('kind', 'movie', '電影', kind)}`
    + `<span class="lbl">排序</span>${chip('sort', 'updated', '最近更新', sort)}${chip('sort', 'name', '名稱', sort)}${chip('sort', 'count', '集數多', sort)}${chip('sort', 'score', '評分高', sort)}</div>`
    + `<h2>片庫 <span class="count">${d.total} 部 · 第 ${d.page}/${d.pages} 頁</span>`
    + (st.blockedCount ? ` <a class="chip focusable" data-key="blocked" href="#/blocked">🚫 封鎖清單 ${st.blockedCount}</a>` : '')
    + `</h2>`
    + (d.items.length ? grid(d.items.map(c => cardHTML(c))) : `<div class="empty">沒有符合的作品</div>`);
  if (d.pages > 1) {
    const base = new URLSearchParams({ ch, kind, sort });
    for (const [a, b] of [...base]) if (!b) base.delete(a);
    const pg = n => { const p = new URLSearchParams(base); p.set('page', n); return '#/browse?' + p; };
    const nums = [...new Set([1, d.page - 2, d.page - 1, d.page, d.page + 1, d.page + 2, d.pages])]
      .filter(n => n >= 1 && n <= d.pages).sort((a, b) => a - b);
    html += `<div class="pager">`
      + (d.page > 1 ? `<a class="chip focusable" data-key="pg:prev" href="${pg(d.page - 1)}">◀ 上一頁</a>` : '')
      + nums.map(n => `<a class="chip focusable ${n === d.page ? 'on' : ''}" data-key="pg:${n}" href="${pg(n)}">${n}</a>`).join('')
      + (d.page < d.pages ? `<a class="chip focusable" data-key="pg:next" href="${pg(d.page + 1)}">下一頁 ▶</a>` : '')
      + `</div>`;
  }
  if (paint(token, html) && params.get('page')) window.scrollTo({ top: 0 });
}

async function viewFav(token) {
  const d = await api('/api/bookmarks');
  paint(token, `<h2>收藏 <span class="count">${d.items.length} 部</span></h2>` + (d.items.length
    ? grid(d.items.map(c => cardHTML(c, c.gone ? { extra: '官方已下架', href: '#/fav' } : {})))
    : `<div class="empty">還沒有收藏。<br>在作品頁按 <b>♡ 收藏</b>，有新集數時首頁會提醒你。</div>`));
}

async function viewHistory(token) {
  const d = await api('/api/history');
  const html = `<h2>觀看紀錄 <span class="count">${d.items.length} 筆</span>`
    + (d.items.length ? ` <button class="chip focusable" data-key="clear" data-act="clear-history">清除紀錄</button>` : '') + `</h2>`
    + (d.items.length ? grid(d.items.map(c => cardHTML(c, {
      href: c.ext || `#/w/${enc(c.id)}/${enc(c.video)}`, ext: !!c.ext, vid: c.video, key: 'h:' + c.video, ep: c.epLabel, pct: c.done ? 100 : c.pct,
      extra: `${esc(c.epLabel)}${c.done ? ' · 看完' : ''} · <span class="when">${timeAgo(c.ts)}</span>`,
    }))) : `<div class="empty">還沒有觀看紀錄</div>`);
  paint(token, html);
}

async function viewBlocked(token) {
  const d = await api('/api/blocked');
  paint(token, `<h2>封鎖清單 <span class="count">${d.items.length} 部 · 首頁和片庫不會出現，搜尋還找得到</span></h2>`
    + (d.items.length ? grid(d.items.map(c => cardHTML(c, c.gone ? { extra: '官方已下架', href: '#/blocked' } : {})))
      : `<div class="empty">沒有封鎖的作品。<br>在作品頁按 <b>⊘ 封鎖</b>，它就不會再出現在首頁和片庫。</div>`)
    + (d.items.length ? `<p class="note" style="margin-top:14px">點進作品頁，按「🚫 已封鎖」即可解除。</p>` : ''));
}

async function viewSearch(token, params) {
  const q = params.get('q') || '';
  if (qEl.value !== q && document.activeElement !== qEl) qEl.value = q;
  if (!q.trim()) { paint(token, `<div class="empty">輸入作品名稱搜尋</div>`); return; }
  const d = await api('/api/search?q=' + enc(q));
  paint(token, `<h2>搜尋「${esc(q)}」 <span class="count">${d.total} 部</span></h2>`
    + (d.items.length ? grid(d.items.map(c => cardHTML(c))) : `<div class="empty">找不到「${esc(q)}」</div>`));
}

/* 作品頁 */
const S = { cur: null, status: null };
async function viewSeries(id, token) {
  const s = await api('/api/series?id=' + enc(id));
  S.cur = s;
  const resume = s.resume;
  const first = s.episodes[0];
  // 連到哪裡：動畫瘋的集數（e.ext）開新分頁；會員專屬的直接開 YouTube；其他用站內播放器
  const epLink = e => (e.ext
    ? `href="${esc(e.ext)}" target="_blank" rel="noopener" data-act="ext" data-sid="${esc(s.id)}" data-vid="${esc(e.id)}"`
    : e.vip ? `href="https://www.youtube.com/watch?v=${enc(e.id)}" target="_blank" rel="noopener"`
      : `href="#/w/${enc(s.id)}/${enc(e.id)}"`);
  const resumeEp = resume && s.episodes.find(e => e.id === resume.video);
  const playBtn = resumeEp
    ? `<a class="btn primary focusable" data-key="play" ${epLink(resumeEp)}>▶ ${resume.t && !s.external ? '繼續看' : '接著看'} ${esc(resume.label)}${resume.t && !s.external ? '（' + fmtTime(resume.t) + '）' : ''}${s.external ? ' ↗' : ''}</a>`
    : `<a class="btn primary focusable" data-key="play" ${epLink(first)}>▶ 開始播放${s.kind === 'movie' ? '' : '（' + esc(first.label) + '）'}${s.external ? ' ↗' : ''}</a>`;
  const curVid = resume && resume.video;
  const eps = s.episodes.map(e => `<a class="ep focusable ${e.done ? 'done' : ''} ${e.id === curVid ? 'cur' : ''} ${e.vip ? 'vip' : ''}"
      data-key="ep:${esc(e.id)}" title="${esc(e.vip ? '🔒 頻道會員專屬，會在 YouTube 開啟\n' + e.title : e.ext ? e.title + '（在動畫瘋開啟）' : e.title)}"
      ${epLink(e)}>${e.vip ? '🔒 ' : ''}${esc(e.label)}
      <small>${e.duration ? fmtTime(e.duration) : ''}</small>${!e.done && e.pct ? `<i style="width:${e.pct}%"></i>` : ''}</a>`).join('');
  const html = `<div class="hero">
      <div class="hcov"><img src="${s.thumbUrl ? esc(s.thumbUrl) : thumb(s.thumb, 'hqdefault')}" alt=""></div>
      <div class="hinfo">
        <h1>${esc(s.title)}</h1>
        ${s.score ? `<div class="scorebox" title="${esc(s.channelName)} 的評分（滿分 5）">
          <b>${s.score.toFixed(1)}</b><span class="stars">${starsHTML(s.score)}</span>
          <span class="who">${s.scoreCount ? s.scoreCount.toLocaleString('zh-TW') + ' 人評價' : ''}${s.viewsText ? ` · 觀看 ${esc(s.viewsText)}` : ''} · ${esc(s.channelName)}</span>
        </div>` : ''}
        <div class="meta">
          <a href="${esc(s.channelUrl || '#')}" target="_blank" rel="noopener">${esc(s.channelName)} ↗</a>
          <span>${s.kind === 'movie' ? '電影' + (s.minutes ? ' · ' + s.minutes + ' 分鐘' : '') : s.count + ' 集'}</span>
          ${s.updated ? `<span>更新 ${fmtDate(s.updated)}</span>` : ''}
          ${(s.tags || []).map(t => `<span class="tagpill">${esc(t)}</span>`).join('')}
          ${s.studio ? `<span>動畫公司 ${esc(s.studio)}</span>` : ''}${s.director ? `<span>導演 ${esc(s.director)}</span>` : ''}
          ${s.limited ? '<span class="tagpill" style="color:var(--warn)">期間限定</span>' : ''}
          ${s.vip ? `<span class="tagpill vip" title="要加入「${esc(s.channelName)}」的 YouTube 頻道會員才能看">🔒 ${s.vipAll ? '全部集數為頻道會員專屬' : `${s.vip} 集為頻道會員專屬`}</span>` : ''}
        </div>
        <div class="btns">${playBtn}
          <button class="btn focusable ${s.bookmarked ? 'on' : ''}" data-key="fav" data-act="fav">${s.bookmarked ? '♥ 已收藏' : '♡ 收藏'}</button>
          <a class="btn focusable" data-key="yt" href="${esc(s.sourceUrl)}" target="_blank" rel="noopener">${s.external ? '在動畫瘋開啟' : '在 YouTube 開啟'} ↗</a>
          <button class="btn focusable ${s.blocked ? 'blk' : ''}" data-key="block" data-act="block"
            title="封鎖後不會出現在首頁和片庫">${s.blocked ? '🚫 已封鎖（解除）' : '⊘ 封鎖'}</button>
        </div>
        ${s.description ? `<p class="desc" data-act="desc">${esc(s.description)}</p>` : ''}
        <div class="src">${s.external
          ? `影片在「${esc(s.channelName)}」播放（用你在動畫瘋登入的會員帳號），本站只整理片單；點集數會開新分頁。`
          : `影片由「${esc(s.channelName)}」官方 YouTube 頻道提供，本站只嵌入播放。`}</div>
      </div></div>
    <h2>${s.kind === 'movie' ? '版本' : '集數'} <span class="count">${s.episodes.length}</span></h2>
    <div class="epgrid">${eps}</div>`;
  const prefer = S.lastWatched && s.episodes.some(e => e.id === S.lastWatched) ? 'ep:' + S.lastWatched : 'play';
  S.lastWatched = null;
  paint(token, html, focusMemory[location.hash] ? null : prefer);
  if (token === renderToken && S.lastWatchedFocus) { restoreFocus(S.lastWatchedFocus); S.lastWatchedFocus = null; }
}

/* 片單更新狀態 */
let statusTimer = 0;
function showStatus(st) {
  if (!st) return;
  const was = S.status && S.status.refresh.running;
  S.status = st;
  $('#refreshing').hidden = !st.refresh.running;
  clearTimeout(statusTimer);
  if (st.refresh.running) statusTimer = setTimeout(async () => showStatus(await api('/api/status').catch(() => st)), 8000);
  else if (was) {
    toast(st.refresh.message || '片單已更新');
    if (parseHash().name === 'home' && !P.open) route();
  }
  if (settingsOpen) buildSettings();
}

/* ================================================================ 播放器（YouTube IFrame API） */
const P = { open: false, sid: null, vid: null, i: -1, started: false, lastPost: 0, timer: 0, nextTimer: 0, nextAt: 0 };
let yt = null, ytReady = null;
const autoNext = () => recall('autonext', true);

function loadYT() {
  if (ytReady) return ytReady;
  ytReady = new Promise((resolve, reject) => {
    window.onYouTubeIframeAPIReady = resolve;
    const sc = document.createElement('script');
    sc.src = 'https://www.youtube.com/iframe_api';
    sc.onerror = () => { ytReady = null; reject(new Error('無法載入 YouTube 播放器（網路？）')); };
    document.head.appendChild(sc);
  });
  return ytReady;
}

async function openPlayer(sid, vid, tParam) {
  const s = S.cur;
  const i = s.episodes.findIndex(e => e.id === vid);
  if (i < 0) { toast('找不到這一集'); go('#/s/' + enc(sid), true); return; }
  if (P.open && P.vid !== vid) savePos();
  const e = s.episodes[i];
  Object.assign(P, { open: true, sid, vid, i, started: false, lastPost: 0 });
  S.lastWatched = vid;
  hideNextUp(); $('#pMsg').hidden = true;
  $('#player').hidden = false;
  document.body.style.overflow = 'hidden';
  $('#pTitle').innerHTML = `${esc(s.title)}<small>${esc(e.label)}${s.kind === 'movie' ? '' : ' / ' + s.episodes.length}</small>`;
  $('#pPrev').disabled = i === 0;
  $('#pNext').disabled = i >= s.episodes.length - 1;
  setFocus(null);
  updateHint();
  if (e.ext) {  // 外站（動畫瘋）的集數：不能嵌入，給連結
    try { yt && yt.stopVideo(); } catch (err) { /* 播放器還沒好 */ }
    showMsg(`這部在「${s.channelName}」播放，請在動畫瘋觀看。`, vid, e.ext, '到動畫瘋觀看');
    return;
  }
  if (e.vip) {  // 會員專屬：嵌入播放器播不了（隱私模式也讀不到你的會員身分）
    try { yt && yt.stopVideo(); } catch (err) { /* 播放器還沒好 */ }
    showMsg(`🔒 這集是「${s.channelName}」的頻道會員專屬影片，加入會員後請到 YouTube 觀看。`, vid);
    return;
  }
  let start = tParam != null ? +tParam : (!e.done && e.t > 15 ? e.t - 3 : 0);
  try { await loadYT(); } catch (err) { showMsg(err.message, vid); return; }
  if (!P.open || P.vid !== vid) return;
  if (!yt) createPlayer(vid, start);
  else yt.loadVideoById({ videoId: vid, startSeconds: Math.floor(start) });
  clearInterval(P.timer);
  P.timer = setInterval(tick, 5000);
}
let ytHost = 'https://www.youtube-nocookie.com';  // 隱私模式；播不了會自動退回 youtube.com
function createPlayer(vid, start) {
  if (!$('#yt')) { const d = document.createElement('div'); d.id = 'yt'; $('#pStage').prepend(d); }
  yt = new YT.Player('yt', {
    host: ytHost,
    videoId: vid,
    playerVars: { autoplay: 1, start: Math.floor(start), rel: 0, playsinline: 1, iv_load_policy: 3 },
    events: { onReady: ev => ev.target.playVideo(), onStateChange, onError },
  });
}

function closePlayer() {
  if (!P.open) return;
  savePos();
  P.open = false;
  clearInterval(P.timer); hideNextUp();
  try { yt && yt.stopVideo(); } catch (e) { /* 播放器還沒好 */ }
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  $('#player').hidden = true;
  document.body.style.overflow = '';
  S.lastWatchedFocus = 'ep:' + P.vid;
  updateHint();
}

function ytTime() {
  try { return { t: yt.getCurrentTime() || 0, dur: yt.getDuration() || 0 }; } catch (e) { return { t: 0, dur: 0 }; }
}
function post(extra = {}) {
  const { t, dur } = ytTime();
  if (!P.sid || !dur) return;
  P.lastPost = Date.now();
  const ep = S.cur && S.cur.episodes[P.i];
  if (ep && ep.id === P.vid) { ep.t = t; if (extra.done || t / dur >= 0.9) ep.done = true; }
  api('/api/progress', { series: P.sid, video: P.vid, t, dur, ...extra }).catch(() => {});
}
function savePos() { if (P.started) post(); }
function tick() {
  if (!P.open || !yt || !yt.getPlayerState) return;
  if (yt.getPlayerState() === YT.PlayerState.PLAYING && Date.now() - P.lastPost > 10000) post();
}
function onStateChange(ev) {
  if (!P.open) return;
  if (ev.data === YT.PlayerState.PLAYING) {
    if (!P.started) { P.started = true; post({ open: true }); }
    hideNextUp();
  } else if (ev.data === YT.PlayerState.PAUSED) {
    if (P.started) post();
  } else if (ev.data === YT.PlayerState.ENDED) {
    post({ done: true });
    if (autoNext() && P.i < S.cur.episodes.length - 1 && S.cur.kind !== 'movie') showNextUp();
  }
}
function onError(ev) {
  if (ev.data === 5 && ytHost.includes('nocookie')) {  // 隱私模式播放器出錯：換一般播放器重試一次
    ytHost = 'https://www.youtube.com';
    const { t } = ytTime();
    try { yt.destroy(); } catch (e) { /* 忽略 */ }
    yt = null;
    createPlayer(P.vid, t);
    return;
  }
  const why = { 2: '影片網址有誤', 5: '播放器發生錯誤', 100: '影片已下架或設為私人', 101: '官方不允許在其他網站播放這支影片', 150: '官方不允許在其他網站播放這支影片' }[ev.data] || '播放失敗';
  showMsg(why, P.vid);
}
function showMsg(text, vid, url, label) {
  const m = $('#pMsg');
  const hasNext = S.cur && P.i < S.cur.episodes.length - 1;
  const href = url || `https://www.youtube.com/watch?v=${enc(vid)}`;
  const ext = url ? ` data-act="ext" data-sid="${esc(P.sid)}" data-vid="${esc(vid)}"` : '';
  m.innerHTML = `<div>${esc(text)}</div><div class="btns">
    <a class="btn primary" href="${esc(href)}" target="_blank" rel="noopener"${ext}>${esc(label || '到 YouTube 觀看')} ↗</a>
    ${hasNext ? '<button class="btn" data-act="p-next">下一集</button>' : ''}</div>`;
  m.hidden = false;
}
function showNextUp() {
  const next = S.cur.episodes[P.i + 1];
  if (next.vip) { showMsg(`下一集（${next.label}）是頻道會員專屬，請到 YouTube 觀看。`, next.id); return; }
  P.nextAt = Date.now() + 6000;
  const box = $('#pNextUp');
  const paintBox = () => {
    const left = Math.max(0, Math.ceil((P.nextAt - Date.now()) / 1000));
    const g = a => (inputMode === 'pad' ? padLabel(PADS[a]) : keyLabel(KEYS[a]));
    box.innerHTML = `<div>下一集：<b>${esc(next.label)}</b>　${left} 秒後播放</div><div class="btns">
      <button class="btn primary" data-act="p-next">立即播放（${g('select')}）</button>
      <button class="btn" data-act="p-cancel">取消（${g('back')}）</button></div>`;
    if (left <= 0) { hideNextUp(); playIndex(P.i + 1); }
  };
  box.hidden = false; paintBox();
  clearInterval(P.nextTimer); P.nextTimer = setInterval(paintBox, 500);
}
function hideNextUp() { clearInterval(P.nextTimer); P.nextTimer = 0; $('#pNextUp').hidden = true; }
function playIndex(i) {
  const e = S.cur && S.cur.episodes[i];
  if (!e) return;
  go(`#/w/${enc(P.sid)}/${enc(e.id)}`, true);
}
function togglePlay() {
  if (!yt || !yt.getPlayerState) return;
  yt.getPlayerState() === YT.PlayerState.PLAYING ? yt.pauseVideo() : yt.playVideo();
}
function seek(d) {
  if (!yt || !yt.seekTo) return;
  const { t, dur } = ytTime();
  yt.seekTo(Math.max(0, Math.min(dur - 1, t + d)), true);
  toast((d > 0 ? '快轉 ' : '倒退 ') + Math.abs(d) + ' 秒 → ' + fmtTime(t + d));
}
function volume(d) {
  if (!yt || !yt.getVolume) return;
  const v = Math.max(0, Math.min(100, yt.getVolume() + d));
  yt.setVolume(v); if (v > 0) yt.unMute();
  toast('音量 ' + v);
}
function fullscreen() {
  const el = $('#player');
  const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
  if (fsEl) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
  const req = el.requestFullscreen || el.webkitRequestFullscreen;  // iPad Safari 只有 webkit 前綴
  if (!req) { toast('這台裝置不支援全螢幕，請用 YouTube 播放器右下角的全螢幕'); return; }
  try { const p = req.call(el); if (p && p.catch) p.catch(() => toast('瀏覽器不允許全螢幕')); } catch (e) { toast('瀏覽器不允許全螢幕'); }
}
function playerAction(a) {
  if (!$('#pNextUp').hidden) {
    if (a === 'select' || a === 'play') { hideNextUp(); playIndex(P.i + 1); return true; }
    if (a === 'back') { hideNextUp(); return true; }
  }
  switch (a) {
    case 'select': case 'play': togglePlay(); return true;
    case 'back': goBack(); return true;
    case 'left': seek(-10); return true;
    case 'right': seek(10); return true;
    case 'up': volume(10); return true;
    case 'down': volume(-10); return true;
    case 'tabPrev': if (P.i > 0) playIndex(P.i - 1); return true;
    case 'tabNext': if (P.i < S.cur.episodes.length - 1) playIndex(P.i + 1); return true;
    case 'fullscreen': fullscreen(); return true;
    default: return false;
  }
}
// 點了 YouTube 畫面後，鍵盤焦點會跑進 iframe，熱鍵就收不到 → 把焦點拉回來（點擊本身仍會傳給播放器）
window.addEventListener('blur', () => {
  if (!P.open) return;
  setTimeout(() => {
    const a = document.activeElement;
    if (a && a.tagName === 'IFRAME') { a.blur(); window.focus(); }
  }, 0);
});

/* ================================================================ 設定 */
let settingsOpen = false;
let waiting = null;  // 重新綁定中：{type:'kb'|'pad', a}
function openSettings() {
  settingsOpen = true; $('#cfgmask').hidden = false; buildSettings(); setFocus($('.focusable', $('#cfgpanel')));
  api('/api/status').then(showStatus).catch(() => {});  // 封鎖數、片單狀態取最新的
}
function closeSettings() { settingsOpen = false; waiting = null; $('#cfgmask').hidden = true; restoreFocus(); }
function buildSettings() {
  const st = S.status;
  const r = st && st.refresh;
  const card = recall('card', 230);
  const rows = ACTIONS.map(([a, label]) => `<tr><td>${label}</td>
    <td><button class="cbtn focusable ${waiting && waiting.type === 'kb' && waiting.a === a ? 'wait' : ''}" data-act="bind-kb" data-a="${a}" data-key="kb:${a}">${waiting && waiting.type === 'kb' && waiting.a === a ? '按下按鍵…' : esc(keyLabel(KEYS[a]))}</button></td>
    <td><button class="cbtn focusable ${waiting && waiting.type === 'pad' && waiting.a === a ? 'wait' : ''}" data-act="bind-pad" data-a="${a}" data-key="pad:${a}">${waiting && waiting.type === 'pad' && waiting.a === a ? '按手把按鈕…' : padLabel(PADS[a])}</button></td></tr>`).join('');
  const keyBefore = focused && focused.dataset.key;
  $('#cfgpanel').innerHTML = `<div class="cfghead"><b>設定</b><button class="cbtn focusable" data-act="settings" data-key="close">✕</button></div>
    <h3>外觀</h3>
    <div class="row"><span class="grow">卡片大小</span>
      <button class="cbtn focusable" data-act="zoom" data-d="-20" data-key="zo">－</button><span class="cbtn">${card}</span>
      <button class="cbtn focusable" data-act="zoom" data-d="20" data-key="zi">＋</button></div>
    <h3>播放</h3>
    <div class="row"><span class="grow">播完自動播下一集</span>
      <button class="cbtn focusable" data-act="autonext" data-key="an">${autoNext() ? '開' : '關'}</button></div>
    <h3>封鎖清單</h3>
    <div class="row"><span class="grow">${st && st.blockedCount ? st.blockedCount + ' 部作品不會出現在首頁和片庫' : '沒有封鎖的作品'}</span>
      <button class="cbtn focusable" data-act="blocked-list" data-key="bl">管理</button></div>
    <h3>片單</h3>
    <div class="row"><span class="grow">${st ? `${st.total} 部作品 · 產生於 ${st.generatedAt ? new Date(st.generatedAt).toLocaleString('zh-TW') : '—'}` : '—'}<br>
      <span class="note">${r && r.running ? '更新中…（約 5–10 分鐘）' : esc((r && r.message) || '每 12 小時開啟時自動更新')}</span></span>
      ${STATIC ? '' : `<button class="cbtn focusable" data-act="refresh" data-key="rf" ${r && r.running ? 'disabled' : ''}>立即更新</button>`}</div>
    ${STATIC ? `<h3>紀錄備份</h3>
    <div class="row"><span class="grow note">收藏／進度／紀錄只存在這台裝置的瀏覽器裡，清除 Safari 網站資料就會不見。<br>
      匯出的檔案跟電腦版的 anime_data.json 同格式，可以互相搬。</span>
      <button class="cbtn focusable" data-act="export" data-key="ex">匯出</button>
      <button class="cbtn focusable" data-act="import" data-key="im">匯入</button></div>` : ''}
    <h3>熱鍵 <span class="note">點按鈕後按下新的鍵（Esc 取消）</span></h3>
    <table class="keys"><tr><td></td><td class="note">鍵盤</td><td class="note">手把</td></tr>${rows}</table>
    <div class="row" style="margin-top:12px"><span class="grow note">${STATIC ? '資料存在這台裝置的瀏覽器裡（收藏／進度／紀錄）' : '資料存在 anime_data.json（收藏／進度／紀錄）'}</span>
      <button class="cbtn focusable" data-act="reset-keys" data-key="rk">恢復預設熱鍵</button></div>`;
  if (keyBefore) { const el = $$('.focusable', $('#cfgpanel')).find(e => e.dataset.key === keyBefore); if (el) setFocus(el, false); }
}
function applyCardSize() { document.documentElement.style.setProperty('--card', recall('card', 230) + 'px'); }
function bindKey(key) {
  const a = waiting.a; waiting = null;
  KEYS[a] = key; store('keys', KEYS); buildSettings(); updateHint();
}
function bindPad(i) {
  const a = waiting.a; waiting = null;
  PADS[a] = i; store('pads', PADS); buildSettings(); updateHint();
}

/* ================================================================ 點擊（滑鼠／觸控，也是方向鍵「確認」的實際動作） */
document.addEventListener('click', async ev => {
  const el = ev.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  if (act === 'retry') { ev.preventDefault(); route(); return; }
  if (act === 'settings') { ev.preventDefault(); settingsOpen ? closeSettings() : openSettings(); return; }
  if (act === 'desc') { el.classList.toggle('open'); return; }
  if (act === 'fav' && S.cur) {
    const r = await api('/api/bookmark', { series: S.cur.id, on: !S.cur.bookmarked });
    S.cur.bookmarked = r.on;
    el.classList.toggle('on', r.on);
    el.textContent = r.on ? '♥ 已收藏' : '♡ 收藏';
    toast(r.on ? '已加入收藏' : '已取消收藏');
    return;
  }
  if (act === 'ext') {  // 在動畫瘋開啟（連結本身照常開新分頁）：記一筆紀錄，並當作看過，繼續觀看會跳下一集
    const sid = el.dataset.sid, vid = el.dataset.vid;
    const ep = S.cur && S.cur.id === sid ? S.cur.episodes.find(e => e.id === vid) : null;
    const dur = (ep && ep.duration) || 1;
    api('/api/progress', { series: sid, video: vid, t: dur, dur, done: true, open: true }).catch(() => {});
    if (ep) { ep.done = true; const chip = $$('.ep', main).find(c => c.dataset.key === 'ep:' + vid); if (chip) chip.classList.add('done'); }
    return;
  }
  if (act === 'block' && S.cur) {
    const r = await api('/api/block', { series: S.cur.id, on: !S.cur.blocked });
    S.cur.blocked = r.on;
    el.classList.toggle('blk', r.on);
    el.textContent = r.on ? '🚫 已封鎖（解除）' : '⊘ 封鎖';
    toast(r.on ? '已封鎖：首頁和片庫不會再出現' : '已解除封鎖');
    return;
  }
  if (act === 'blocked-list') { closeSettings(); go('#/blocked'); return; }
  if (act === 'clear-history') {
    if (!confirm('清除所有觀看紀錄？（觀看進度和收藏不會刪）')) return;
    await api('/api/history/clear', {}); route(); return;
  }
  if (act === 'p-back') { goBack(); return; }
  if (act === 'p-prev') { playerAction('tabPrev'); return; }
  if (act === 'p-next') { hideNextUp(); $('#pMsg').hidden = true; if (P.i < S.cur.episodes.length - 1) playIndex(P.i + 1); return; }
  if (act === 'p-cancel') { hideNextUp(); return; }
  if (act === 'p-full') { fullscreen(); return; }
  if (act === 'zoom') {
    store('card', Math.max(160, Math.min(360, recall('card', 230) + +el.dataset.d)));
    applyCardSize(); buildSettings(); return;
  }
  if (act === 'autonext') { store('autonext', !autoNext()); buildSettings(); return; }
  if (act === 'refresh') { const r = await api('/api/refresh', {}); showStatus(r.status); toast('開始更新片單'); return; }
  if (act === 'export') {
    const blob = new Blob([window.localData.export()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `anime_data-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    toast('已匯出紀錄');
    return;
  }
  if (act === 'import') {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = async () => {
      const f = inp.files && inp.files[0];
      if (!f) return;
      if (!confirm('匯入會取代這台裝置上目前的收藏／進度／紀錄，確定？')) return;
      try {
        const n = window.localData.import(await f.text());
        toast(`已匯入：收藏 ${n.bookmarks} 部、紀錄 ${n.history} 筆`);
        api('/api/status').then(showStatus).catch(() => {});
        if (!P.open) route();
      } catch (e) { toast('匯入失敗：檔案格式不對'); }
    };
    inp.click();
    return;
  }
  if (act === 'bind-kb' || act === 'bind-pad') { waiting = { type: act === 'bind-kb' ? 'kb' : 'pad', a: el.dataset.a }; buildSettings(); return; }
  if (act === 'reset-keys') {
    KEYS = { ...DEFAULT_KEYS }; PADS = { ...DEFAULT_PADS }; store('keys', {}); store('pads', {});
    buildSettings(); updateHint(); toast('已恢復預設熱鍵');
  }
});
// 滑鼠點到的東西也當作目前選取
document.addEventListener('pointerdown', ev => {
  const el = ev.target.closest('.focusable');
  if (el && el !== qEl) setFocus(el, false);
  markInput('kb');
});

/* ================================================================ 鍵盤 */
function dispatch(a) {
  if (P.open && !settingsOpen) return playerAction(a);
  switch (a) {
    case 'up': case 'down': case 'left': case 'right': move(a); return true;
    case 'select': activate(focused); return true;
    case 'back':
      if (settingsOpen) closeSettings();
      else goBack();
      return true;
    case 'tabPrev': case 'tabNext': {
      if (settingsOpen) return false;
      const i = TABS.indexOf(lastTab);
      lastTab = TABS[(i + (a === 'tabNext' ? 1 : TABS.length - 1)) % TABS.length];  // 連按時不用等頁面切完
      go('#/' + lastTab);
      return true;
    }
    case 'search': setFocus(qEl, false); qEl.focus(); qEl.select(); return true;
    case 'settings': settingsOpen ? closeSettings() : openSettings(); return true;
    default: return false;
  }
}
window.addEventListener('keydown', ev => {
  if (waiting && waiting.type === 'kb') {
    ev.preventDefault();
    if (ev.key === 'Escape') { waiting = null; buildSettings(); } else bindKey(ev.key);
    return;
  }
  if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
  if (document.activeElement === qEl) {  // 打字中：只攔 Esc / Enter / ↓
    if (ev.key === 'Escape' || ev.key === 'Enter' || ev.key === 'ArrowDown') {
      ev.preventDefault(); qEl.blur();
      if (ev.key !== 'Escape') restoreFocus(); else setFocus(qEl, false);
    }
    return;
  }
  markInput('kb');
  if (!P.open && !settingsOpen && (ev.key === '-' || ev.key === '=' || ev.key === '+')) {
    store('card', Math.max(160, Math.min(360, recall('card', 230) + (ev.key === '-' ? -20 : 20)))); applyCardSize(); return;
  }
  const a = actionOfKey(ev.key);
  if (a && dispatch(a)) ev.preventDefault();
});

let searchTimer = 0;
qEl.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    const v = qEl.value.trim();
    const target = '#/search?q=' + enc(v);
    if (parseHash().name === 'search') { history.replaceState(null, '', target); navStack[navStack.length - 1] = target; route(); }
    else if (v) go(target);
  }, 280);
});
qEl.addEventListener('focus', () => setFocus(qEl, false));

/* ================================================================ 手把（輪詢 Gamepad API） */
const gp = { prev: {}, hold: 0, holdDir: null };
function padBtn(p, a) { const i = PADS[a]; return i != null && p.buttons[i] && p.buttons[i].pressed; }
function gpLoop() {
  const p = [...(navigator.getGamepads ? navigator.getGamepads() : [])].find(x => x);
  if (p) {
    if (waiting && waiting.type === 'pad') {
      for (let i = 0; i < p.buttons.length; i++) {
        const on = p.buttons[i].pressed;
        if (on && !gp.prev['c' + i]) { markInput('pad'); bindPad(i); }
        gp.prev['c' + i] = on;
      }
      requestAnimationFrame(gpLoop); return;
    }
    for (let i = 0; i < p.buttons.length; i++) gp.prev['c' + i] = p.buttons[i].pressed;
    const ax = p.axes[0] || 0, ay = p.axes[1] || 0, now = performance.now();
    const L = padBtn(p, 'left') || ax < -0.5, R = padBtn(p, 'right') || ax > 0.5;
    const U = padBtn(p, 'up') || ay < -0.5, D = padBtn(p, 'down') || ay > 0.5;
    const dir = L ? 'left' : R ? 'right' : U ? 'up' : D ? 'down' : null;
    if (dir) {
      markInput('pad');
      const repeat = P.open ? 350 : 170;
      const first = gp.holdDir !== dir;
      if (first || now - gp.hold > repeat + (gp.held ? 0 : 200)) {
        gp.held = !first; gp.hold = now; gp.holdDir = dir; dispatch(dir);
      }
    } else { gp.holdDir = null; gp.held = false; }
    for (const a of ['select', 'back', 'tabPrev', 'tabNext', 'search', 'settings', 'play', 'fullscreen']) {
      const on = padBtn(p, a);
      if (on) { markInput('pad'); if (!gp.prev[a]) dispatch(a); }
      gp.prev[a] = on;
    }
  }
  requestAnimationFrame(gpLoop);
}
window.addEventListener('gamepadconnected', () => { markInput('pad'); toast('手把已連線 🎮'); });
requestAnimationFrame(gpLoop);

/* ================================================================ 心跳：網頁全關掉後 server 自動結束 */
(function heartbeat() {
  if (STATIC) {  // 沒有 server：只要在離開前存播放進度
    window.addEventListener('pagehide', () => { if (P.open) savePos(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && P.open) savePos(); });
    return;
  }
  const hb = () => fetch('/api/ping', { cache: 'no-store' }).catch(() => {});
  hb(); setInterval(hb, 2000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) hb(); });
  window.addEventListener('pagehide', e => {
    if (P.open) savePos();
    if (!e.persisted) { try { fetch('/api/bye', { keepalive: true, cache: 'no-store' }); } catch (_) { /* 忽略 */ } }
  });
})();

/* ================================================================ 啟動 */
applyCardSize();
updateHint();
route();
api('/api/status').then(showStatus).catch(() => {});

/* jodo-anime-hub 靜態網站版（GitHub Pages／iPad）：沒有 server，server.py 的 /api/* 改在瀏覽器裡算。
   片單讀同一個資料夾的 catalog.json；收藏／進度／紀錄存在這台裝置的 localStorage（格式跟 anime_data.json 一樣，可以匯入匯出）。 */
'use strict';

(function () {
  const HISTORY_MAX = 200;
  const PAGE_SIZE = 60;
  const DATA_KEY = 'ah_data';

  /* ---------------------------------------------------------------- 片單 */
  const C = { series: [], byId: {}, channels: {}, channelList: [], generatedAt: '', loaded: null };

  function loadCatalog() {
    if (C.loaded) return C.loaded;
    C.loaded = fetch('catalog.json', { cache: 'no-cache' })
      .then(r => { if (!r.ok) throw new Error('片單讀取失敗（' + r.status + '）'); return r.json(); })
      .then(raw => {
        for (const s of raw.series) {
          s._allnum = s.episodes.every(e => e.ep != null);
          s._q = (s.title + ' ' + (s.rawTitle || '') + ' ' + (s.tags || []).join(' ')).toLowerCase();
          const u = s.updated || '';
          s._updated = u.length === 8 ? u + '1200' : (u || '000000000000');
        }
        C.series = raw.series;
        C.byId = Object.fromEntries(raw.series.map(s => [s.id, s]));
        C.channelList = raw.channels;
        C.channels = Object.fromEntries(raw.channels.map(c => [c.key, c]));
        C.generatedAt = raw.generatedAt || '';
      })
      .catch(e => { C.loaded = null; throw e; });
    return C.loaded;
  }

  function card(s) {
    const eps = s.episodes;
    let last = null;
    for (let i = eps.length - 1; i >= 0; i--) if (eps[i].ep != null) { last = eps[i].ep; break; }
    const vip = eps.filter(e => e.vip).length;
    const ch = C.channels[s.channel] || {};
    return {
      id: s.id, title: s.title, tags: s.tags || [], channel: s.channel, channelName: ch.name || s.channel,
      thumb: s.thumb, thumb2: eps.length > 1 && !s.thumbUrl ? eps[1].id : null, thumbUrl: s.thumbUrl || null,
      external: !!ch.external, kind: s.kind, count: eps.length, latestEp: last, minutes: s.minutes,
      updated: s.updated, limited: !!s.limited, score: s.score, viewsText: s.viewsText,
      vip, vipAll: eps.length > 0 && vip === eps.length,
    };
  }

  /* ---------------------------------------------------------------- 個人資料 */
  function blank(d) {
    d = d && typeof d === 'object' ? d : {};
    for (const k of ['bookmarks', 'progress', 'watched', 'blocked']) if (!d[k] || typeof d[k] !== 'object') d[k] = {};
    if (!Array.isArray(d.history)) d.history = [];
    return d;
  }
  let mem = null;  // localStorage 不能用（私密瀏覽）時至少這次開著有效
  function loadData() {
    try { const v = localStorage.getItem(DATA_KEY); if (v != null) return blank(JSON.parse(v)); } catch (e) { /* 忽略 */ }
    return blank(mem ? JSON.parse(mem) : {});
  }
  function saveData(d) {
    const s = JSON.stringify(d);
    mem = s;
    try { localStorage.setItem(DATA_KEY, s); } catch (e) { /* 私密模式或空間滿了 */ }
  }
  const now = () => Date.now() / 1000;
  const epIndex = (s, vid) => s.episodes.findIndex(e => e.id === vid);
  function epLabel(s, i) {
    const e = s.episodes[i];
    if (e.label) return e.label;
    if (s.kind === 'movie') return e.lang ? e.lang + '版' : (s.episodes.length === 1 ? '電影' : '版本 ' + (i + 1));
    if (s._allnum) return '第 ' + e.ep + ' 話';
    return '第 ' + (i + 1) + ' 集';
  }
  const pct = (t, dur) => (dur ? Math.round(100 * t / dur) : 0);

  function continueList(d, limit = 24) {
    const out = [];
    const entries = Object.entries(d.progress).sort((a, b) => (b[1].updated || 0) - (a[1].updated || 0));
    for (const [sid, p] of entries) {
      const s = C.byId[sid];
      if (!s || d.blocked[sid]) continue;
      let i = epIndex(s, p.video);
      if (i < 0) continue;
      const w = d.watched[p.video] || {};
      let t = w.t != null ? w.t : (p.t || 0), dur = w.dur != null ? w.dur : (p.dur || 0);
      if (w.done) {
        if (i + 1 >= s.episodes.length || s.kind === 'movie') continue;
        i += 1; t = 0; dur = s.episodes[i].duration || 0;
      }
      const e = s.episodes[i];
      out.push({ ...card(s), video: e.id, ext: e.ext, epLabel: epLabel(s, i), t, pct: pct(t, dur), at: p.updated || 0 });
      if (out.length >= limit) break;
    }
    return out;
  }
  function goneCard(sid, b, extra) {
    return { id: sid, title: b.title || sid, thumb: b.thumb || '', gone: true, tags: [], count: 0, kind: 'series', channelName: '', ...extra };
  }
  function bookmarkCards(d) {
    return Object.entries(d.bookmarks).sort((a, b) => (b[1].added || 0) - (a[1].added || 0)).map(([sid, b]) => {
      const s = C.byId[sid];
      return s ? { ...card(s), newEps: Math.max(0, s.episodes.length - (b.count || 0)) } : goneCard(sid, b);
    });
  }
  const byUpdated = (a, b) => (a._updated < b._updated ? 1 : a._updated > b._updated ? -1 : a.rank - b.rank);

  function status(d) {
    return {
      generatedAt: C.generatedAt, total: C.series.length, blockedCount: Object.keys((d || loadData()).blocked).length,
      channels: C.channelList, static: true,
      refresh: { running: false, startedAt: null, finishedAt: null, ok: null, message: '片單每天由雲端自動更新' },
    };
  }

  function browse(q) {
    const blocked = loadData().blocked;
    let items = C.series.filter(s => !blocked[s.id]);
    if (q.channel) items = items.filter(s => s.channel === q.channel);
    if (q.kind === 'series' || q.kind === 'movie') items = items.filter(s => s.kind === q.kind);
    const sort = q.sort || 'updated';
    if (sort === 'name') items.sort((a, b) => (a.title < b.title ? -1 : a.title > b.title ? 1 : 0));  // 跟 Python 一樣照字碼排
    else if (sort === 'count') items.sort((a, b) => b.episodes.length - a.episodes.length);
    else if (sort === 'score') items.sort((a, b) => (b.score || 0) - (a.score || 0) || (b.views || 0) - (a.views || 0));
    else items.sort(byUpdated);
    const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
    const page = Math.min(Math.max(1, parseInt(q.page, 10) || 1), pages);
    return { items: items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(card), page, pages, total: items.length };
  }

  function seriesDetail(sid) {
    const s = C.byId[sid];
    if (!s) { const e = new Error('這部作品不在片單裡（可能已下架）'); e.status = 404; throw e; }
    const d = loadData();
    const eps = s.episodes.map((e, i) => {
      const w = d.watched[e.id] || {};
      return { ...e, label: epLabel(s, i), t: w.t || 0, done: !!w.done, pct: pct(w.t || 0, w.dur) };
    });
    const ch = C.channels[s.channel] || {};
    const p = d.progress[sid];
    let resume = null;
    if (p) {
      let i = epIndex(s, p.video);
      if (i >= 0) {
        if ((d.watched[p.video] || {}).done && i + 1 < eps.length && s.kind !== 'movie') i += 1;
        resume = { video: eps[i].id, label: eps[i].label, t: eps[i].done ? 0 : eps[i].t };
      }
    }
    return {
      ...card(s),
      score: s.score, scoreCount: s.scoreCount, director: s.director, studio: s.studio,  // 動畫瘋細節：建置網站時先抓好
      description: s.description || '', rawTitle: s.rawTitle || '',
      sourceUrl: s.url || (s.id.startsWith('m-') ? 'https://www.youtube.com/watch?v=' + s.episodes[0].id
        : 'https://www.youtube.com/playlist?list=' + s.id),
      channelUrl: ch.url, episodes: eps, resume, bookmarked: !!d.bookmarks[sid], blocked: !!d.blocked[sid],
    };
  }

  /* ---------------------------------------------------------------- GET */
  function get(path, q) {
    if (path === '/api/status') return status();
    if (path === '/api/home') {
      const d = loadData();
      const recent = C.series.filter(s => !d.blocked[s.id]).sort(byUpdated).slice(0, 36);
      const updates = bookmarkCards(d).filter(b => b.newEps && !d.blocked[b.id]);
      return { continue: continueList(d), updates, recent: recent.map(card), status: status(d) };
    }
    if (path === '/api/browse') return browse(q);
    if (path === '/api/search') {
      const words = (q.q || '').toLowerCase().split(/\s+/).filter(Boolean);
      const hits = words.length ? C.series.filter(s => words.every(w => s._q.includes(w))) : [];
      const starts = s => (s.title.toLowerCase().startsWith(words[0]) ? 0 : 1);
      hits.sort((a, b) => starts(a) - starts(b) || b.episodes.length - a.episodes.length);
      const blocked = loadData().blocked;
      return { items: hits.slice(0, 150).map(s => ({ ...card(s), blocked: !!blocked[s.id] })), total: hits.length };
    }
    if (path === '/api/blocked') {
      const d = loadData();
      return { items: Object.entries(d.blocked).sort((a, b) => (b[1].added || 0) - (a[1].added || 0)).map(([sid, b]) => {
        const s = C.byId[sid];
        return s ? { ...card(s), blocked: true } : goneCard(sid, b, { blocked: true });
      }) };
    }
    if (path === '/api/series') return seriesDetail(q.id || '');
    if (path === '/api/bookmarks') return { items: bookmarkCards(loadData()) };
    if (path === '/api/history') {
      const d = loadData();
      const out = [];
      for (const h of d.history) {
        const s = C.byId[h.series];
        if (!s) continue;
        const i = epIndex(s, h.video);
        const w = d.watched[h.video] || {};
        const ext = i >= 0 ? s.episodes[i].ext : null;
        out.push({ ...card(s), video: h.video, ts: h.ts, ext, epLabel: i >= 0 ? epLabel(s, i) : '',
          thumb: ext ? s.thumb : h.video, done: !!w.done, pct: pct(w.t || 0, w.dur) });
      }
      return { items: out };
    }
    const e = new Error('not found'); e.status = 404; throw e;
  }

  /* ---------------------------------------------------------------- POST */
  function post(path, body) {
    body = body || {};
    if (path === '/api/progress') {
      const sid = body.series, vid = body.video;
      const s = C.byId[sid || ''];
      if (!s || epIndex(s, vid || '') < 0) { const e = new Error('unknown episode'); e.status = 400; throw e; }
      const t = +body.t || 0, dur = +body.dur || 0, ts = now();
      const d = loadData();
      const w = d.watched[vid] || {};
      const done = !!body.done || !!w.done || (dur > 0 && t / dur >= 0.9);
      d.watched[vid] = { t: Math.round(t), dur: Math.round(dur), done, updated: ts };
      d.progress[sid] = { video: vid, t: Math.round(t), dur: Math.round(dur), updated: ts };
      if (body.open) d.history = [{ series: sid, video: vid, ts }].concat(d.history.filter(h => h.video !== vid).slice(0, HISTORY_MAX - 1));
      if (d.bookmarks[sid]) d.bookmarks[sid].count = s.episodes.length;
      saveData(d);
      return { ok: true, done };
    }
    if (path === '/api/bookmark' || path === '/api/block') {
      const key = path === '/api/bookmark' ? 'bookmarks' : 'blocked';
      const sid = body.series || '';
      const s = C.byId[sid];
      const d = loadData();
      if (body.on && s) {
        d[key][sid] = { title: s.title, thumb: s.thumb, added: now() };
        if (key === 'bookmarks') d[key][sid].count = s.episodes.length;
      } else delete d[key][sid];
      saveData(d);
      return { ok: true, on: !!d[key][sid] };
    }
    if (path === '/api/history/clear') { const d = loadData(); d.history = []; saveData(d); return { ok: true }; }
    if (path === '/api/refresh') return { started: false, status: status() };
    const e = new Error('not found'); e.status = 404; throw e;
  }

  /* ---------------------------------------------------------------- 對外 */
  window.localApi = async function (url, body) {
    const u = new URL(url, location.href);
    const q = Object.fromEntries(u.searchParams);
    await loadCatalog();
    return body === undefined ? get(u.pathname.replace(/^.*(?=\/api\/)/, ''), q) : post(u.pathname.replace(/^.*(?=\/api\/)/, ''), body);
  };
  // 匯出／匯入紀錄：跟電腦版的 anime_data.json 同格式，可以互相搬
  window.localData = {
    export() { return JSON.stringify(loadData(), null, 1); },
    import(text) {
      const d = blank(JSON.parse(text));
      saveData(d);
      return { bookmarks: Object.keys(d.bookmarks).length, history: d.history.length, watched: Object.keys(d.watched).length };
    },
  };
})();

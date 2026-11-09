// common.js - shared by every page. Load after config.js. Exposes window.H.
// Sections: safety/utils · slugs · media fallback · data (cached) · favourites/recent · layout · cards · grid
(function () {
  'use strict';
  const H = (window.H = {});
  const C = window.APP_CONFIG;

  /* ====================================================================== safety + utils */
  H.esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const esc = H.esc;
  H.safeUrl = u => (/^https?:\/\//i.test(String(u || '').trim()) ? String(u).trim() : '#');
  H.q = p => new URLSearchParams(location.search).get(p) || '';
  H.$ = (s, r = document) => r.querySelector(s);
  H.$$ = (s, r = document) => [...r.querySelectorAll(s)];
  H.debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  H.plural = (n, one, many) => `${n} ${n === 1 ? one : many || one + (one === one.toUpperCase() ? 'S' : 's')}`;
  H.fmtDur = s => {
    s = Math.round(Number(s) || 0); if (!s) return '';
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
  };
  H.fmtDate = d => {
    const t = Date.parse(d); if (!t) return '';
    return new Date(t).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
  };
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  };
  H.store = store;
  H.errorBox = (msg, hint = '') =>
    `<div class="state-box state-error" role="alert"><strong>${esc(msg)}</strong>${hint ? `<span>${esc(hint)}</span>` : ''}<button type="button" class="cyber-btn" onclick="location.reload()">RETRY</button></div>`;
  H.emptyBox = (msg, hint = '') => `<div class="state-box"><strong>${esc(msg)}</strong>${hint ? `<span>${esc(hint)}</span>` : ''}</div>`;

  let toastTimer;
  H.toast = msg => {
    let el = H.$('#toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.textContent = msg; el.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
  };

  /* ====================================================================== slugs (mirror of hetaira-admin/lib/catalog.js) */
  H.slugify = s => {
    const slug = String(s).normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return slug || String(s).trim().toLowerCase();
  };

  /* ====================================================================== media: c1 -> c2 -> c3, then fallbacks */
  const AVATAR_SVG = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300"><rect width="300" height="300" fill="#120715"/>
     <circle cx="150" cy="115" r="52" fill="none" stroke="#ff007f" stroke-width="3" opacity=".7"/>
     <path d="M52 262c8-62 52-92 98-92s90 30 98 92" fill="none" stroke="#00f0ff" stroke-width="3" opacity=".6"/></svg>`).replace(/'/g, '%27').replace(/\(/g, '%28').replace(/\)/g, '%29');
  H.FALLBACK_SVG = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><rect width="400" height="400" fill="#120715"/>
     <defs><pattern id="g" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="rgba(255,0,127,.12)"/></pattern>
     <linearGradient id="a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff007f"/><stop offset="1" stop-color="#00f0ff"/></linearGradient></defs>
     <rect width="400" height="400" fill="url(#g)"/><circle cx="200" cy="175" r="65" fill="none" stroke="url(#a)" stroke-width="2" opacity=".6"/>
     <polygon points="200,135 235,195 165,195" fill="none" stroke="#ff007f" stroke-width="2"/>
     <text x="200" y="275" text-anchor="middle" font-family="monospace" font-size="13" font-weight="700" fill="#ff4d8d" letter-spacing="2">[ NO COVER ARTWORK ]</text>
     <text x="200" y="300" text-anchor="middle" font-family="monospace" font-size="11" fill="#00f0ff" opacity=".8">// SIGNAL_OFFLINE</text></svg>`).replace(/'/g, '%27').replace(/\(/g, '%28').replace(/\)/g, '%29');

  const failed = new Set(); // URLs that already 404'd this session are never retried
  const live = urls => urls.filter(u => !failed.has(u));
  /** Candidate list for a record cover: its own file (c1,c2,c3) -> the artist's fallback.png -> fallback_cover.png -> built-in art. */
  H.coverChain = (artistUuid, path) => live([
    ...window.assetUrls(path, 'cover'),
    ...(artistUuid ? window.assetUrls(`${artistUuid}/fallback.png`, 'cover') : []),
    ...window.assetUrls('fallback_cover.png', 'cover')
  ]).concat(H.FALLBACK_SVG);
  /** Candidate list for an artist picture: artist.png (or the registered image) -> fallback_artist.png -> built-in silhouette. */
  H.avatarChain = artist => live([
    ...window.assetUrls((artist && artist.image) || (artist && `${artist.uuid}/artist.png`), 'cover'),
    ...window.assetUrls('fallback_artist.png', 'cover')
  ]).concat(AVATAR_SVG);

  /** <img> that walks its fallback chain on error (see the delegated handler below). */
  H.coverImg = (item, cls = '', alt) => {
    const chain = H.coverChain(item.artistUuid, item.cover);
    return `<img class="${esc(cls)}" src="${esc(chain[0])}" alt="${esc(alt ?? item.title ?? '')}" loading="lazy" decoding="async" data-kind="cover" data-a="${esc(item.artistUuid || '')}" data-p="${esc(item.cover || '')}">`;
  };
  H.avatarImg = (artist, cls = '', alt) => {
    const chain = H.avatarChain(artist);
    return `<img class="${esc(cls)}" src="${esc(chain[0])}" alt="${esc(alt ?? (artist && artist.name) ?? '')}" loading="lazy" decoding="async" data-kind="avatar" data-a="${esc((artist && artist.uuid) || '')}" data-p="${esc((artist && artist.image) || '')}">`;
  };
  document.addEventListener('error', e => {
    const img = e.target;
    if (!img || img.tagName !== 'IMG' || img.dataset.done) return;
    if (img.src && !img.src.startsWith('data:')) failed.add(img.src);
    const kind = img.dataset.kind;
    const chain = kind === 'avatar' ? H.avatarChain({ uuid: img.dataset.a, image: img.dataset.p })
      : kind === 'cover' ? H.coverChain(img.dataset.a, img.dataset.p) : [H.FALLBACK_SVG];
    const next = chain.find(u => u !== img.src);
    if (!next || next === H.FALLBACK_SVG || next === AVATAR_SVG) img.dataset.done = '1';
    img.src = next || H.FALLBACK_SVG;
  }, true);

  /* ====================================================================== data (version-keyed cache) */
  // manifest.json is tiny and always fetched fresh; every other file is requested as ?v=<version> and kept in
  // localStorage until the version changes, so repeat visits and page-to-page navigation cost no network at all.
  const memo = new Map();
  const once = (key, fn) => { if (!memo.has(key)) memo.set(key, fn().catch(e => { memo.delete(key); throw e; })); return memo.get(key); };
  const lsKey = path => `hdb:${C.VERSION}:${path}`;

  H.init = () => once('init', async () => {
    try {
      const res = await fetch(window.resolveDbUrl('manifest.json', { fresh: true }), { cache: 'no-store' });
      if (res.ok) H.manifest = await res.json();
    } catch (e) { /* offline or an old database: continue without caching */ }
    C.VERSION = (H.manifest && H.manifest.version) || '';
    try { // drop cached files of older versions
      for (const k of Object.keys(localStorage)) if (k.startsWith('hdb:') && !k.startsWith(`hdb:${C.VERSION}:`)) localStorage.removeItem(k);
    } catch (e) { /* ignore */ }
    return H.manifest || null;
  });

  H.json = path => once('json:' + path, async () => {
    await H.init();
    if (C.VERSION) {
      try { const hit = localStorage.getItem(lsKey(path)); if (hit) return JSON.parse(hit); } catch (e) { /* corrupt entry: refetch */ }
    }
    const res = await fetch(window.resolveDbUrl(path));
    if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
    const text = await res.text();
    const json = JSON.parse(text);
    if (C.VERSION && text.length < 2e6) {
      try { localStorage.setItem(lsKey(path), text); } catch (e) { /* quota: just don't cache */ }
    }
    return json;
  });

  H.isFree = r => /FREE/i.test(r.tier || 'FREE');

  /** artists + every public record row, annotated for rendering. Cached for the page's lifetime. */
  H.loadCatalog = () => once('catalog', async () => {
    const [artists, rows] = await Promise.all([H.json('artists.json'), H.json('summary-all.json')]);
    if (!Array.isArray(rows)) throw new Error('summary-all.json is not a list');
    const artistByUuid = new Map(artists.map(a => [a.uuid, a]));
    const artistBySlug = new Map(artists.map(a => [a.slug, a]));
    const byUuid = new Map();
    for (const r of rows) {
      r.tags = r.tags || []; r.triggers = r.triggers || [];
      r.artistUuids = r.artistUuids || [r.artistUuid];
      r._artists = r.artistUuids.map(u => artistByUuid.get(u)).filter(Boolean);
      r._artistNames = r._artists.length ? r._artists.map(a => a.name) : ['Unknown'];
      r._free = H.isFree(r);
      r._date = r.releaseDate || '';
      const primary = artistByUuid.get(r.artistUuid);
      r._albumSlug = r.album && primary ? `${primary.slug}-${H.slugify(r.album)}` : '';
      r._tagSlugs = new Set([r.tag, ...r.tags].filter(Boolean).map(H.slugify));
      r._trigSlugs = new Set(r.triggers.map(H.slugify));
      r._q = [r.title, r.id, r.tag, r.variant, r.audience, r.author, r.album, ...r._artistNames, ...r.tags, ...r.triggers].filter(Boolean).join(' ').toLowerCase();
      byUuid.set(r.uuid, r);
    }
    const items = rows.filter(r => !r.status || r.status === 'ACTIVE');
    return { manifest: H.manifest, artists, rows, items, byUuid, artistByUuid, artistBySlug };
  });

  /** Vocabulary index: { list, bySlug, byLabel } resolves ?tag=<slug|label-slug>. kind: 'tags' | 'triggers' */
  H.termIndex = kind => once('idx:' + kind, async () => {
    const list = await H.json(`${kind}.json`);
    const bySlug = new Map(list.map(t => [t.slug, t]));
    const byLabel = new Map(list.map(t => [H.slugify(t.label), t]));
    return { list, bySlug, byLabel, find: p => bySlug.get(p) || byLabel.get(H.slugify(p)) || null };
  });
  H.termFile = (kind, slug) => H.json(`${kind}/${encodeURIComponent(slug)}.json`);
  H.albumIndex = () => H.json('albums.json');
  H.albumFile = slug => H.json(`albums/${encodeURIComponent(slug)}.json`);
  /** Full record (description, file, hash, changelog ...). Not cached: only fetched on the detail page. */
  H.record = async (artistUuid, uuid) => {
    await H.init();
    const res = await fetch(window.resolveDbUrl(`${artistUuid}/records/${uuid}.json`));
    if (!res.ok) throw new Error(`record: HTTP ${res.status}`);
    return res.json();
  };
  /** Rows for a list of uuids (term/album files only hold uuids). Unknown uuids are skipped. */
  H.rowsFor = (cat, uuids) => uuids.map(u => cat.byUuid.get(u)).filter(r => r && (!r.status || r.status === 'ACTIVE'));

  /* ---- links ---- */
  H.detailUrl = r => `detailed.html?aid=${encodeURIComponent(r.artistUuid)}&id=${encodeURIComponent(r.uuid)}`;
  H.playerUrl = r => `vttplayer.html?artist=${encodeURIComponent(r.artistUuid)}&uuid=${encodeURIComponent(r.uuid)}&ambient=off`;
  H.artistUrl = a => `artist.html?a=${encodeURIComponent(a.slug)}`;
  H.albumUrl = slug => `album.html?album=${encodeURIComponent(slug)}`;
  H.tagUrl = label => `tag.html?tag=${encodeURIComponent(H.slugify(label))}`;
  H.triggerUrl = label => `trigger.html?trigger=${encodeURIComponent(H.slugify(label))}`;
  H.libraryUrl = (params = {}) => { const p = new URLSearchParams(params); const s = p.toString(); return 'library.html' + (s ? '?' + s : ''); };

  /* ====================================================================== favourites + recently played (this browser only) */
  const favKey = 'hetaira:fav', recentKey = 'hetaira:recent';
  const favs = new Set(store.get(favKey, []));
  const subs = [];
  H.fav = {
    has: u => favs.has(u),
    all: () => [...favs],
    toggle(u) { favs.has(u) ? favs.delete(u) : favs.add(u); store.set(favKey, [...favs]); subs.forEach(f => f(u)); return favs.has(u); },
    subscribe: f => subs.push(f)
  };
  H.recent = {
    list: () => store.get(recentKey, []),
    add(u) { store.set(recentKey, [u, ...H.recent.list().filter(x => x !== u)].slice(0, 24)); }
  };
  // heart buttons anywhere on the page (event delegation, so cards added later work too)
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-fav]'); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    const on = H.fav.toggle(b.dataset.fav);
    H.$$(`[data-fav="${CSS.escape(b.dataset.fav)}"]`).forEach(x => { x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); });
    H.toast(on ? 'Saved to favourites' : 'Removed from favourites');
  });

  /* ====================================================================== layout: nav, footer, back-to-top */
  const NAV = [['index.html', 'Home', 'home'], ['library.html', 'Library', 'library'], ['albums.html', 'Albums', 'albums'], ['artists.html', 'Artists', 'artists'],
    ['tags.html', 'Tags', 'tags'], ['triggers.html', 'Triggers', 'triggers'], ['about.html', 'About', 'about']];
  H.layout = () => {
    const active = document.body.dataset.nav || '';
    H.$$('.cyber-navbar, .site-footer').forEach(n => n.remove());
    const nav = document.createElement('nav');
    nav.className = 'cyber-navbar'; nav.setAttribute('aria-label', 'Main');
    nav.innerHTML = `
      <div class="nav-container">
        <a href="index.html" class="brand-logo" aria-label="Hetaira home">HETAIRA<span>.EROS</span></a>
        <button type="button" class="nav-toggle" aria-expanded="false" aria-controls="navLinks" aria-label="Menu"><span></span><span></span><span></span></button>
        <ul class="nav-links" id="navLinks">
          ${NAV.map(([href, label, key]) => `<li><a href="${href}" class="nav-link${key === active ? ' active' : ''}"${key === active ? ' aria-current="page"' : ''}>${label}</a></li>`).join('')}
          <li class="nav-fav"><a href="library.html?fav=1" class="nav-link${active === 'favourites' ? ' active' : ''}" title="Your favourites">♥<span class="nav-fav-count" id="navFavCount"></span></a></li>
        </ul>
      </div>`;
    document.body.prepend(nav);
    const toggle = H.$('.nav-toggle', nav);
    toggle.addEventListener('click', () => { const open = nav.classList.toggle('open'); toggle.setAttribute('aria-expanded', String(open)); });
    const count = () => { const n = favs.size; const el = H.$('#navFavCount'); if (el) el.textContent = n ? n : ''; };
    count(); H.fav.subscribe(count);

    const foot = document.createElement('footer');
    foot.className = 'site-footer';
    foot.innerHTML = `
      <div class="footer-inner">
        <div class="footer-brand">HETAIRA<span>.EROS</span><p>An open archive of erotic hypnosis and audio roleplay.</p></div>
        <div class="footer-links">${NAV.map(([href, label]) => `<a href="${href}">${label}</a>`).join('')}</div>
        <div class="footer-meta" id="footerMeta"></div>
      </div>`;
    document.body.appendChild(foot);

    const top = document.createElement('button');
    top.type = 'button'; top.id = 'toTop'; top.setAttribute('aria-label', 'Back to top'); top.textContent = '↑';
    top.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    document.body.appendChild(top);
    addEventListener('scroll', () => top.classList.toggle('show', scrollY > 700), { passive: true });

    // "/" focuses the page's search box (like most sites); Escape closes the mobile menu
    addEventListener('keydown', e => {
      if (e.key === 'Escape') { nav.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); }
      if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) {
        const s = H.$('.search-input'); if (s) { e.preventDefault(); s.focus(); }
      }
    });
    H.init().then(m => {
      const meta = H.$('#footerMeta');
      if (meta && m) meta.textContent = `${m.counts.records} protocols · ${m.counts.artists} artists${m.updated ? ' · updated ' + H.fmtDate(m.updated.replace(' ', 'T') + 'Z') : ''}`;
    });
  };
  document.addEventListener('DOMContentLoaded', H.layout);

  /* ====================================================================== cards */
  const tag = (label, extra = '') => `<a class="tag-pill" href="${H.tagUrl(label)}"${extra}>${esc(label)}</a>`;
  H.heart = uuid => `<button type="button" class="fav-btn${H.fav.has(uuid) ? ' on' : ''}" data-fav="${esc(uuid)}" aria-pressed="${H.fav.has(uuid)}" aria-label="Favourite" title="Favourite">♥</button>`;
  H.artistLinks = (r, sep = ' × ') => r._artists.length
    ? r._artists.map(a => `<a href="${H.artistUrl(a)}">${esc(a.name)}</a>`).join(sep) : esc(r._artistNames.join(sep));

  /** Record card (library, home rails, tag/trigger/artist/album pages). */
  H.recordCard = (r, o = {}) => {
    const tags = (o.activeTag ? [r.tag, ...r.tags] : r.tags).filter(Boolean).slice(0, 3);
    return `
    <article class="cyber-card" data-uuid="${esc(r.uuid)}">
      <a class="card-cover-wrapper" href="${H.detailUrl(r)}" aria-label="${esc(r.title)}" tabindex="-1">
        ${H.coverImg(r, 'card-cover')}
        <div class="scanline-overlay"></div>
        <div class="floating-badges">
          <span class="badge-tier ${r._free ? 'free' : ''}">${esc(r.tier || 'FREE')}</span>
          ${r.audience ? `<span class="badge-audience">${esc(r.audience)}</span>` : ''}
        </div>
        ${r.audio && r.vtt ? '<span class="badge-cc" title="Synced subtitles available">CC</span>' : ''}
        ${r.dur ? `<span class="badge-dur">${H.fmtDur(r.dur)}</span>` : ''}
      </a>
      <div class="card-body">
        <div class="card-meta"><span class="card-id">${esc(r.id)}</span><span class="card-tag">${esc(r.tag || 'AUDIO')}</span></div>
        <h2 class="card-title"><a href="${H.detailUrl(r)}">${esc(r.title)}</a></h2>
        <div class="card-credits">By <span>${H.artistLinks(r)}</span></div>
        ${tags.length ? `<div class="pills-container">${tags.map(t => tag(t)).join('')}</div>` : ''}
      </div>
      <footer class="card-footer">
        <div class="footer-stat"><span class="stat-label">RELEASE</span><span class="stat-value">${esc(r._date ? H.fmtDate(r._date) : '—')}</span></div>
        <div class="footer-stat"><span class="stat-label">${r.album ? 'ALBUM' : 'VARIANT'}</span><span class="stat-value">${esc(r.album || r.variant || 'ORIGINAL')}</span></div>
        ${H.heart(r.uuid)}
      </footer>
    </article>`;
  };

  H.albumCard = a => `
    <a class="album-card" href="${H.albumUrl(a.slug)}">
      <div class="album-cover">${H.coverImg({ artistUuid: a.artistUuid, cover: a.cover }, 'card-cover', a.title)}<div class="scanline-overlay"></div>
        <span class="badge-count">${H.plural(a.count, 'TRACK')}</span></div>
      <div class="album-info"><h3>${esc(a.title)}</h3><span>${esc(a.artist)}${a.releaseDate ? ' · ' + esc(a.releaseDate.slice(0, 4)) : ''}</span></div>
    </a>`;

  H.artistCard = (a, count) => `
    <a class="artist-chip" href="${H.artistUrl(a)}">
      ${H.avatarImg(a, 'artist-chip-img')}
      <div><strong>${esc(a.name)}</strong><span>${H.plural(count, 'protocol')}</span></div>
    </a>`;

  H.skeletons = (n = 6, cls = 'cyber-card') => Array.from({ length: n }, () => `<div class="${cls} skeleton" aria-hidden="true"><div class="sk-cover"></div><div class="sk-line"></div><div class="sk-line short"></div></div>`).join('');

  /* ====================================================================== grid with infinite scroll that cannot stall */
  /**
   * H.grid({ el, sentinel, countEl, renderItem, size, empty })
   *   grid.set(list)   replace the list (re-renders from the first batch)
   * The sentinel is re-observed after every batch, so tall screens keep loading until it is pushed off-screen.
   */
  H.grid = ({ el, sentinel, renderItem, size = C.PAGE_SIZE || 12, empty = 'Nothing matches your filters.', end = '// END OF ARCHIVE' }) => {
    let list = [], shown = 0;
    const step = () => {
      if (shown >= list.length) { sentinel.textContent = list.length ? end : ''; return false; }
      const slice = list.slice(shown, shown + size);
      el.insertAdjacentHTML('beforeend', slice.map((x, k) => renderItem(x, shown + k)).join(''));
      shown += slice.length;
      sentinel.textContent = shown >= list.length ? end : '// SCROLL FOR MORE...';
      return true;
    };
    const io = new IntersectionObserver(es => { if (es[0].isIntersecting && step()) requestAnimationFrame(kick); }, { rootMargin: '300px' });
    function kick() { io.unobserve(sentinel); io.observe(sentinel); }
    return {
      set(l) {
        list = l; shown = 0; el.innerHTML = '';
        if (!list.length) { el.innerHTML = H.emptyBox(empty); sentinel.textContent = ''; return; }
        step(); kick();
      },
      get length() { return list.length; }
    };
  };

  /** Keeps filter controls and the URL in sync: H.urlState(['q','artist'], getValues) */
  H.syncUrl = params => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) p.set(k, v);
    const s = p.toString();
    history.replaceState(null, '', location.pathname + (s ? '?' + s : ''));
  };

  H.sorters = {
    newest: (a, b) => b._date.localeCompare(a._date) || a.id.localeCompare(b.id, undefined, { numeric: true }),
    oldest: (a, b) => a._date.localeCompare(b._date) || a.id.localeCompare(b.id, undefined, { numeric: true }),
    az: (a, b) => a.title.localeCompare(b.title),
    za: (a, b) => b.title.localeCompare(a.title),
    longest: (a, b) => (b.dur || 0) - (a.dur || 0)
  };
})();

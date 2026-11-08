// listing.js - page controllers shared by several pages. Load after common.js.
//   H.listPage(opts)       searchable + sortable grid of simple items (tags, triggers, artists, albums)
//   H.recordBrowser(opts)  filter bar + infinite grid of record cards (library, artist, tag, trigger, album pages)
//   H.telemetry(rows)      numbers for the dossier HUD (count, top audience, artists, total runtime)
(function () {
  'use strict';
  const H = window.H, esc = H.esc;
  const $ = id => document.getElementById(id);

  /* ---------------------------------------------------------------- list of simple items */
  /**
   * opts: { items, gridEl, sentinel, searchEl, sortEl, countEl, countLabel, render(item, i), text(item) -> searchable string,
   *         sorters: { KEY: (a,b)=>n }, size, empty, end }
   */
  H.listPage = o => {
    const grid = H.grid({ el: o.gridEl, sentinel: o.sentinel, renderItem: o.render, size: o.size || 24, empty: o.empty, end: o.end });
    const apply = () => {
      const q = (o.searchEl && o.searchEl.value || '').toLowerCase().trim();
      const list = o.items.filter(i => !q || o.text(i).toLowerCase().includes(q));
      const sorter = o.sorters[o.sortEl.value] || Object.values(o.sorters)[0];
      list.sort(sorter);
      if (o.countEl) o.countEl.textContent = `// ${o.countLabel}: ${list.length}`;
      grid.set(list);
      H.syncUrl({ q: o.searchEl ? o.searchEl.value.trim() : '', sort: o.sortEl.selectedIndex ? o.sortEl.value : '' });
    };
    if (o.searchEl) { o.searchEl.value = H.q('q'); o.searchEl.addEventListener('input', H.debounce(apply, 180)); }
    const wanted = H.q('sort'); if ([...o.sortEl.options].some(x => x.value === wanted)) o.sortEl.value = wanted;
    o.sortEl.addEventListener('change', apply);
    apply();
    return { apply };
  };

  /* ---------------------------------------------------------------- dossier numbers */
  H.telemetry = rows => {
    const aud = new Map();
    let runtime = 0;
    const artists = new Set();
    for (const r of rows) {
      if (r.audience) aud.set(r.audience, (aud.get(r.audience) || 0) + 1);
      runtime += r.dur || 0;
      r.artistUuids.forEach(u => artists.add(u));
    }
    const top = [...aud.entries()].sort((a, b) => b[1] - a[1])[0];
    return { files: rows.length, audience: top ? top[0] : 'ANY', artists: artists.size, runtime: runtime ? H.fmtDur(runtime) : '--:--', runtimeSecs: runtime };
  };
  H.fillTelemetry = (t, ids = {}) => {
    const set = (id, v) => { const el = $(id); if (el) el.textContent = v; };
    set(ids.files || 'statFiles', t.files); set(ids.audience || 'statAudience', t.audience);
    set(ids.artists || 'statArtists', t.artists); set(ids.runtime || 'statDuration', t.runtime);
  };

  /* ---------------------------------------------------------------- record browser */
  /**
   * opts: { rows, gridEl, sentinel, searchEl, tierEl, audienceEl, sortEl, ccEl, favEl, countEl, matchedEl, albumEl,
   *         persist (sync filters into the URL), initial: {q,tier,audience,sort,cc,fav,album} }
   * Controls that don't exist on a page are simply skipped.
   */
  H.recordBrowser = o => {
    const grid = H.grid({ el: o.gridEl, sentinel: o.sentinel, renderItem: r => H.recordCard(r, o.card), empty: o.empty || 'No protocols match your filters.' });
    const init = o.initial || {};

    if (o.audienceEl) {
      [...new Set(o.rows.map(r => (r.audience || '').toUpperCase()).filter(Boolean))].sort().forEach(a => o.audienceEl.add(new Option(a, a)));
    }
    const setIf = (el, v) => { if (el && v != null && v !== '' && [...el.options].some(x => x.value === v)) el.value = v; };
    if (o.searchEl) o.searchEl.value = init.q || '';
    setIf(o.audienceEl, (init.audience || '').toUpperCase());
    setIf(o.tierEl, (init.tier || '').toUpperCase());
    setIf(o.sortEl, init.sort);
    setIf(o.albumEl, init.album);
    if (o.ccEl) o.ccEl.checked = init.cc === '1';
    if (o.favEl) o.favEl.checked = init.fav === '1';

    const apply = () => {
      const words = (o.searchEl ? o.searchEl.value : '').toLowerCase().trim().split(/\s+/).filter(Boolean);
      const aud = o.audienceEl ? o.audienceEl.value : 'ALL';
      const tier = o.tierEl ? o.tierEl.value : 'ALL';
      const album = o.albumEl ? o.albumEl.value : 'ALL';
      const cc = o.ccEl && o.ccEl.checked, fav = o.favEl && o.favEl.checked;
      const extra = o.extraFilter || (() => true);
      const list = o.rows.filter(r =>
        words.every(w => r._q.includes(w)) &&
        (aud === 'ALL' || (r.audience || '').toUpperCase() === aud) &&
        (tier === 'ALL' || (tier === 'FREE') === r._free) &&
        (album === 'ALL' || r._albumSlug === album) &&
        (!cc || (r.audio && r.vtt)) && (!fav || H.fav.has(r.uuid)) && extra(r));
      const sorter = H.sorters[o.sortEl ? o.sortEl.value : 'newest'] || H.sorters.newest;
      list.sort(sorter);
      if (o.countEl) o.countEl.textContent = `// MATCHED: ${list.length} PROTOCOLS`;
      if (o.matchedEl) o.matchedEl.textContent = `[MATCHING PROTOCOLS: ${list.length}]`;
      if (o.persist) {
        H.syncUrl({
          q: o.searchEl ? o.searchEl.value.trim() : '', audience: aud !== 'ALL' ? aud : '', tier: tier !== 'ALL' ? tier : '',
          album: album !== 'ALL' ? album : '', cc: cc ? '1' : '', fav: fav ? '1' : '',
          sort: o.sortEl && o.sortEl.selectedIndex ? o.sortEl.value : '', ...(o.extraParams ? o.extraParams() : {})
        });
      }
      grid.set(list);
      if (o.onApply) o.onApply(list);
    };
    if (o.searchEl) o.searchEl.addEventListener('input', H.debounce(apply, 180));
    [o.audienceEl, o.tierEl, o.sortEl, o.albumEl, o.ccEl, o.favEl].filter(Boolean).forEach(el => el.addEventListener('change', apply));
    apply();
    return { apply, grid };
  };

  /** Chips for active tag/trigger filters that can be removed (library page). */
  H.activeChips = (box, chips, onRemove) => {
    box.innerHTML = chips.map(c => `<button type="button" class="chip clear" data-k="${esc(c.key)}">${c.icon || ''}${esc(c.label)} ✕</button>`).join('');
    box.querySelectorAll('.chip').forEach(b => b.addEventListener('click', () => onRemove(b.dataset.k)));
  };

  /* ---------------------------------------------------------------- pill matrices on dossier pages */
  H.pills = (box, items, empty) => {
    box.innerHTML = items.length
      ? items.map(i => `<a href="${esc(i.href)}" class="interlock-chip${i.cls ? ' ' + i.cls : ''}"><span>${i.icon || ''}</span> ${esc(i.label)} <span class="chip-count">(${i.n})</span></a>`).join('')
      : `<span class="muted-note">${esc(empty)}</span>`;
  };
  /** Count how often each key occurs among rows: pick(row) -> [{key,label,href}] */
  H.tally = (rows, pick) => {
    const m = new Map();
    rows.forEach(r => pick(r).forEach(e => { const c = m.get(e.key) || { ...e, n: 0 }; c.n++; m.set(e.key, c); }));
    return [...m.values()].sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
  };
})();

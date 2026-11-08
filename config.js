// config.js - the only file you edit to point the site at its repos. Load it BEFORE common.js.
(function () {
  const GH = 'https://raw.githubusercontent.com/HETAIRA-INC/';
  const LFS = 'https://media.githubusercontent.com/media/HETAIRA-INC/'; // Git LFS (audio)
  const REF = '/refs/heads/main/';

  const cfg = {
    // hetaira-db: JSON database. manifest.json, artists.json, summary-all.json, tags/ triggers/ albums/, <artist>/records/
    DB_BASE_URL: GH + 'hetaira-db' + REF,

    // hetaira-c1 holds covers + audio. c2 / c3 are overflow/backup repos with the SAME folder layout:
    // each file is tried on c1, then c2, then c3 before a fallback image is used.
    COVER_BASE_URLS: [GH + 'hetaira-c1' + REF, GH + 'hetaira-c2' + REF, GH + 'hetaira-c3' + REF],
    AUDIO_BASE_URLS: [LFS + 'hetaira-c1' + REF, LFS + 'hetaira-c2' + REF, LFS + 'hetaira-c3' + REF],

    // hetaira-vtt: <artist-uuid>/vtt/<record-uuid>.vtt
    VTT_BASE_URL: GH + 'hetaira-vtt' + REF,

    PAGE_SIZE: 12,                // cards per batch on grids
    VERSION: ''                   // filled in by common.js from manifest.json (cache key for every JSON file)
  };

  // Local development - honoured ONLY when this page is itself served from localhost, so a link on the
  // public site can never point visitors at someone else's data.
  //   ?local=1   read from the admin server (npm start in hetaira-admin -> http://localhost:3000)
  //   ?local=0   back to the URLs above
  //   ?db=URL  ?covers=URL  ?audio=URL  ?vtt=URL   override one base (value "reset" clears it)
  if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) {
    try {
      const q = new URLSearchParams(location.search);
      const KEYS = { db: 'DB_BASE_URL', covers: 'COVER_BASE_URLS', audio: 'AUDIO_BASE_URLS', vtt: 'VTT_BASE_URL' };
      const store = (k, v) => (v === null ? localStorage.removeItem('hetaira.' + k) : localStorage.setItem('hetaira.' + k, v));
      if (q.get('local') === '1') {
        store('DB_BASE_URL', 'http://localhost:3000/db/'); store('COVER_BASE_URLS', 'http://localhost:3000/media/');
        store('AUDIO_BASE_URLS', 'http://localhost:3000/media/'); store('VTT_BASE_URL', 'http://localhost:3000/vtt/');
      } else if (q.get('local') === '0') Object.values(KEYS).forEach(k => store(k, null));
      for (const [param, key] of Object.entries(KEYS)) {
        if (q.has(param)) store(key, q.get(param) === 'reset' ? null : q.get(param));
        const saved = localStorage.getItem('hetaira.' + key);
        if (saved) cfg[key] = Array.isArray(cfg[key]) ? [saved] : saved;
      }
    } catch (e) { /* storage blocked: use defaults */ }
  }
  window.APP_CONFIG = cfg;

  /* ---- URL helpers (pure functions of the config above) ---- */
  const join = (base, path) => (base ? base.replace(/\/+$/, '') + '/' : '') + path.replace(/^\/+/, '');
  const decodeSafe = s => { try { return decodeURIComponent(s); } catch (e) { return s; } };
  const encodePath = p => p.split('/').map(s => encodeURIComponent(decodeSafe(s))).join('/');
  const isUrl = p => /^https?:\/\//i.test(p);

  /** JSON in hetaira-db. Adds ?v=<version> (cache key) unless {fresh:true}, which asks for the newest copy. */
  window.resolveDbUrl = function (path, opts) {
    if (!path) return '';
    if (isUrl(path)) return path;
    const url = join(cfg.DB_BASE_URL, encodePath(path));
    if (opts && opts.fresh) return url + '?_t=' + Date.now();
    return cfg.VERSION ? url + '?v=' + encodeURIComponent(cfg.VERSION) : url;
  };
  /** Every candidate URL for a cover/audio path: one per repo, c1 first. Absolute URLs pass through. */
  window.assetUrls = function (path, type) {
    path = String(path || '').trim();
    if (!path) return [];
    if (isUrl(path) || /^data:image\//i.test(path)) return [path];
    if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return [];            // javascript:, file: ... never allowed
    const bases = type === 'audio' ? cfg.AUDIO_BASE_URLS : cfg.COVER_BASE_URLS;
    return bases.map(b => join(b, encodePath(path)));
  };
  /** First candidate only (use assetUrls when you can retry on error). */
  window.resolveAssetUrl = (path, type = 'cover') => window.assetUrls(path, type)[0] || '';
  /** Subtitle file in hetaira-vtt. */
  window.resolveVttUrl = function (path) {
    path = String(path || '').trim();
    if (!path) return '';
    if (isUrl(path)) return path;
    if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return '';
    return join(cfg.VTT_BASE_URL, encodePath(path));
  };
})();

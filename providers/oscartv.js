const TMDB_KEY = "1c29a5198ee1854bd5eb45dbe8d17d92";
const TMDB = "https://api.themoviedb.org/3";
const MAIN = "https://ostv-11-11.xyz";
const STEP1 = "https://flech.tn/scrapefinal/dramabox/step1_prepare_oscar.php";
const PLAY_UA = "TDMuaHLS99";
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

const log = (...a) => console.log("[OscarTV]", ...a);

async function call(path) {
  const res = await fetch(STEP1, {
    method: "POST",
    headers: { "User-Agent": BROWSER_UA, "Content-Type": "application/x-www-form-urlencoded" },
    body: "url=" + encodeURIComponent(`${MAIN}/${path}`),
  });
  const d = await res.json();
  if (!d.url || !d.headers) throw new Error("step1 failed");
  const headers = {};
  for (const [k, v] of Object.entries(d.headers)) {
    if (k.toLowerCase() !== "host" && k.toLowerCase() !== "connection") headers[k] = v;
  }
  const r = await fetch(d.url, { headers });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function tmdbTitles(tmdbId, mediaType) {
  const type = mediaType === "tv" ? "tv" : "movie";
  const res = await fetch(`${TMDB}/${type}/${tmdbId}?api_key=${TMDB_KEY}&append_to_response=alternative_titles`);
  const d = await res.json();
  const main = d.name || d.title || "";
  const alt = ((d.alternative_titles || {}).results || []).map(t => t.title);
  return {
    titles: [main, ...alt].filter(Boolean),
    year: (d.first_air_date || d.release_date || "").split("-")[0] || null
  };
}

async function tmdbSeasonCount(tmdbId, seasonNum) {
  try {
    const res = await fetch(`${TMDB}/tv/${tmdbId}/season/${seasonNum}?api_key=${TMDB_KEY}`);
    const d = await res.json();
    return (d.episodes || []).length || null;
  } catch { return null; }
}

const norm = s => (s || "").toLowerCase().replace(/[^a-z0-9\u0600-\u06FF]+/g, "").trim();

async function search(kind, query) {
  const base = kind === "anime" ? "api/anime" : kind === "serie" ? "api/series" : "api/movies";
  const extra = kind === "anime" ? "&anime_type=tv,ova,ona,special,movie" : "";
  const d = await call(`${base}/?page=1&limit=20&search=${encodeURIComponent(query)}${extra}`);
  return d.data || [];
}

const names = i => [i.title_en, i.title_ar, i.name].filter(Boolean);
const exactMatch = (items, title) => {
  const t = norm(title);
  return items.find(i => names(i).some(x => norm(x) === t));
};
const closeMatch = (items, title) => {
  const t = norm(title);
  return items.find(i => names(i).some(x => {
    const n = norm(x);
    return n && (n.includes(t) || t.includes(n));
  }));
};

async function findMovie(titles, year) {
  for (const t of titles) {
    let items = [];
    try { items = await search("movie", t); } catch { continue; }
    let hit = exactMatch(items, t) || closeMatch(items, t);
    if (!hit) continue;
    try {
      const d = (await call(`api/movies/show.php?id=${hit.id}`)).data || {};
      const y = parseInt(String(d.release_year || (d.release_date || "").slice(0, 4)), 10);
      if (y && year && Math.abs(y - year) > 1) continue;
      return { item: hit, data: d };
    } catch { return { item: hit, data: null }; }
  }
  return null;
}

async function findShow(titles) {
  for (const t of titles) {
    for (const kind of ["serie", "anime"]) {
      let items = [];
      try { items = await search(kind, t); } catch { continue; }
      const hit = exactMatch(items, t) || closeMatch(items, t);
      if (hit) return { kind, item: hit, items };
    }
  }
  return null;
}

const ROMAN = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10, xi: 11, xii: 12 };
const PERIOD_ORDER = { winter: 0, spring: 1, summer: 2, fall: 3 };

function stemOf(t) {
  return norm(String(t || "")
    .replace(/\b(X{0,3}(?:IX|IV|V?I{1,3}))\b/g, " ")
    .replace(/\b(?:season|part|pt)\s*[0-9ivx]+\b/gi, " ")
    .replace(/\bS\d{1,2}\b/g, " "));
}

function entrySeasonNum(t) {
  const s = String(t || "");
  let m = s.match(/\b(X{0,3}(?:IX|IV|V?I{1,3}))\b/);
  if (m && ROMAN[m[1].toLowerCase()]) return ROMAN[m[1].toLowerCase()];
  m = s.match(/\b(?:season|part|pt)\s*([0-9]+)\b/i) || s.match(/(?:الموسم|الجزء)\s*([٠-٩0-9]+)/);
  if (m) {
    const digits = String(m[1]).replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d));
    return parseInt(digits, 10);
  }
  return null;
}

function pickInternal(info, epNum) {
  const seasons = (info.seasons || []).slice().sort((a, b) => (a.season_number || 0) - (b.season_number || 0));
  for (const s of seasons) {
    const cnt = s.episodes_count || 0;
    if (epNum <= cnt) return { seasonId: s.season_id != null ? s.season_id : s.id, epNum };
    epNum -= cnt;
  }
  return null;
}

async function resolveSplitAnime(items, matched, tmdbId, seasonNum, episodeNum) {
  const stem = stemOf(matched.title_en || matched.title_ar);
  const cands = items
    .filter(i => stemOf(i.title_en || i.title_ar) === stem)
    .filter((i, idx, a) => a.findIndex(x => x.id === i.id) === idx);
  if (cands.length === 0) return null;

  const infos = [];
  for (const en of cands) {
    try {
      const d = (await call(`api/anime/show.php?id=${en.id}`)).data || {};
      const seasons = d.seasons || [];
      const total = seasons.reduce((a, s) => a + (s.episodes_count || 0), 0);
      if (!total) continue;
      infos.push({
        en,
        seasons,
        total,
        year: parseInt(String(seasons[0].season_year || d.release_year || 0), 10),
        period: PERIOD_ORDER[seasons[0].season_period] != null ? PERIOD_ORDER[seasons[0].season_period] : 4,
      });
    } catch { continue; }
  }
  if (infos.length === 0) return null;
  infos.sort((a, b) => (a.year - b.year) || (a.period - b.period));

  const want = await tmdbSeasonCount(tmdbId, seasonNum);
  log(`split-anime: ${infos.length} siblings [${infos.map(i => `${i.total}@${i.year}`).join(", ")}] want=${want} for S${seasonNum}E${episodeNum}`);
  if (want) {
    const hit = infos.find(i => i.total === want);
    if (hit) return pickInternal(hit, episodeNum);
    let acc = 0;
    const group = [];
    for (const i of infos) {
      group.push(i); acc += i.total;
      if (acc >= want) break;
    }
    if (acc === want) {
      let ep = episodeNum;
      for (const g of group) {
        if (ep <= g.total) return pickInternal(g, ep);
        ep -= g.total;
      }
    }
  }
  const numHit = infos.find(i => entrySeasonNum(i.en.title_en || i.en.title_ar) === seasonNum);
  if (numHit) { log(`split-anime: fell back to number-in-title entry`); return pickInternal(numHit, episodeNum); }
  log(`split-anime: no entry matched TMDB S${seasonNum}`);
  return null;
}

function playHeaders(deepLink) {
  const h = { "User-Agent": PLAY_UA };
  const m = String(deepLink || "").match(/cookies=([^&]+)/);
  if (m) h["Cookie"] = decodeURIComponent(m[1]);
  return h;
}

async function toStreams(links, streamTitle) {
  const out = [];
  const seen = new Set();
  for (const l of (links || [])) {
    let url = l.url;
    if (!url || !/^https?:/.test(url)) continue;
    if (url.includes("newcdn.seriesmp4.com")) {
      try {
        const body = await fetch(url, { headers: { "User-Agent": PLAY_UA } }).then(r => r.text());
        const m = body.match(/src="(https:\/\/downloader\.disk\.yandex\.ru[^"]+)"/);
        if (!m) continue;
        url = m[1].replace(/&/g, "&");
      } catch { continue; }
    }
    if (seen.has(url)) continue;
    seen.add(url);
    const q = (l.quality || "").trim();
    out.push({
      name: `Oscar TV - ${l.server_name || "Server"}`,
      title: streamTitle,
      url,
      quality: !q || q === "متعدد" ? "Auto" : q,
      size: "Unknown",
      headers: playHeaders(l.deep_link),
      provider: "oscartv",
    });
  }
  return out;
}

async function episodeStreams(isAnime, showId, seasonNum, episodeNum, streamTitle, items, matched, tmdbId) {
  const base = isAnime ? "api/anime" : "api/series";
  const d = (await call(`${base}/show.php?id=${showId}`)).data || {};
  const seasons = d.seasons || [];
  let season = seasons.find(s => Number(s.season_number) === seasonNum);

  const split = isAnime && items && matched;
  if (season && split && season.episodes_count && episodeNum > season.episodes_count) {
    log(`season ${seasonNum} here has only ${season.episodes_count} eps, want E${episodeNum} -> sibling part-entries`);
    season = null;
  }

  if (!season && split) {
    const r = await resolveSplitAnime(items, matched, tmdbId, seasonNum, episodeNum);
    if (r) return episodeByNumber(isAnime, r.seasonId, r.epNum, streamTitle);
    return [];
  }

  if (!season && seasons.length === 1) season = seasons[0];
  if (!season) return [];
  const sid = season.season_id != null ? season.season_id : season.id;
  return episodeByNumber(isAnime, sid, episodeNum, streamTitle);
}

async function episodeByNumber(isAnime, seasonId, episodeNum, streamTitle) {
  const epPath = isAnime
    ? `api/anime/episodes/?season_id=${seasonId}`
    : `api/episodes/?season_id=${seasonId}`;
  const eps = ((await call(epPath)).data) || [];
  const ep = eps.find(x => Number(x.episode_number) === episodeNum) || eps[episodeNum - 1];
  if (!ep) return [];
  const epBase = isAnime ? "api/anime/episodes" : "api/episodes";
  const ed = (await call(`${epBase}/show.php?id=${ep.id}`)).data || {};
  return toStreams([...(ed.watch_links || []), ...(ed.download_links || [])], streamTitle);
}

async function getStreams(tmdbId, mediaType = "movie", seasonNum = null, episodeNum = null) {
  const isMovie = mediaType === "movie";
  const s = seasonNum || 1;
  const e = episodeNum || 1;
  log(`tmdb=${tmdbId} type=${mediaType}${isMovie ? "" : ` S${s}E${e}`}`);

  try {
    const { titles, year } = await tmdbTitles(tmdbId, mediaType);
    if (!titles.length) return [];
    const title = titles[0];
    log(`tmdb: "${title}" (${year})${titles.length > 1 ? ` +${titles.length - 1} alt` : ""}`);
    const streamTitle = `${title}${isMovie ? (year ? ` (${year})` : "") : ` S${String(s).padStart(2, "0")}E${String(e).padStart(2, "0")}`}`;

    if (isMovie) {
      const found = await findMovie(titles, year ? parseInt(year, 10) : null);
      if (!found) { log("not found on Oscar TV"); return []; }
      log(`matched: "${found.item.title_en || found.item.title_ar}" (id=${found.item.id})`);
      const d = found.data || (await call(`api/movies/show.php?id=${found.item.id}`).then(r => (r.data || {})));
      return toStreams([...(d.watch_links || []), ...(d.download_links || [])], streamTitle);
    }

    const found = await findShow(titles);
    if (!found) { log("not found on Oscar TV"); return []; }
    log(`matched: "${found.item.title_en || found.item.title_ar}" (id=${found.item.id}, ${found.kind})`);
    return episodeStreams(found.kind === "anime", found.item.id, s, e, streamTitle, found.items, found.item, tmdbId);
  } catch (err) {
    log(`error: ${err.message}`);
    return [];
  }
}

module.exports = { getStreams };

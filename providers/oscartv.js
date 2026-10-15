// Oscar TV Scraper for Nuvio

const TMDB_KEY = "1c29a5198ee1854bd5eb45dbe8d17d92";
const TMDB = "https://api.themoviedb.org/3";
const MAIN = "https://ostv-11-11.xyz";
const STEP1 = "https://flech.tn/scrapefinal/dramabox/step1_prepare_oscar.php";
const PLAY_UA = "TDMuaHLS99";
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

const log = (...a) => console.log("[OscarTV]", ...a);

// flech.tn computes fresh X-Iron-* headers per URL -> required for every API call
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
    // verify the year when the site has one — same-title remakes are common
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
      if (hit) return { kind, item: hit };
    }
  }
  return null;
}

// cdn.mediaoscar.com redirects to a 1-min notice video without the deep_link cookie
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
    // YNMov links are Yandex Disk wrapper pages -> resolve the iframe
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

async function episodeStreams(isAnime, showId, seasonNum, episodeNum, streamTitle) {
  const base = isAnime ? "api/anime" : "api/series";
  const d = (await call(`${base}/show.php?id=${showId}`)).data || {};
  const seasons = d.seasons || [];
  let season = seasons.find(s => Number(s.season_number) === seasonNum);
  if (!season && seasons.length === 1) season = seasons[0]; // single-season shows often have no number
  if (!season) return [];
  const sid = season.season_id != null ? season.season_id : season.id;
  const epPath = isAnime
    ? `api/anime/episodes/?season_id=${sid}`
    : `api/episodes/?season_id=${sid}`;
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
    return episodeStreams(found.kind === "anime", found.item.id, s, e, streamTitle);
  } catch (err) {
    log(`error: ${err.message}`);
    return [];
  }
}

module.exports = { getStreams };

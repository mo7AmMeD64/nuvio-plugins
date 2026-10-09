// CinemaBox Scraper for Nuvio

const TMDB_KEY = "1c29a5198ee1854bd5eb45dbe8d17d92";
const API = "https://cinema.albox.co/api/v4";

const HEADERS = {
  "User-Agent": "Dalvik/2.1.0 (Linux; U; Android 14; 23043RP34G Build/UKQ1.240624.001)",
  "Accept-Language": "en",
  "Device-Id": "a1b2c3d4e5f60718",
  "Device-Model": "Xiaomi 23043RP34G",
  "Device-OS-Version": "14",
  "Device-Store": "googleplay",
  "App-Version": "4.6.12",
  "X-Hide-Sensitive-Content": "true",
  "X-Local-Before": "true",
  "X-ISP-ID": "1"
};

const log = (...a) => console.log("[CinemaBox]", ...a);

async function api(path) {
  const res = await fetch(`${API}/${path}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function tmdbTitles(tmdbId, mediaType) {
  const type = mediaType === "tv" ? "tv" : "movie";
  const res = await fetch(`https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=${TMDB_KEY}&append_to_response=alternative_titles`, { headers: HEADERS });
  const d = await res.json();
  const main = d.name || d.title || "";
  const alt = ((d.alternative_titles || {}).results || []).map(t => t.title);
  return {
    titles: [main, ...alt].filter(Boolean),
    year: (d.first_air_date || d.release_date || "").split("-")[0] || null
  };
}

const norm = s => (s || "").toLowerCase().replace(/[^a-z0-9\u0600-\u06FF]+/g, "").trim();

async function findShow(title, year, wantSeries) {
  const wantType = wantSeries ? "SERIES" : "MOVIE";
  for (let page = 1; page <= 3; page++) {
    let d;
    try {
      d = await api(`search?page_size=25&page_number=${page}&term=${encodeURIComponent(title)}`);
    } catch { return null; }
    const results = d.results || [];
    if (results.length === 0) break;

    const typed = results.filter(r => (r.type || "").toUpperCase() === wantType);
    const sameEra = typed.filter(r => !year || !r.year || Math.abs(r.year - year) <= 1);
    const pool = sameEra.length > 0 ? sameEra : typed;

    const exact = pool.find(r => norm(r.title) === norm(title));
    if (exact) return exact;

    const close = pool.find(r =>
      norm(r.title).includes(norm(title)) || norm(title).includes(norm(r.title))
    );
    if (close) return close;

    if ((d.pagination || {}).total_pages && page < d.pagination.total_pages) continue;
  }
  return null;
}

async function seasonIdFor(showId, seasonNum) {
  const d = await api(`shows/shows/dynamic/${showId}`);
  const info = d.post_info || {};
  const sections = d.sections || [];

  const seasonCards = sections
    .filter(s => s.section_type === "normalPoster")
    .flatMap(s => s.data || [])
    .filter(c => (c.type || "").toLowerCase() === "season");

  const wanted = seasonCards.find(c => {
    const n = parseInt((c.title || "").match(/\d+/)?.[0] || "0", 10);
    return n === seasonNum;
  });

  const seasonsFound = seasonCards.map(c => c.title).join(",");
  log(`seasons on site: [${seasonsFound}] wanted: ${seasonNum}`);
  return wanted ? wanted.id : (info.current_season_id || null);
}

async function episodeIdFor(showId, seasonNum, episodeNum, seasonId) {
  const d = await api(`shows/shows/dynamic/${showId}?season_id=${seasonId}`);
  const info = d.post_info || {};
  if (String(info.current_season_id || "") !== String(seasonId)) return null;

  const epSection = (d.sections || []).find(s => s.section_type === "episodes");
  const cards = (epSection || {}).data || [];

  const wanted = cards.find(c => {
    const n = parseInt(String(c.description || "").match(/\d+/)?.[0] || (c.title || "").match(/\d+/)?.[0] || "0", 10);
    return n === episodeNum;
  });
  if (wanted) return wanted.id;

  const idx = cards.findIndex(c => c.id);
  return cards.length > 0 ? cards[Math.min(episodeNum, cards.length) - 1].id : null;
}

async function playerStreams(playerId, streamTitle) {
  const d = await api(`shows/episodes/player/${playerId}`);
  if (!d || !Array.isArray(d.videos)) return [];

  const subs = (d.subtitles || []).map(s => ({
    url: s.vtt || s.srt || "",
    lang: s.language || "ar"
  })).filter(s => s.url);

  return d.videos.map((v, i) => ({
    name: `CinemaBox - ${v.quality || `Server ${i + 1}`}`,
    title: streamTitle,
    url: v.url,
    quality: v.quality || "Auto",
    size: "Unknown",
    headers: HEADERS,
    subtitles: subs,
    provider: "cinemabox"
  }));
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

    let show = null;
    for (const t of titles) {
      show = await findShow(t, parseInt(year || "0", 10) || null, !isMovie);
      if (show) break;
    }
    if (!show) { log("not found on CinemaBox"); return []; }
    log(`matched: "${show.title}" (id=${show.id})`);

    const streamTitle = `${title}${isMovie ? (year ? ` (${year})` : "") : ` S${String(s).padStart(2, "0")}E${String(e).padStart(2, "0")}`}`;

    if (isMovie) return await playerStreams(show.id, streamTitle);

    const sid = await seasonIdFor(show.id, s);
    if (!sid) { log(`season ${s} not found`); return []; }

    const epId = await episodeIdFor(show.id, s, e, sid);
    if (!epId) { log(`episode ${e} not found`); return []; }

    return await playerStreams(epId, streamTitle);
  } catch (err) {
    log(`error: ${err.message}`);
    return [];
  }
}

module.exports = { getStreams };

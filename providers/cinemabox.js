// CinemaBox Scraper for Nuvio

const TMDB_KEY = "1c29a5198ee1854bd5eb45dbe8d17d92";
const TMDB = "https://api.themoviedb.org/3";
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
  const res = await fetch(`${TMDB}/${type}/${tmdbId}?api_key=${TMDB_KEY}&append_to_response=alternative_titles`, { headers: HEADERS });
  const d = await res.json();
  const main = d.name || d.title || "";
  const alt = ((d.alternative_titles || {}).results || []).map(t => t.title);
  return {
    titles: [main, ...alt].filter(Boolean),
    year: (d.first_air_date || d.release_date || "").split("-")[0] || null
  };
}

async function tmdbEpisodeCount(tmdbId, seasonNum) {
  try {
    const res = await fetch(`${TMDB}/tv/${tmdbId}/season/${seasonNum}?api_key=${TMDB_KEY}`, { headers: HEADERS });
    const d = await res.json();
    return (d.episodes || []).length || null;
  } catch { return null; }
}

const norm = s => (s || "").toLowerCase().replace(/[^a-z0-9\u0600-\u06FF]+/g, "").trim();
const num = s => parseInt((s || "").match(/\d+/)?.[0] || "0", 10);

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

async function showDetails(showId) {
  const d = await api(`shows/shows/dynamic/${showId}`);
  return {
    info: d.post_info || {},
    seasonCards: (d.sections || [])
      .filter(s => s.section_type === "normalPoster")
      .flatMap(s => s.data || [])
      .filter(c => (c.type || "").toLowerCase() === "season")
  };
}

async function seasonEpisodes(showId, seasonId) {
  try {
    const d = await api(`shows/shows/dynamic/${showId}?season_id=${seasonId}`);
    if (String((d.post_info || {}).current_season_id || "") !== String(seasonId)) return [];
    return (((d.sections || []).find(s => s.section_type === "episodes") || {}).data) || [];
  } catch { return []; }
}

// The site splits anime into parts, so season numbers can be duplicated or shifted
// vs TMDB (e.g. Mushoku Tensei: site cards [1,2,2,4,5] vs TMDB S1/S2/S3).
// Resolve by episode-count match against TMDB when the number alone is ambiguous.
async function resolveSeason(showId, seasonNum, tmdbId) {
  const { info, seasonCards } = await showDetails(showId);
  log(`seasons on site: [${seasonCards.map(c => c.title).join(",")}] wanted: ${seasonNum}`);

  const numbered = seasonCards.filter(c => num(c.title) === seasonNum);
  if (numbered.length === 1) return { seasonId: numbered[0].id, cards: await seasonEpisodes(showId, numbered[0].id) };

  const wantCount = await tmdbEpisodeCount(tmdbId, seasonNum);
  if (wantCount) {
    const pools = numbered.length ? [numbered, seasonCards] : [seasonCards];
    for (const pool of pools) {
      for (const c of pool) {
        const cards = await seasonEpisodes(showId, c.id);
        if (cards.length === wantCount) {
          log(`count-match: card "${c.title}" = ${cards.length} eps (tmdb wants ${wantCount})`);
          return { seasonId: c.id, cards };
        }
      }
    }
  }

  const fallback = numbered[0] || seasonCards[seasonNum - 1];
  if (fallback) return { seasonId: fallback.id, cards: await seasonEpisodes(showId, fallback.id) };
  return { seasonId: info.current_season_id || null, cards: [] };
}

async function playerStreams(playerId, streamTitle) {
  const d = await api(`shows/episodes/player/${playerId}`);
  if (!d || !Array.isArray(d.videos)) return [];

  const subs = (d.subtitles || []).map(s => ({
    url: s.vtt || s.srt || "",
    language: s.language || "ar",
    name: s.language || "Arabic"
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

    const { seasonId, cards } = await resolveSeason(show.id, s, tmdbId);
    if (!seasonId) { log(`season ${s} not found`); return []; }

    const ep = cards.find(c => num(String(c.description || "")) === e || num(c.title) === e)
      || cards[e - 1];
    if (!ep) { log(`episode ${e} not found`); return []; }

    return await playerStreams(ep.id, streamTitle);
  } catch (err) {
    log(`error: ${err.message}`);
    return [];
  }
}

module.exports = { getStreams };

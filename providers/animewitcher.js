// AnimeWitcher Scraper for Nuvio
// Ported from Abodabodd's CloudStream provider. The site's app backend is
// Algolia (search) + Firebase Firestore (episodes/servers); the same public
// REST endpoints are used here, including the remote "serverWords" markers
// that pull direct video links out of host pages without a plugin release.

const TMDB_KEY = "1c29a5198ee1854bd5eb45dbe8d17d92";
const TMDB = "https://api.themoviedb.org/3";
const FIREBASE_PROJECT = "animewitcher-1c66d";
const FIREBASE_KEY = "AIzaSyAcbWRwfFNnCpoydDXlEALWnM_TYVcJOMU";
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

// keys rotate (the shipped CloudStream build's are already stale); refresh from
// the app's Firestore config and retry, same as the app does
let ALGOLIA = { appId: "QVHT7NPEJG", apiKey: "ce13098070fa521b536571bafbcfc083" };

const TYPE_SERIES = "\u0645\u0633\u0644\u0633\u0644"; // مسلسل
const TYPE_MOVIE = "\u0641\u064a\u0644\u0645"; // فيلم

const log = (...a) => console.log("[AnimeWitcher]", ...a);

const firestore = path =>
  fetch(
    `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents/${path}?key=${FIREBASE_KEY}`
  ).then(r => r.json());

async function refreshAlgoliaKeys() {
  try {
    const f = ((await firestore("Settings/constants")).fields || {}).search_settings?.mapValue?.fields || {};
    const appId = f.app_id_v3?.stringValue || f.app_id?.stringValue;
    const apiKey = f.api_key?.stringValue;
    if (appId && apiKey) {
      ALGOLIA = { appId, apiKey };
      log("algolia keys refreshed");
    }
  } catch {}
}

async function searchSeries(term) {
  const url = () => `https://${ALGOLIA.appId}-dsn.algolia.net/1/indexes/series/query`;
  const options = () => ({
    method: "POST",
    headers: {
      "X-Algolia-Application-Id": ALGOLIA.appId,
      "X-Algolia-API-Key": ALGOLIA.apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ params: `hitsPerPage=50&query=${encodeURIComponent(term)}` }),
  });
  let res = await fetch(url(), options());
  if (!res.ok) {
    await refreshAlgoliaKeys();
    res = await fetch(url(), options());
  }
  if (!res.ok) throw new Error(`algolia HTTP ${res.status}`);
  return (await res.json()).hits || [];
}

async function tmdbTitles(tmdbId, mediaType) {
  const type = mediaType === "tv" ? "tv" : "movie";
  const res = await fetch(`${TMDB}/${type}/${tmdbId}?api_key=${TMDB_KEY}&append_to_response=alternative_titles`);
  const d = await res.json();
  const main = d.name || d.title || "";
  const alt = ((d.alternative_titles || {}).results || []).map(t => t.title);
  return {
    titles: [main, ...alt].filter(Boolean),
    year: (d.first_air_date || d.release_date || "").split("-")[0] || null,
  };
}

async function tmdbSeason(tmdbId, seasonNum) {
  try {
    const res = await fetch(`${TMDB}/tv/${tmdbId}/season/${seasonNum}?api_key=${TMDB_KEY}`);
    const d = await res.json();
    const count = (d.episodes || []).length || null;
    const year = d.air_date ? parseInt(d.air_date.slice(0, 4), 10) : null;
    return { count, year };
  } catch { return { count: null, year: null }; }
}

const norm = s => (s || "").toLowerCase().replace(/[^a-z0-9\u0600-\u06FF]+/g, "").trim();

const ROMAN = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10, xi: 11, xii: 12 };

// strip season/part markers to compare "same show" titles
function stemOf(t) {
  return norm(String(t || "")
    .replace(/\b(X{0,3}(?:IX|IV|V?I{1,3}))\b/g, " ")
    .replace(/\b\d+(?:st|nd|rd|th)\s+season\b/gi, " ")
    .replace(/\b(?:season|part|pt)\s*[0-9ivx]+\b/gi, " ")
    .replace(/\bS\d{1,2}\b/g, " "));
}

// season number carried by the title itself ("... II", "... 3rd Season", "... S3")
function seasonOfName(t) {
  const s = String(t || "");
  let m = s.match(/\b(X{0,3}(?:IX|IV|V?I{1,3}))\b/);
  if (m && ROMAN[m[1].toLowerCase()]) return ROMAN[m[1].toLowerCase()];
  m = s.match(/\b(\d+)(?:st|nd|rd|th)\s+season\b/i) ||
      s.match(/\bseason\s*([0-9]+)\b/i) ||
      s.match(/\bS(\d{1,2})\b/) ||
      s.match(/(?:\u0627\u0644\u0645\u0648\u0633\u0645|\u0627\u0644\u062c\u0632\u0621)\s*([\u0660-\u06690-9]+)/);
  if (!m) return null;
  const digits = String(m[1]).replace(/[\u0660-\u0669]/g, d => "\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669".indexOf(d));
  return parseInt(digits, 10) || null;
}

async function episodesOf(animePath) {
  const d = await firestore(`anime_list/${encodeURIComponent(animePath)}/episodes_summery/summery`);
  const values = d.fields?.episodes?.arrayValue?.values || [];
  // some entries carry a "000" (الحلقة 0) special — it is not a real episode
  return values
    .map(v => {
      const id = v.mapValue?.fields?.doc_id?.stringValue;
      return id ? { id, n: parseInt(id, 10) } : null;
    })
    .filter(e => e && e.n !== 0);
}

function parseServer(f) {
  return {
    name: f.name?.stringValue || "",
    quality: f.quality?.stringValue || "",
    link: f.link?.stringValue || "",
    orig: f.original_link?.stringValue || null,
    visible: f.visible?.booleanValue !== false,
  };
}

async function fetchServers(animePath, epId) {
  const base = `anime_list/${encodeURIComponent(animePath)}/episodes/${encodeURIComponent(epId)}`;
  try {
    const d = await firestore(`${base}/servers2/all_servers`);
    const list = (d.fields?.servers?.arrayValue?.values || [])
      .map(v => parseServer(v.mapValue?.fields || {}))
      .filter(s => s.name && s.link);
    if (list.length) return list;
  } catch {}
  try {
    const d = await firestore(`${base}/servers`);
    return (d.documents || []).map(x => parseServer(x.fields || {})).filter(s => s.name && s.link && s.visible);
  } catch { return []; }
}

const wordsCache = {};
async function serverWords(name) {
  if (!(name in wordsCache)) {
    wordsCache[name] = null;
    try {
      const f = (await firestore(`Settings/servers/servers/${encodeURIComponent(name)}`)).fields || {};
      wordsCache[name] = {
        w1: f.word1?.stringValue, w2: f.word2?.stringValue,
        w3: f.word3?.stringValue, w4: f.word4?.stringValue,
      };
    } catch {}
  }
  return wordsCache[name];
}

async function resolveMediaFire(link) {
  const html = await fetch(link, { headers: { "User-Agent": BROWSER_UA } }).then(r => r.text());
  // the download button href on /file/ pages is the direct CDN link
  return html.match(/href="(https:\/\/download[^"]*\.mediafire\.com\/[^"]+)"/)?.[1] || null;
}

function resolvePixeldrain(link) {
  // og:video on /u/ pages is exactly the /api/file/ endpoint
  const m = link.match(/pixeldrain\.com\/u\/([A-Za-z0-9_-]+)/);
  return m ? `https://pixeldrain.com/api/file/${m[1]}` : null;
}

async function resolveStreamtape(link) {
  const html = await fetch(link, { headers: { "User-Agent": BROWSER_UA } }).then(r => r.text());
  const m = html.match(/robotlink['"]\)\.innerHTML\s*=\s*'([^']*)'\s*\+\s*'([^']*)'/) ||
            html.match(/robotlink['"]\)\.innerHTML\s*=\s*'([^']+)'/);
  // shortcut: streamtape's current markup; the site's ST files are all dead right
  // now so this could not be checked live — re-verify when ST files come back
  if (!m) return null;
  const raw = (m[2] != null ? m[1] + m[2] : m[1]).replace(/&amp;/g, "&");
  return raw.startsWith("//") ? `https:${raw}` : raw;
}

async function resolveKrakenFiles(link) {
  const w = await serverWords("KF");
  if (!w?.w1 || !w.w2) return null;
  const html = await fetch(link, { headers: { "User-Agent": BROWSER_UA } }).then(r => r.text());
  if (!html.includes(w.w1) || !html.includes(w.w2)) return null;
  return `https://${html.split(w.w1)[1].split(w.w2)[0].replace(/&amp;/g, "&")}`;
}

async function resolveVidTube(link) {
  const w = await serverWords("VT");
  if (!w?.w1 || !w.w2 || !w.w3 || !w.w4) return null;
  const page1 = await fetch(link, { headers: { "User-Agent": BROWSER_UA } }).then(r => r.text());
  const part1 = page1.split(w.w1)[1]?.split(w.w2)[0]?.replace('">', "").trim();
  if (!part1) return null;
  const page2 = await fetch(`https://vidtube.one${part1}`, { headers: { "User-Agent": BROWSER_UA } }).then(r => r.text());
  const part2 = page2.split(w.w3)[1]?.split(w.w4)[0];
  return part2 ? `https://${part2}` : null;
}

async function resolveByWords(link, name) {
  const w = await serverWords(name);
  if (!w?.w1 || !w.w2) return null;
  const html = await fetch(link, { headers: { "User-Agent": BROWSER_UA } }).then(r => r.text());
  if (!html.includes(w.w1) || !html.includes(w.w2)) return null;
  return html.split(w.w1)[1].split(w.w2)[0].replace(/&amp;/g, "&").trim() || null;
}

async function resolveServer(server) {
  const name = server.name.toUpperCase();
  const link = server.link;
  switch (name) {
    case "MF": return resolveMediaFire(link);
    case "PD": return resolvePixeldrain(link);
    case "ST": return resolveStreamtape(link);
    case "KF": return resolveKrakenFiles(link);
    case "VT": return resolveVidTube(link);
    case "AR": return fetch(link, { redirect: "follow", headers: { "User-Agent": BROWSER_UA } }).then(r => r.url).catch(() => null);
    case "WC": return fetch(link, { redirect: "manual", headers: { "User-Agent": BROWSER_UA } }).then(r => r.headers.get("location")).catch(() => null);
    case "MG": case "BU": return link;
    case "QI": return server.orig || link;
    default: return resolveByWords(link, name);
  }
}

// The site splits seasons into separate entries ("... II", "... 2nd Season",
// "... Part 2"), like most anime sites. Pick the entry (or consecutive group of
// entries) whose episode counts add up to the TMDB season, then walk to the
// requested episode.
async function resolveEntry(anchor, hits, tmdbId, seasonNum, episodeNum, pathOf) {
  const stem = stemOf(anchor.name);
  const fam = hits.filter(h => h.name && (stemOf(h.name) === stem ||
    (norm(h.name).startsWith(stem) && seasonOfName(h.name) == null)));

  // entries that name their season outright win; S1 also accepts unnumbered ones
  const bare = fam.filter(h => seasonOfName(h.name) == null);
  const explicit = fam.filter(h => seasonOfName(h.name) === seasonNum);
  const cands0 = explicit.length ? explicit : seasonNum === 1 ? bare : fam;
  const cands = (cands0.length ? cands0 : fam).sort((a, b) =>
    (parseInt(a.details?.year || "0", 10) || 0) - (parseInt(b.details?.year || "0", 10) || 0) ||
    String(a.details?.start_date || "").localeCompare(String(b.details?.start_date || "")));

  const metas = [];
  for (const h of cands) {
    try {
      const eps = await episodesOf(pathOf(h));
      if (eps.length) metas.push({ h, eps });
    } catch {}
  }
  if (!metas.length) return null;

  const snap = (m, ep) => {
    const epObj = m.eps.find(x => x.n === ep) || m.eps[ep - 1];
    return epObj ? { path: pathOf(m.h), ep: epObj.id } : null;
  };

  // 1) a single entry that IS the whole season, by TMDB episode count;
  //    same-count arcs (e.g. Kimetsu) are told apart by season air year
  const want = await tmdbSeason(tmdbId, seasonNum);
  const yearDist = m => (want.year ? Math.abs((parseInt(m.h.details?.year || "0", 10) || 0) - want.year) : 0);
  if (want.count) {
    const matches = metas.filter(m => m.eps.length === want.count).sort((a, b) => yearDist(a) - yearDist(b));
    if (matches.length) {
      const r = snap(matches[0], episodeNum);
      if (r) return r;
    }
    // 2) consecutive entries (air order) that together form the season
    let acc = 0;
    const group = [];
    for (const m of metas) {
      group.push(m);
      acc += m.eps.length;
      if (acc >= want.count) break;
    }
    if (acc === want.count) {
      let ep = episodeNum;
      for (const m of group) {
        if (ep <= m.eps.length) {
          const r = snap(m, ep);
          if (r) return r;
        }
        ep -= m.eps.length;
      }
    }
  }

  // 3) last resort: first entry that can hold the episode number
  const m = metas.find(x => x.eps.length >= episodeNum) || metas[0];
  return snap(m, episodeNum);
}

async function getStreams(tmdbId, mediaType = "movie", seasonNum = null, episodeNum = null) {
  const isMovie = mediaType === "movie";
  const s = seasonNum || 1;
  const e = episodeNum || 1;
  log(`tmdb=${tmdbId} type=${mediaType}${isMovie ? "" : ` S${s}E${e}`}`);

  try {
    const { titles, year } = await tmdbTitles(tmdbId, mediaType);
    if (!titles.length) return [];
    const wantType = isMovie ? TYPE_MOVIE : TYPE_SERIES;
    const yearOf = h => parseInt(h.details?.year || "0", 10) || 0;
    const yearOk = h => !yearOf(h) || yearOf(h) <= 1900 || !year || Math.abs(yearOf(h) - year) <= 1;
    const namesOf = h => [h.name, h.details?.english_title].filter(Boolean);
    const isExact = h => namesOf(h).some(x => titles.some(t => norm(x) === norm(t)));
    const isClose = h => namesOf(h).some(x =>
      titles.some(t => {
        const xN = norm(x), tN = norm(t);
        return xN && tN && (xN.includes(tN) || tN.includes(xN));
      }));

    const pool = new Map();
    const collect = async term => {
      try {
        for (const h of await searchSeries(term)) if ((h.type || "") === wantType) pool.set(h.objectID, h);
      } catch (err) { log(`search "${term}" failed: ${err.message}`); }
    };
    for (const t of titles) {
      await collect(t);
      if ([...pool.values()].some(h => isExact(h) && yearOk(h))) break;
    }
    let hits = [...pool.values()];
    const anchor =
      hits.find(h => isExact(h) && yearOk(h)) ||
      hits.find(isExact) ||
      hits.find(h => isClose(h) && yearOk(h)) ||
      hits.find(isClose);
    if (!anchor) { log("not found on AnimeWitcher"); return []; }
    log(`matched: "${anchor.name}" (${anchor.details?.year || "?"})`);

    // one more search under the site's own title to pull the whole season family
    if (!isMovie) {
      await collect(anchor.name);
      hits = [...pool.values()];
    }

    const pathOf = h => String(h.path || h.doc_ref || "").replace(/^anime_list\//, "").replace(/^\/+/, "");
    const streamTitle = `${titles[0]}${isMovie ? (year ? ` (${year})` : "") : ` S${String(s).padStart(2, "0")}E${String(e).padStart(2, "0")}`}`;

    let chosen;
    if (isMovie) {
      const eps = await episodesOf(pathOf(anchor));
      if (!eps.length) { log("no episodes"); return []; }
      chosen = { path: pathOf(anchor), ep: eps[0].id };
    } else {
      chosen = await resolveEntry(anchor, hits, tmdbId, s, e, pathOf);
      if (!chosen) { log(`S${s}E${e} not found`); return []; }
    }

    const servers = await fetchServers(chosen.path, chosen.ep);
    if (!servers.length) { log("no servers"); return []; }

    const qInt = q => parseInt(String(q).replace(/\D/g, "") || "0", 10);
    const prio = x => { const n = x.name.toUpperCase(); return n === "PD" ? 0 : n === "PD EU TEST" ? 1 : 2; };
    servers.sort((a, b) => qInt(b.quality) - qInt(a.quality) || prio(a) - prio(b));

    const resolved = await Promise.all(servers.map(async x => {
      try {
        const url = await resolveServer(x);
        return url && !url.trim().startsWith("<") ? { server: x, url } : null;
      } catch (err) {
        log(`${x.name} resolve failed: ${err.message}`);
        return null;
      }
    }));

    const out = resolved.filter(Boolean).map(({ server, url }) => {
      const n = server.name.toUpperCase();
      const headers = { "User-Agent": BROWSER_UA };
      if (n === "ST") headers.Referer = "https://streamtape.com/";
      if (n === "KF") headers.Referer = "https://krakenfiles.com/";
      return {
        name: `AnimeWitcher - ${server.name}`,
        title: streamTitle,
        url,
        quality: server.quality || "Auto",
        size: "Unknown",
        headers,
        provider: "animewitcher",
      };
    });

    log(`returning ${out.length} streams`);
    return out;
  } catch (err) {
    log(`error: ${err.message}`);
    return [];
  }
}

module.exports = { getStreams };



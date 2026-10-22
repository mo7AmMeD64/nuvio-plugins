const TMDB_KEY = "1c29a5198ee1854bd5eb45dbe8d17d92";
const TMDB = "https://api.themoviedb.org/3";

let currentMainUrl = "https://akwam.ss";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const log = (...a) => console.log("[Akwam]", ...a);

const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9\u0600-\u06FF]+/g, "");

async function tmdbTitles(tmdbId, mediaType) {
  const type = mediaType === "tv" ? "tv" : "movie";
  const res = await fetch(`${TMDB}/${type}/${tmdbId}?api_key=${TMDB_KEY}&append_to_response=alternative_titles,translations`);
  const d = await res.json();
  const main = d.name || d.title || "";
  const alt = ((d.alternative_titles || {}).results || []).map((t) => t.title);
  const tr = ((d.translations || {}).translations || []).map((t) => (t.data || {}).title || (t.data || {}).name || "");
  return {
    titles: [...new Set([main, ...alt, ...tr].map((s) => (s || "").trim()).filter(Boolean))],
    year: (d.first_air_date || d.release_date || "").split("-")[0] || null,
  };
}

async function fetchDoc(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA, "Referer": currentMainUrl } });
  if (res.url) {
    try {
      const u = new URL(res.url);
      currentMainUrl = `${u.protocol}//${u.host}`;
    } catch (e) {}
  }
  const text = await res.text();
  return text;
}

async function searchAkwam(query) {
  const q = encodeURIComponent(query);
  const url = `${currentMainUrl}/search?q=${q}`;
  const html = await fetchDoc(url);
  
  const matches = [];
  const cardRegex = /<div class="col-lg-auto[^>]*>([\s\S]*?)<\/div>/g;
  let m;
  while ((m = cardRegex.exec(html)) !== null) {
    const block = m[1];
    const titleMatch = block.match(/h3[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!titleMatch) continue;
    const href = titleMatch[1];
    const title = titleMatch[2].replace(/<[^>]+>/g, "").trim();
    const posterMatch = block.match(/(?:data-src|src)="([^"]+)"/);
    const poster = posterMatch ? posterMatch[1] : "";
    matches.push({ title, href, poster });
  }
  return matches;
}

async function getStreams(tmdbId, mediaType = "movie", seasonNum = null, episodeNum = null) {
  const isMovie = mediaType === "movie";
  const s = seasonNum || 1;
  const e = episodeNum || 1;
  log(`tmdb=${tmdbId} type=${mediaType}${isMovie ? "" : ` S${s}E${e}`}`);

  try {
    const { titles, year } = await tmdbTitles(tmdbId, mediaType);
    if (!titles.length) return [];

    let matchedItem = null;
    for (const t of titles.slice(0, 5)) {
      const results = await searchAkwam(t);
      if (results.length > 0) {
        matchedItem = results[0];
        break;
      }
    }

    if (!matchedItem) {
      log("not found on Akwam");
      return [];
    }

    log(`matched: "${matchedItem.title}" (${matchedItem.href})`);
    
    let targetUrl = matchedItem.href;

    if (!isMovie) {
      const showHtml = await fetchDoc(targetUrl);
      const seasonsMap = {};
      
      const seasonBtnRegex = /href="([^"]+)"[^>]*>([^<]+Season[^<]*|[^<]+الموسم[^<]*|[^<]*\d+[^<]*)</g;
      let sm;
      while ((sm = seasonBtnRegex.exec(showHtml)) !== null) {
        let sUrl = sm[1];
        if (!sUrl.startsWith("http")) {
          const u = new URL(targetUrl);
          sUrl = `${u.protocol}//${u.host}${sUrl}`;
        }
        seasonsMap[sm[2].trim()] = sUrl;
      }

      const epRegex = /href="([^"]+\/episode\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
      const episodes = [];
      let em;
      while ((em = epRegex.exec(showHtml)) !== null) {
        episodes.push({ href: em[1], text: em[2].replace(/<[^>]+>/g, "").trim() });
      }

      const targetEp = episodes.find(ep => ep.text.includes(String(e)) || ep.text.includes(`الحلقة ${e}`)) || episodes[e - 1];
      if (targetEp) {
        targetUrl = targetEp.href;
        if (!targetUrl.startsWith("http")) {
          const u = new URL(targetUrl);
          targetUrl = `${u.protocol}//${u.host}${targetUrl}`;
        }
      }
    }

    const episodeHtml = await fetchDoc(targetUrl);
    const watchLinkMatch = episodeHtml.match(/href="([^"]+)"[^>]*class="[^"]*link-show[^"]*"/);
    if (!watchLinkMatch) {
      log("no watch link found");
      return [];
    }

    let watchUrl = watchLinkMatch[1];
    if (!watchUrl.startsWith("http")) {
      const u = new URL(targetUrl);
      watchUrl = `${u.protocol}//${u.host}${watchUrl}`;
    }

    const watchHtml = await fetchDoc(watchUrl);
    const sourceRegex = /<source[^>]+src="([^"]+)"[^>]*>/g;
    const streams = [];
    let srcMatch;
    while ((srcMatch = sourceRegex.exec(watchHtml)) !== null) {
      const videoUrl = srcMatch[1].replace(/&amp;/g, "&");
      const qualityMatch = srcMatch[0].match(/(?:size|label)="([^"]+)"/) || [];
      const quality = qualityMatch[1] || "720p";
      
      streams.push({
        name: `Akwam - ${quality}`,
        title: matchedItem.title,
        url: videoUrl,
        quality: quality.includes("p") ? quality : `${quality}p`,
        size: "Unknown",
        headers: { "User-Agent": UA, "Referer": watchUrl },
        provider: "akwam"
      });
    }

    log(`streams: ${streams.length}`);
    return streams;
  } catch (err) {
    log(`error: ${err && err.message}`);
    return [];
  }
}

module.exports = { getStreams };
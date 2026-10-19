const TMDB_KEY = "1c29a5198ee1854bd5eb45dbe8d17d92";
const TMDB = "https://api.themoviedb.org/3";

const BASE = "https://anime3rb.com";
const UA = "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36";
const VID_REFERER = "https://video.vid3rb.com/";
const TRUNCATED = /\.\.\.\[truncated\]$/;

const log = (...a) => console.log("[Anime3rb]", ...a);

const unesc = (s) => String(s || "")
  .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

const key = (s) => unesc(s).toLowerCase().replace(/[^a-z0-9\u0600-\u06FF]+/g, "");
const norm = (s) => unesc(s).toLowerCase().replace(/[^a-z0-9\u0600-\u06FF]+/g, " ").trim();
const pad2 = (n) => String(n).padStart(2, "0");

async function getText(url, headers) {
  const res = await fetch(url, { headers: Object.assign({ "User-Agent": UA }, headers || {}) });
  return { status: res.status, body: await res.text() };
}

function cookiesFrom(raw) {
  return String(raw || "")
    .split(/,\s*(?=[^;,=\s]+=)/)
    .map((c) => c.split(";")[0].trim())
    .filter((c) => /=/.test(c))
    .join("; ");
}

let session = null;

async function openSession() {
  const res = await fetch(BASE + "/", { headers: { "User-Agent": UA } });
  const body = await res.text();
  const csrf = (/livewire\.min\.js[^>]*data-csrf="([^"]+)"/.exec(body) || /data-csrf="([^"]+)"/.exec(body) || [])[1];
  const snapshot = (/<form[^>]*wire:snapshot="([^"]+)"/.exec(body) || /wire:snapshot="([^"]+)"/.exec(body) || [])[1];
  if (!csrf || !snapshot) return null;
  return { cookie: cookiesFrom(res.headers.get("set-cookie")), csrf, snapshot: unesc(snapshot) };
}

async function searchSite(query) {
  for (let i = 0; i < 2; i++) {
    if (!session) {
      session = await openSession().catch(() => null);
      if (!session) return [];
    }
    try {
      const res = await fetch(BASE + "/livewire/update", {
        method: "POST",
        headers: {
          "User-Agent": UA,
          Accept: "*/*",
          "Content-Type": "application/json",
          Origin: BASE,
          Referer: BASE + "/",
          Cookie: session.cookie,
        },
        body: JSON.stringify({
          _token: session.csrf,
          components: [{ snapshot: session.snapshot, updates: { query }, calls: [] }],
        }),
      });
      const body = await res.text();
      if (!body.trim().startsWith("{")) {
        session = null;
        continue;
      }
      const html = ((JSON.parse(body).components || [])[0] || {}).effects?.html || "";
      return parseCards(html);
    } catch (err) {
      session = null;
    }
  }
  return [];
}

function parseCards(html) {
  const cards = [];
  for (const m of html.matchAll(/<a[^>]+class="[^"]*simple-title-card[^"]*"[\s\S]*?<\/a>/g)) {
    const chunk = m[0];
    const href = /href="([^"]+)"/.exec(chunk)?.[1];
    const title = (/<h4[^>]*>([\s\S]*?)<\/h4>/.exec(chunk)?.[1] || "").replace(/<[^>]+>/g, "").trim();
    const aliases = (/<h5[^>]*>([\s\S]*?)<\/h5>/.exec(chunk)?.[1] || "").replace(/<[^>]+>/g, "").trim();
    if (href && title) cards.push({ url: href.startsWith("http") ? href : BASE + href, title: unesc(title), aliases: unesc(aliases) });
  }
  return cards;
}

async function tmdbInfo(tmdbId, mediaType) {
  const type = mediaType === "tv" ? "tv" : "movie";
  const res = await fetch(`${TMDB}/${type}/${tmdbId}?api_key=${TMDB_KEY}&append_to_response=alternative_titles`, {
    headers: { "User-Agent": UA },
  });
  const d = await res.json();
  const titles = [];
  for (const t of [d.name || d.title, d.original_name || d.original_title, ...(((d.alternative_titles || {}).results) || []).map((x) => x.title)]) {
    const v = String(t || "").trim();
    if (v && !titles.some((x) => key(x) === key(v))) titles.push(v);
  }
  const seasons = ((d.seasons || []).filter((x) => x.season_number > 0))
    .map((x) => ({ number: x.season_number, count: x.episode_count || 0 }));
  return {
    titles,
    year: parseInt((d.first_air_date || d.release_date || "").slice(0, 4), 10) || null,
    total: d.number_of_episodes || 0,
    seasons,
  };
}

const ROMAN = { ii: 2, iii: 3, iv: 4, vi: 6, vii: 7, viii: 8, ix: 9, xi: 11, xii: 12 };
const SEASON_ORD = /^(1st|2nd|3rd|[4-9]th)$/;

function seasonTag(title) {
  const words = norm(title).split(" ");
  let major = 1;
  let minor = 1;
  words.forEach((w, i) => {
    const next = words[i + 1] || "";
    if (ROMAN[w]) major = Math.max(major, ROMAN[w]);
    if (w === "season" && /^\d+$/.test(next)) major = Math.max(major, parseInt(next, 10));
    if (SEASON_ORD.test(w) && next === "season") major = Math.max(major, parseInt(w, 10) || 1);
    if ((w === "part" || w === "cour") && /^\d+$/.test(next)) minor = Math.max(minor, parseInt(next, 10));
  });
  return { major, minor };
}

function stemOf(title) {
  return norm(title)
    .replace(/\b(?:ii|iii|iv|vi|vii|viii|ix|xi|xii)\b/g, " ")
    .replace(/\b(?:1st|2nd|3rd|[4-9]th) season\b/g, " ")
    .replace(/\bseason \d+\b/g, " ")
    .replace(/\b(?:part|cour) \d+\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function titlePage(card, cache) {
  if (cache.has(card.url)) return cache.get(card.url);
  const res = await getText(card.url);
  const h1 = unesc((/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(res.body)?.[1] || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
  const eps = [];
  const seen = new Set();
  for (const m of res.body.matchAll(/<a[^>]+href="(https:\/\/anime3rb\.com\/episode\/[^"]+)"[\s\S]*?<\/a>/g)) {
    const n = parseInt((/الحلقة\s*(\d+)/.exec(m[0]) || [])[1], 10);
    if (n && !seen.has(n)) {
      seen.add(n);
      eps.push({ n, url: m[1] });
    }
  }
  eps.sort((a, b) => a.n - b.n);
  const page = {
    url: card.url,
    slug: (card.url.split("/titles/")[1] || "").replace(/[?#].*$/, ""),
    h1,
    series: /مسلسل/.test(h1),
    movie: !/مسلسل/.test(h1) && /فيلم/.test(h1),
    truncated: TRUNCATED.test(res.body),
    eps,
  };
  cache.set(card.url, page);
  return page;
}

const epByNumber = (page, n) => page.eps.find((x) => x.n === n) || null;
const contiguousFrom1 = (page) => page.eps.length > 0 && page.eps.every((x, i) => x.n === i + 1);

function chooseEpisode(metas, info, s, e, want, cumBefore) {
  const target = cumBefore + e;

  if (want) {
    const exact = metas.filter((m) => !m.page.truncated && m.page.eps.length === want);
    if (exact.length) {
      const tied = info.seasons.filter((x) => x.count === want).map((x) => x.number);
      const ord = Math.max(0, tied.indexOf(s));
      const pick = exact.find((m) => seasonTag(m.card.title).major === s) || exact[Math.min(ord, exact.length - 1)];
      const ep = epByNumber(pick.page, e);
      if (ep) return { page: pick.page, ep };
    }
  }

  const whole = info.total && metas.find((m) => !m.page.truncated && m.page.eps.length === info.total && info.total > (want || 0));
  if (whole) {
    const ep = epByNumber(whole.page, target);
    if (ep) return { page: whole.page, ep };
  }

  if (want) {
    const capped = metas.find((m) => m.page.truncated && contiguousFrom1(m.page) && m.page.eps.length > want && m.page.eps.length >= target);
    if (capped) {
      const ep = epByNumber(capped.page, target);
      if (ep) return { page: capped.page, ep };
    }
  }

  if (want) {
    const fam = metas.filter((m) => m.strict && !m.page.truncated).slice().sort((a, b) => {
      const ta = seasonTag(a.card.title);
      const tb = seasonTag(b.card.title);
      return ta.major - tb.major || ta.minor - tb.minor;
    });
    let pos = 0;
    const window = [];
    for (const m of fam) {
      const lo = pos;
      const hi = pos + m.page.eps.length;
      pos = hi;
      if (lo >= cumBefore + want) break;
      if (hi > cumBefore && lo < cumBefore + want) window.push({ m, lo });
    }
    const covered = window.reduce((a, x) => a + x.m.page.eps.length, 0);
    if (window.length && window[0].lo === cumBefore && covered === want) {
      let n = e;
      for (const item of window) {
        const ep = epByNumber(item.m.page, n);
        if (ep) return { page: item.m.page, ep };
        n -= item.m.page.eps.length;
      }
    }
  }

  const tagged = metas.filter((m) => seasonTag(m.card.title).major === s);
  for (const m of tagged) {
    const ep = epByNumber(m.page, e);
    if (ep) return { page: m.page, ep };
  }

  if (cumBefore === 0) {
    for (const m of metas) {
      const ep = epByNumber(m.page, e);
      if (ep) return { page: m.page, ep };
    }
  }

  return null;
}

const playerUrlFrom = (html) => {
  const m = /https:(?:\\\/|\/){2}video\.vid3rb\.com(?:\\\/|\/)player(?:\\\/|\/)[^"'\s]*?(?=&quot;|"|'|\s|$)/.exec(html);
  return m ? unesc(m[0].replace(/\\/g, "")) : null;
};

async function probeEpisode(metas, target) {
  const base = metas.find((m) => m.page.truncated && contiguousFrom1(m.page) && m.page.slug);
  if (!base || target < 1) return null;
  const url = `${BASE}/episode/${base.page.slug}/${target}`;
  const res = await getText(url).catch(() => null);
  if (!res || res.status !== 200) return null;
  const h1 = unesc((/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(res.body)?.[1] || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
  if (parseInt((/الحلقة\s*(\d+)/.exec(h1) || [])[1], 10) !== target) return null;
  return playerUrlFrom(res.body) ? { url } : null;
}

async function resolveStreams(epUrl, streamTitle) {
  const res = await getText(epUrl);
  if (res.status !== 200) return [];
  const playerUrl = playerUrlFrom(res.body);
  if (!playerUrl) return [];
  const player = await getText(playerUrl, { Referer: BASE + "/" });
  if (player.status !== 200) return [];
  let items = [];
  for (const m of player.body.matchAll(/var\s+video_sources\s*=\s*(\[[\s\S]*?\]);/g)) {
    try {
      const arr = JSON.parse(m[1]);
      if (Array.isArray(arr) && arr.length) items = arr;
    } catch (err) {}
  }
  const out = [];
  for (const it of items) {
    const src = String(it.src || "").trim();
    if (!src || it.premium === true || String(it.premium) === "true") continue;
    const label = String(it.label || "").trim() || "Auto";
    out.push({
      name: `Anime3rb - ${label}`,
      title: streamTitle,
      url: src,
      quality: label,
      size: "Unknown",
      headers: { "User-Agent": UA, Referer: VID_REFERER },
      provider: "anim3rb",
    });
  }
  if (!out.length) log("no playable sources");
  return out;
}

async function getStreams(tmdbId, mediaType = "movie", seasonNum = null, episodeNum = null) {
  const isMovie = mediaType === "movie";
  const s = seasonNum || 1;
  const e = episodeNum || 1;
  log(`tmdb=${tmdbId} type=${mediaType}${isMovie ? "" : ` S${s}E${e}`}`);

  try {
    const info = await tmdbInfo(tmdbId, mediaType);
    if (!info.titles.length) return [];

    const queries = info.titles.slice(0, 6);
    const pool = new Map();
    for (const q of queries) {
      for (const c of await searchSite(q)) if (!pool.has(c.url)) pool.set(c.url, c);
      const qk = key(q);
      if (qk.length >= 6 && [...pool.values()].some((c) => key(c.title) === qk || key(c.aliases).includes(qk))) break;
    }

    const cands = [...pool.values()]
      .map((c) => {
        let score = 0;
        queries.forEach((q, qi) => {
          const qk = key(q);
          if (qk.length < 4) return;
          const boost = qi === 0 ? 1 : 0;
          if (key(c.title) === qk) score = Math.max(score, 4 + boost);
          else if (qk.length >= 6 && key(c.aliases).includes(qk)) score = Math.max(score, 2 + boost);
          else if (qk.length >= 6 && (key(c.title).includes(qk) || qk.includes(key(c.title)))) score = Math.max(score, 1 + boost);
        });
        return { card: c, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.card);

    if (!cands.length) {
      log("not on Anime3rb");
      return [];
    }
    log(`matched "${cands[0].title}"`);

    const cache = new Map();

    if (isMovie) {
      for (const card of cands.slice(0, 4)) {
        const page = await titlePage(card, cache).catch(() => null);
        if (!page || !page.movie) continue;
        const ep = page.eps[0] || { url: `${BASE}/episode/${page.slug}/1` };
        const streams = await resolveStreams(ep.url, `${info.titles[0]}${info.year ? ` (${info.year})` : ""}`);
        if (streams.length) return streams;
      }
      log("no streams");
      return [];
    }

    const season = info.seasons.find((x) => x.number === s) || null;
    const want = season ? season.count : null;
    const cumBefore = info.seasons.filter((x) => x.number < s).reduce((a, x) => a + x.count, 0);
    const target = cumBefore + e;
    const streamTitle = `${info.titles[0]} S${pad2(s)}E${pad2(e)}`;

    for (const anchor of cands.slice(0, 3)) {
      const stem = stemOf(anchor.title);
      const ordered = cands.filter((c) => stemOf(c.title) === stem).slice()
        .sort((a, b) => {
          const ta = seasonTag(a.title);
          const tb = seasonTag(b.title);
          return ta.major - tb.major || ta.minor - tb.minor;
        });
      const extra = cands.filter((c) => stemOf(c.title) !== stem && key(c.title).startsWith(key(stem)));
      const metas = [];
      const load = async (list) => {
        for (const c of list) {
          if (metas.length >= 8 || metas.some((m) => m.card.url === c.url)) continue;
          if (/\b(movie|film)\b/i.test(c.title)) continue;
          const page = await titlePage(c, cache).catch(() => null);
          if (!page || !page.series || !page.eps.length) continue;
          metas.push({ card: c, page, strict: stemOf(c.title) === stem });
        }
      };

      await load(ordered.slice(0, 5));
      let hit = metas.length ? chooseEpisode(metas, info, s, e, want, cumBefore) : null;
      if (!hit) {
        await load(extra.slice(0, 4));
        hit = metas.length ? chooseEpisode(metas, info, s, e, want, cumBefore) : null;
      }

      if (hit) {
        log(`S${s}E${e} -> ${hit.ep.url}`);
        const streams = await resolveStreams(hit.ep.url, streamTitle);
        if (streams.length) return streams;
      }

      if (want) {
        const probe = await probeEpisode(metas, target);
        if (probe) {
          log(`S${s}E${e} -> ${probe.url}`);
          const streams = await resolveStreams(probe.url, streamTitle);
          if (streams.length) return streams;
        }
      }
    }

    log(`S${s}E${e} not resolved`);
    return [];
  } catch (err) {
    log(`error: ${err && err.message}`);
    return [];
  }
}

module.exports = { getStreams };

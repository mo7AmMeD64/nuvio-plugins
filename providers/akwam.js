const TMDB_KEY = "1c29a5198ee1854bd5eb45dbe8d17d92";
const TMDB = "https://api.themoviedb.org/3";

// Akwam moves domains often. ak.sv is the stable entry point (302 -> live domain, currently akwam.ss).
// Pages carry absolute links on whatever domain served them, so every link is re-based onto the
// domain that actually answered (same trick as the CloudStream provider's updateMainUrl).
const BASES = ["https://akwam.ss", "https://ak.sv", "https://akwam.cx"];
let activeBase = null;

// The video CDN behind <source> only works over plain http in the CloudStream provider
// (it rewrites https -> http). Set to false if your player prefers the https URL.
const FORCE_HTTP = true;

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const log = (...a) => console.log("[Akwam]", ...a);

const unesc = (s) => String(s == null ? "" : s)
  .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
  .replace(/&amp;/g, "&");

const toLatinDigits = (s) => String(s || "")
  .replace(/[\u0660-\u0669]/g, (d) => d.charCodeAt(0) - 0x660)
  .replace(/[\u06f0-\u06f9]/g, (d) => d.charCodeAt(0) - 0x6f0);

// Arabic-aware normalisation: digits, diacritics, tatweel, alef/yaa/taa-marbuta variants, latin accents
function normAr(s) {
  let t = toLatinDigits(s);
  try { t = t.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); } catch (e) {}
  return t.replace(/[\u064b-\u065f\u0670\u0640]/g, "").replace(/[\u0623\u0625\u0622\u0671]/g, "\u0627").replace(/\u0649/g, "\u064a").replace(/\u0629/g, "\u0647");
}

const key = (s) => normAr(unesc(s)).toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g, "");
const pad2 = (n) => String(n).padStart(2, "0");

const encChar = (c) => { try { return encodeURIComponent(c); } catch (e) { return ""; } };
const encodeNonAscii = (s) => String(s || "").replace(/[^\x21-\x7e]/gu, encChar);

const URL_RE = /^(https?:)?\/\/([^\/?#]+)([^?#]*)(\?[^#]*)?/i;

// "https://x.y/a/b?c=1#h" -> "/a/b?c=1"   (also accepts relative hrefs)
function pathOf(u) {
  const s = String(u || "").trim();
  const m = URL_RE.exec(s);
  if (m) return (m[3] || "/") + (m[4] || "");
  const p = s.replace(/#.*$/, "");
  return p.charAt(0) === "/" ? p : "/" + p.replace(/^\.?\//, "");
}

function absUrl(src, pageUrl) {
  const s = String(src || "").trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  const b = URL_RE.exec(pageUrl || "");
  const scheme = (b && b[1]) || "https:";
  if (s.slice(0, 2) === "//") return scheme + s;
  if (!b) return s;
  return `${scheme}//${b[2]}${s.charAt(0) === "/" ? "" : "/"}${s}`;
}

const PAGE_OK = /entry-title|widget-body|link-show|series-episodes|col-lg-auto|navbar|<source\b|<video\b/i;

async function rawGet(url, referer) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "ar,en;q=0.8",
      "Referer": encodeNonAscii(referer || (activeBase || BASES[0]) + "/"),
    },
  });
  const body = await res.text();
  return { status: res.status, body: String(body || ""), url: res.url || "" };
}

// GET a site path ("/search?q=..") from the first domain that answers with real Akwam markup.
async function getHtml(path, referer) {
  const bases = activeBase ? [activeBase].concat(BASES.filter((b) => b !== activeBase)) : BASES;
  const tried = [];
  for (const base of bases) {
    try {
      const r = await rawGet(base + encodeNonAscii(path), referer);
      const real = r.body.length > 500 && PAGE_OK.test(r.body);
      if (r.status >= 200 && r.status < 400 && real) {
        const fin = URL_RE.exec(r.url);
        activeBase = fin && fin[1] && fin[2] ? `${fin[1]}//${fin[2]}` : base;
        return r;
      }
      if (r.status === 404 && real) return null;
      tried.push(`${base} -> ${r.status}`);
    } catch (err) {
      tried.push(`${base} -> ${err && err.message}`);
    }
  }
  log(`unreachable ${path.slice(0, 70)} (${tried.join("; ")})`);
  return null;
}

async function tmdbInfo(tmdbId, mediaType) {
  const type = mediaType === "tv" ? "tv" : "movie";
  const res = await fetch(`${TMDB}/${type}/${tmdbId}?api_key=${TMDB_KEY}&append_to_response=alternative_titles,translations`, {
    headers: { "User-Agent": UA },
  });
  const d = await res.json();
  const ar = (((d.translations || {}).translations) || []).find((t) => t.iso_639_1 === "ar");
  const arTitle = ar && ar.data ? (ar.data.title || ar.data.name || "") : "";
  const alt = d.alternative_titles || {};
  const raw = [d.title || d.name, arTitle, d.original_title || d.original_name]
    .concat((alt.results || alt.titles || []).slice(0, 40).map((x) => x.title));
  const titles = [];
  const seenKeys = new Set();
  for (const t of raw) {
    const v = String(t || "").trim();
    const k = key(v);
    if (v && k && !seenKeys.has(k)) {
      seenKeys.add(k);
      titles.push(v);
    }
  }
  const seasons = (d.seasons || []).filter((x) => x.season_number > 0).map((x) => ({
    number: x.season_number,
    count: x.episode_count || 0,
    year: parseInt(String(x.air_date || "").slice(0, 4), 10) || null,
  }));
  return {
    titles,
    year: parseInt(String(d.first_air_date || d.release_date || "").slice(0, 4), 10) || null,
    seasons,
  };
}

// ---------- tiny HTML parser: lets us use the same selectors as the CloudStream provider ----------
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
const TOKEN = /<!--[\s\S]*?-->|<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>|<\/([a-zA-Z][^\s>\/]*)[^>]*>|<([a-zA-Z][^\s>\/]*)((?:"[^"]*"|'[^']*'|[^'">])*)>|<!?[^>]*>|[^<]+|</g;
const ATTR = /([^\s=\/"'<>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;

function parseAttrs(s) {
  const out = {};
  ATTR.lastIndex = 0;
  let m;
  while ((m = ATTR.exec(s))) {
    const k = m[1].toLowerCase();
    if (!(k in out)) out[k] = unesc(m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4] !== undefined ? m[4] : "");
  }
  return out;
}

function parseHtml(html) {
  const root = { tag: "#root", attrs: {}, kids: [], parent: null };
  let cur = root;
  TOKEN.lastIndex = 0;
  let m;
  while ((m = TOKEN.exec(html))) {
    if (m[1]) continue;
    if (m[2]) {
      const name = m[2].toLowerCase();
      let n = cur;
      while (n !== root && n.tag !== name) n = n.parent;
      if (n !== root) cur = n.parent;
      continue;
    }
    if (m[3]) {
      const tag = m[3].toLowerCase();
      const node = { tag, attrs: parseAttrs(m[4] || ""), kids: [], parent: cur };
      cur.kids.push(node);
      if (!VOID.has(tag) && !/\/\s*$/.test(m[4] || "")) cur = node;
      continue;
    }
    const t = m[0];
    if (t.charAt(0) !== "<" || t === "<") cur.kids.push(unesc(t));
  }
  return root;
}

const isEl = (n) => typeof n !== "string";
const hasClass = (n, c) => (" " + String((n.attrs && n.attrs.class) || "").replace(/\s+/g, " ") + " ").indexOf(" " + c + " ") >= 0;

function all(node, pred, out) {
  out = out || [];
  for (const k of node.kids) {
    if (!isEl(k)) continue;
    if (pred(k)) out.push(k);
    all(k, pred, out);
  }
  return out;
}

const first = (node, pred) => all(node, pred)[0] || null;
const byId = (root, id) => first(root, (n) => n.attrs.id === id);
const textOf = (n) => (isEl(n) ? n.kids.map(textOf).join(" ") : n);
const squash = (s) => String(s || "").replace(/\s+/g, " ").trim();
const within = (n, box) => { for (let p = n.parent; p; p = p.parent) if (p === box) return true; return false; };

// ---------- season / episode numbering (ported from the CloudStream provider, with fixes) ----------
// Longest names first so "الثاني عشر" (12) is not read as "الثاني" (2) like the Kotlin map does.
const ORD = [
  ["الاول", 1], ["الثاني", 2], ["الثالث", 3], ["الرابع", 4], ["الخامس", 5], ["السادس", 6], ["السابع", 7],
  ["الثامن", 8], ["التاسع", 9], ["العاشر", 10], ["الحادي عشر", 11], ["الثاني عشر", 12], ["الثالث عشر", 13],
  ["الرابع عشر", 14], ["الخامس عشر", 15], ["السادس عشر", 16], ["السابع عشر", 17], ["الثامن عشر", 18],
  ["التاسع عشر", 19], ["العشرون", 20], ["الحادي والعشرون", 21], ["الثاني والعشرون", 22], ["الثالث والعشرون", 23],
  ["الرابع والعشرون", 24], ["الخامس والعشرون", 25], ["السادس والعشرون", 26], ["السابع والعشرون", 27],
  ["الثامن والعشرون", 28], ["التاسع والعشرون", 29], ["الثلاثون", 30],
].map(([w, n]) => [normAr(w), n]).sort((a, b) => b[0].length - a[0].length);

const ORD_RE = ORD.map((x) => x[0]).join("|");
const SEASON_WORD = new RegExp(`(?:الموسم|الجزء|season|part)\\s*[:\\-]?\\s*(\\d{1,3}(?!\\d)|${ORD_RE})`);

function seasonNumber(name) {
  const t = normAr(unesc(name)).toLowerCase().replace(/\s+/g, " ");
  const m = SEASON_WORD.exec(t);
  if (m) return /^\d/.test(m[1]) ? +m[1] : ORD.find((x) => x[0] === m[1])[1];
  for (const [w, n] of ORD) if (t.indexOf(w) >= 0) return n;
  const nums = (t.match(/\d+/g) || []).filter((x) => x.length <= 3);
  return nums.length ? +nums[nums.length - 1] : 999;
}

function epNumber(name, path) {
  const t = normAr(unesc(name)).toLowerCase();
  let m = /(?:حلقه|(?:^|[^a-z])(?:episode|ep))\.?\s*[:\-]?\s*(\d{1,4})(?!\d)/.exec(t);
  if (m) return +m[1];
  const nums = t.match(/\d+/g);
  if (nums) return +nums[nums.length - 1];
  let p = String(path || "");
  try { p = decodeURIComponent(p); } catch (e) {}
  m = /(?:حلقه|episode)[-_\s]*(\d{1,4})/.exec(normAr(p).toLowerCase());
  return m ? +m[1] : null;
}

// ---------- page parsers (same selectors as Akwam.kt) ----------
const pathKey = (p) => {
  let d = String(p || "");
  try { d = decodeURIComponent(d); } catch (e) {}
  return d.toLowerCase().replace(/\/+$/, "");
};

// search results: div.col-lg-auto.col-md-4.col-6 > h3.entry-title a
function parseCards(root) {
  let scopes = all(root, (n) => n.tag === "div" && hasClass(n, "col-lg-auto") && hasClass(n, "col-md-4") && hasClass(n, "col-6"));
  if (!scopes.length) scopes = all(root, (n) => n.tag === "h3" && hasClass(n, "entry-title"));
  const out = [];
  const seen = new Set();
  for (const el of scopes) {
    const h3 = el.tag === "h3" ? el : first(el, (n) => n.tag === "h3" && hasClass(n, "entry-title"));
    const a = h3 && first(h3, (n) => n.tag === "a");
    if (!a) continue;
    const title = squash(textOf(a));
    const anyA = el.tag === "h3" ? a : first(el, (n) => n.tag === "a" && n.attrs.href);
    const href = a.attrs.href || (anyA && anyA.attrs.href) || "";
    if (!title || !href) continue;
    const type = /\/movie\//.test(href) ? "movie" : /\/(?:series|shows?)\//.test(href) ? "series" : null;
    const path = pathOf(href);
    if (!type || seen.has(pathKey(path))) continue;
    seen.add(pathKey(path));
    out.push({ title, path, type });
  }
  return out;
}

const pageTitle = (root) => {
  const h = first(root, (n) => n.tag === "h1" && hasClass(n, "entry-title")) || first(root, (n) => n.tag === "h1");
  return h ? squash(textOf(h)) : "";
};

function pageYear(root) {
  const isYear = (n) => n.tag === "a" && /\/year\//.test(n.attrs.href || "");
  let a = null;
  for (const box of all(root, (n) => n.tag === "div" && hasClass(n, "font-size-16") && hasClass(n, "text-white"))) {
    a = first(box, isYear);
    if (a) break;
  }
  a = a || first(root, isYear);
  const y = a ? parseInt((toLatinDigits(textOf(a)).match(/\d{4}/) || [])[0], 10) : NaN;
  return y >= 1930 && y <= 2100 ? y : null;
}

// the page itself + season buttons: div.widget-body > a.btn[href*='/series/']
function collectSeasons(page) {
  const out = [{ name: pageTitle(page.root), path: page.path }];
  const seen = new Set([pathKey(page.path)]);
  const isBtn = (n) => n.tag === "a" && hasClass(n, "btn") && /\/series\//.test(n.attrs.href || "");
  let btns = [];
  for (const w of all(page.root, (n) => n.tag === "div" && hasClass(n, "widget-body"))) {
    for (const k of w.kids) if (isEl(k) && isBtn(k)) btns.push(k);
  }
  if (!btns.length) {
    const box = byId(page.root, "series-episodes");
    btns = all(page.root, isBtn).filter((n) => !box || !within(n, box));
  }
  for (const a of btns) {
    const path = pathOf(a.attrs.href);
    if (seen.has(pathKey(path))) continue;
    seen.add(pathKey(path));
    out.push({ name: squash(textOf(a)), path });
  }
  return out.map((x) => Object.assign({}, x, { num: seasonNumber(x.name) }));
}

// episodes: div#series-episodes ... a[href*='/episode/']  (sorted by episode number)
function parseEpisodes(root) {
  const box = byId(root, "series-episodes");
  const names = new Map();
  for (const a of all(box || root, (n) => n.tag === "a" && /\/episode\//.test(n.attrs.href || ""))) {
    const path = pathOf(a.attrs.href);
    const h2 = first(a, (n) => n.tag === "h2");
    const list = names.get(path) || [];
    list.push(squash(textOf(h2 || a)));
    names.set(path, list);
  }
  const eps = [];
  for (const [path, list] of names) {
    const name = list.find((x) => /\d|حلق/.test(normAr(x))) || list.find(Boolean) || "";
    const id = parseInt((/\/episode\/(\d+)/.exec(path) || [])[1], 10) || 0;
    eps.push({ path, name, n: epNumber(name, path), id });
  }
  return eps.sort((a, b) => (a.n == null ? 1e9 : a.n) - (b.n == null ? 1e9 : b.n) || a.id - b.id);
}

// movie / episode page -> watch pages: a.link-show
function linkShowPaths(root) {
  const out = [];
  for (const a of all(root, (n) => n.tag === "a" && hasClass(n, "link-show") && n.attrs.href)) {
    const p = pathOf(a.attrs.href);
    if (out.indexOf(p) < 0) out.push(p);
  }
  return out;
}

// watch page -> source[src]  (size="720" / label="720p")
function extractSources(body, pageUrl) {
  const found = all(parseHtml(body), (n) => n.tag === "source" && n.attrs.src).map((n) => ({
    url: absUrl(n.attrs.src, pageUrl),
    q: n.attrs.size || n.attrs.label || n.attrs["data-quality"] || n.attrs.res || "",
  }));
  if (!found.length) {
    const flat = body.replace(/\\\//g, "/");
    for (const m of flat.match(/https?:\/\/[^"'\s<>\\]+?\.(?:mp4|m3u8)(?:\?[^"'\s<>\\]*)?/gi) || []) {
      found.push({ url: m, q: (/(\d{3,4})p?(?=[^\d]|$)/.exec(m.split("/").pop()) || [])[1] || "" });
    }
  }
  return found.filter((x) => x.url);
}

// ---------- matching ----------
const NOISE = /(?:^|\s)(?:فيلم|مسلسل|انمي|برنامج|مترجم|مترجمه|مدبلج|مدبلجه|كامل|اون لاين)(?=\s|$)/g;
const SEASON_PHRASE = new RegExp(`(?:الموسم|الجزء|season|part)\\s*[:\\-]?\\s*(?:\\d{1,3}(?!\\d)|${ORD_RE})`, "g");

function cleanTitle(t) {
  let s = normAr(unesc(t)).toLowerCase().replace(SEASON_PHRASE, " ").replace(NOISE, " ");
  s = s.replace(/\s+/g, " ").trim();
  const noYear = s.replace(/\(?\b(?:19|20)\d{2}\b\)?\s*$/, "").trim();
  return noYear || s;
}

// clean + key every wanted title once (accepts raw strings or already prepared entries)
const prepWanted = (list) => list.map((w) => {
  if (typeof w !== "string") return w;
  const c = cleanTitle(w);
  return { k: key(c), words: c.split(" ").filter(Boolean) };
});

function titleScore(candTitle, wanted) {
  const c = cleanTitle(candTitle);
  const ck = key(c);
  if (!ck) return 0;
  const ct = c.split(" ").filter(Boolean);
  let best = 0;
  for (const w of prepWanted(wanted)) {
    if (!w.k) continue;
    if (w.k === ck) return 100;
    if (w.k.length >= 4 && ck.length >= 4 && (ck.indexOf(w.k) >= 0 || w.k.indexOf(ck) >= 0)) {
      best = Math.max(best, Math.round(50 + 30 * Math.min(ck.length, w.k.length) / Math.max(ck.length, w.k.length)));
    }
    const ratio = w.words.filter((x) => ct.indexOf(x) >= 0).length / Math.max(w.words.length, ct.length);
    if (w.words.length >= 2 && ratio >= 0.75) best = Math.max(best, Math.round(40 + 40 * ratio));
  }
  return best;
}

async function searchSite(q) {
  const r = await getHtml(`/search?q=${encodeURIComponent(q)}`);
  return r ? parseCards(parseHtml(r.body)) : [];
}

async function findCandidates(info, isMovie) {
  const want = isMovie ? "movie" : "series";
  const queries = info.titles.filter((t) => /[A-Za-z\u0600-\u06ff]/.test(t)).slice(0, 5);
  const wanted = prepWanted(info.titles.slice(0, 25));
  const pool = new Map();
  let ranked = [];
  for (const q of queries) {
    for (const c of await searchSite(q)) {
      if (c.type === want && !pool.has(pathKey(c.path))) pool.set(pathKey(c.path), c);
    }
    ranked = Array.from(pool.values())
      .map((c) => Object.assign({}, c, { score: titleScore(c.title, wanted) }))
      .filter((c) => c.score >= 50)
      .sort((a, b) => b.score - a.score);
    if (ranked.length && ranked[0].score === 100) break;
  }
  return ranked;
}

async function loadPage(path, referer, cache) {
  const k = pathKey(path);
  if (cache.has(k)) return cache.get(k);
  const r = await getHtml(path, referer);
  const page = r ? { path, url: activeBase + path, root: parseHtml(r.body) } : null;
  cache.set(k, page);
  return page;
}

// ---------- watch page -> streams ----------
async function resolveWatch(page, streamTitle) {
  const paths = linkShowPaths(page.root).slice(0, 3);
  if (!paths.length) {
    log(`no watch link on ${page.path}`);
    return [];
  }
  const lists = await Promise.all(paths.map(async (p) => {
    const r = await getHtml(p, page.url);
    return r ? extractSources(r.body, activeBase + p) : [];
  }));
  const seen = new Set();
  const out = [];
  for (const it of [].concat(...lists)) {
    let url = encodeNonAscii(it.url.replace(/ /g, "%20"));
    if (FORCE_HTTP) url = url.replace(/^https:\/\//i, "http://");
    if (seen.has(url)) continue;
    seen.add(url);
    const qn = parseInt((String(it.q).match(/\d{3,4}/) || [])[0], 10) || 0;
    out.push({ url, qn, label: qn ? `${qn}p` : (String(it.q).trim() || "Auto") });
  }
  out.sort((a, b) => b.qn - a.qn);
  const referer = encodeNonAscii(page.url);
  return out.map((x) => ({
    name: `Akwam - ${x.label}`,
    title: streamTitle,
    url: x.url,
    quality: x.label,
    size: "Unknown",
    headers: { "User-Agent": UA, "Referer": referer },
    provider: "akwam",
  }));
}

// ---------- movies ----------
async function movieStreams(cands, info, streamTitle, cache) {
  for (const c of cands.slice(0, 4)) {
    const page = await loadPage(c.path, null, cache);
    if (!page) continue;
    const y = pageYear(page.root);
    if (y && info.year && Math.abs(y - info.year) > (c.score === 100 ? 2 : 1)) {
      log(`skip "${c.title}" (site ${y} vs tmdb ${info.year})`);
      continue;
    }
    log(`movie: "${c.title}"${y ? ` (${y})` : ""}`);
    const streams = await resolveWatch(page, streamTitle);
    if (streams.length) return streams;
  }
  return [];
}

// ---------- series (one Akwam page per season) ----------
function matchSeasons(seasons, s) {
  const exact = seasons.filter((x) => x.num === s);
  if (exact.length) return exact;
  const plain = seasons.filter((x) => x.num === 999);
  if (s === 1 && plain.length === 1) return plain;
  if (plain.length === seasons.length && seasons[s - 1]) return [seasons[s - 1]];
  return [];
}

function pickEpisode(eps, e, cumBefore) {
  let hit = eps.find((x) => x.n === e);
  if (hit) return hit;
  const nums = eps.filter((x) => x.n != null).map((x) => x.n);
  if (!nums.length) return eps[e - 1] || null;
  if (cumBefore && Math.min.apply(null, nums) > e) {
    hit = eps.find((x) => x.n === cumBefore + e);
    if (hit) return hit;
  }
  return null;
}

function seriesYearOk(page, info, s) {
  const y = pageYear(page.root);
  if (!y || !info.year) return true;
  const season = info.seasons.find((x) => x.number === s);
  const near = (v) => !!v && Math.abs(y - v) <= 2;
  return near(info.year) || near(season && season.year);
}

async function seriesStreams(cands, info, s, e, streamTitle, cache) {
  const season = info.seasons.find((x) => x.number === s) || null;
  const want = season ? season.count : 0;
  const cumBefore = info.seasons.filter((x) => x.number < s).reduce((a, x) => a + x.count, 0);

  for (const c of cands.slice(0, 3)) {
    const anchor = await loadPage(c.path, null, cache);
    if (!anchor) continue;
    const seasons = collectSeasons(anchor);
    const options = matchSeasons(seasons, s);
    log(`"${c.title}": seasons [${seasons.map((x) => x.num).join(",")}] -> S${s}: ${options.length} page(s)`);

    let pick = null;
    let target = e;
    let offset = cumBefore;
    for (const o of options.slice(0, 3)) {
      const page = await loadPage(o.path, anchor.url, cache);
      if (!page) continue;
      const eps = parseEpisodes(page.root);
      if (!pick || (want && eps.length === want && pick.eps.length !== want)) pick = { page, eps };
      if (want && eps.length === want) break;
    }
    if (!pick && seasons.length === 1) {
      // whole show on a single page: episode numbers keep counting across seasons
      pick = { page: anchor, eps: parseEpisodes(anchor.root) };
      if (s > 1) {
        target = cumBefore + e;
        offset = 0;
      }
    }
    if (!pick || !pick.eps.length) continue;
    if (!seriesYearOk(pick.page, info, s)) {
      log(`skip "${c.title}" (site year does not fit tmdb)`);
      continue;
    }

    const ep = pickEpisode(pick.eps, target, offset);
    if (!ep) {
      log(`episode ${target} not on ${pick.page.path} (${pick.eps.length} eps)`);
      continue;
    }
    const epPage = await loadPage(ep.path, pick.page.url, cache);
    if (!epPage) continue;
    log(`S${s}E${e} -> ${ep.path}`);
    const streams = await resolveWatch(epPage, streamTitle);
    if (streams.length) return streams;
  }
  return [];
}

async function getStreams(tmdbId, mediaType = "movie", seasonNum = null, episodeNum = null) {
  const isMovie = mediaType === "movie";
  const s = seasonNum || 1;
  const e = episodeNum || 1;
  log(`tmdb=${tmdbId} type=${mediaType}${isMovie ? "" : ` S${s}E${e}`}`);

  try {
    const info = await tmdbInfo(tmdbId, mediaType);
    if (!info.titles.length) return [];

    const cands = await findCandidates(info, isMovie);
    if (!cands.length) {
      log("not found on Akwam");
      return [];
    }
    log(`candidates: ${cands.slice(0, 3).map((c) => `"${c.title}"(${c.score})`).join(", ")}`);

    const title = info.titles[0];
    const streamTitle = isMovie ? `${title}${info.year ? ` (${info.year})` : ""}` : `${title} S${pad2(s)}E${pad2(e)}`;
    const cache = new Map();
    const streams = isMovie
      ? await movieStreams(cands, info, streamTitle, cache)
      : await seriesStreams(cands, info, s, e, streamTitle, cache);
    log(`streams: ${streams.length}`);
    return streams;
  } catch (err) {
    log(`error: ${err && err.message}`);
    return [];
  }
}

module.exports = {
  getStreams,
  __test: { parseHtml, parseCards, collectSeasons, parseEpisodes, seasonNumber, epNumber, titleScore, cleanTitle, resetBase: () => { activeBase = null; } },
};

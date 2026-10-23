// Offline by default (fetch is mocked with pages shaped like Akwam's markup, see Akwam.kt selectors).
//   node tests/akwam.test.js            -> mocked, no network needed
//   LIVE=1 node tests/akwam.test.js     -> real TMDB + real Akwam
const assert = require("assert");

const LIVE = process.env.LIVE === "1";
const mod = require("../providers/akwam.js");
const { getStreams } = mod;
const T = mod.__test;
const reset = () => { if (T) T.resetBase(); };

// ---------------------------------------------------------------- live mode
if (LIVE) {
  const live = [
    ["Fight Club (movie)", 550, "movie", null, null],
    ["Breaking Bad S1E1", 1396, "tv", 1, 1],
    ["Breaking Bad S2E3", 1396, "tv", 2, 3],
  ];
  (async () => {
    let failed = 0;
    for (const [label, id, type, s, e] of live) {
      try {
        const streams = await getStreams(id, type, s, e);
        assert(streams.length > 0, "no streams");
        assert(streams.every((x) => /^https?:/.test(x.url)), "non-http url");
        assert(streams.every((x) => x.provider === "akwam"), "missing provider tag");
        console.log("PASS", label, `(${streams.length} streams)`, streams[0].url);
      } catch (err) {
        failed++;
        console.log("FAIL", label, "-", err.message);
      }
    }
    process.exit(failed ? 1 : 0);
  })();
  return;
}

// ---------------------------------------------------------------- fixtures
const BASE = "https://akwam.ss";

const layout = (inner) => `<!DOCTYPE html><html lang="ar"><head><meta charset="utf-8"><title>Akwam</title>
<script>var tpl = "<div class='col-lg-auto col-md-4 col-6'><h3 class='entry-title'><a href='/movie/0/junk'>junk</a></h3></div>"; if (1 < 2) { var x = '</div>'; }</script></head>
<body><nav class="navbar navbar-expand-lg"><a href="${BASE}/">home</a></nav>${inner}<footer class="footer">akwam</footer></body></html>`;

const card = (type, id, slug, title) => `<div class="col-lg-auto col-md-4 col-6 mb-12"><div class="entry-box entry-box-1"><div class="labels d-flex"><span class="label rating">7.5</span><div class="pad"></div></div><div class="entry-image"><a href="${BASE}/${type}/${id}/${slug}" class="box"><picture><img src="data:image/gif;base64,R0lGOD" data-src="https://img.example/${id}.jpg" class="img-fluid lazy" alt="${title}"></picture></a></div><div class="entry-body px-3 pb-3 pt-0"><h3 class="entry-title font-size-14 m-0"><a href="${BASE}/${type}/${id}/${slug}" class="text-white">${title}</a></h3></div></div></div>`;

const searchPage = (cards) => layout(`<div class="widget-body row flex-wrap">${cards.map((c) => card(...c)).join("")}</div>`);

const watchBtn = (href) => `<a href="${href}" class="link-btn link-show d-flex align-items-center px-3 py-2"><span>مشاهدة</span></a>`;
const dlBtn = (href) => `<a href="${href}" class="link-btn link-download d-flex"><span>تحميل</span></a>`;

const moviePage = (title, year, links) => layout(`<h1 class="entry-title font-size-28 text-white">${title}</h1><div class="font-size-16 text-white mt-2"><span>سنة الإنتاج:</span> <a href="${BASE}/year/${year}">${year}</a></div><div class="tab-content quality">${links.map(watchBtn).join("")}${dlBtn(BASE + "/link/9999")}</div>`);

const watchPage = (files) => layout(`<video id="player" controls>${files.map(([src, size]) => `<source src="${src}" type="video/mp4" size="${size}">`).join("")}</video>`);

const epRow = (id, slug, n) => {
  const href = `${BASE}/episode/${id}/${slug}`;
  const thumb = `<a href="${href}"><img data-src="x.jpg" class="lazy"></a>`;
  return n % 2
    ? `${thumb}<a href="${href}"><h2 class="font-size-18 text-white">الحلقة ${n}</h2></a>`
    : `${thumb}<h2 class="font-size-18"><a href="${href}">الحلقة ${n}</a></h2>`;
};

const seriesPage = ({ title, year, seasons = [], eps }) => layout(
  `<h1 class="entry-title">${title}</h1><div class="font-size-16 text-white"><a href="${BASE}/year/${year}">${year}</a></div>`
  + (seasons.length ? `<div class="widget widget-style-1"><div class="widget-body">${seasons.map(([href, name]) => `<a href="${href}" class="btn btn-light mb-2 mr-2">${name}</a>`).join("")}</div></div>` : "")
  + `<div class="widget"><div id="series-episodes" class="widget-body row">${eps.slice().reverse().map((e) => `<div class="col-lg-4 col-md-6 p-2"><div class="bg-primary2 p-3">${epRow(e.id, e.slug, e.n)}</div></div>`).join("")}</div></div>`
);

const PAGES = {};
const SEARCH = {};

// movie: Fight Club (watch links point at a stale domain, two watch pages with different qualities)
SEARCH["fight club"] = [["movie", 101, "fight-club", "فيلم Fight Club 1999 مترجم"], ["movie", 102, "fight-club-2", "Fight Club 2"]];
PAGES["/movie/101/fight-club"] = moviePage("Fight Club", 1999, ["https://akwam.cx/link/5001", `${BASE}/link/5002`]);
PAGES["/link/5001"] = watchPage([["https://s1.downet.net/files/Fight Club 1080.mp4", "1080"], ["https://s1.downet.net/files/Fight Club 720.mp4", "720"]]);
PAGES["/link/5002"] = watchPage([["https://s1.downet.net/files/Fight Club 720.mp4", "720"], ["https://s1.downet.net/files/Fight Club 480.mp4", "480"]]);

// remake trap: two exact "Dune" titles, the first one is the 1984 film
SEARCH["dune"] = [["movie", 110, "dune-1984", "Dune"], ["movie", 111, "dune-2021", "Dune"]];
PAGES["/movie/110/dune-1984"] = moviePage("Dune", 1984, [`${BASE}/link/5101`]);
PAGES["/movie/111/dune-2021"] = moviePage("Dune", 2021, [`${BASE}/link/5111`]);
PAGES["/link/5101"] = watchPage([["https://cdn.example/dune-1984.mp4", "720"]]);
PAGES["/link/5111"] = watchPage([["https://cdn.example/dune-2021.mp4", "720"]]);

// Arabic production: only the Arabic title finds it on the site
SEARCH["الحريف"] = [["movie", 120, "al-hareef", "فيلم الحريف مترجم"]];
PAGES["/movie/120/al-hareef"] = moviePage("الحريف", 1983, [`${BASE}/link/5120`]);
PAGES["/link/5120"] = watchPage([["https://cdn.example/hareef-480.mp4", "480"]]);

// player that builds the <source> from a script (no <source> tag at all)
SEARCH["script player"] = [["movie", 121, "script-player", "Script Player"]];
PAGES["/movie/121/script-player"] = moviePage("Script Player", 2018, [`${BASE}/link/5121`]);
PAGES["/link/5121"] = layout(`<div id="player"></div><script>jwplayer("player").setup({"file":"https:\\/\\/cdn.example\\/video\\/sp-720.mp4"});</script>`);

// movie page without any watch button
SEARCH["no watch link"] = [["movie", 122, "no-watch-link", "No Watch Link"]];
PAGES["/movie/122/no-watch-link"] = layout(`<h1 class="entry-title">No Watch Link</h1><div class="font-size-16 text-white"><a href="${BASE}/year/2019">2019</a></div>${dlBtn(BASE + "/link/9999")}`);

// series with one page per season + season buttons
const range = (n) => Array.from({ length: n }, (_, i) => i + 1);
const s1 = range(10).map((n) => ({ n, id: 3000 + n, slug: `bcs-s1-e${n}` }));
const s2 = range(10).map((n) => ({ n, id: 3100 + n, slug: `bcs-s2-e${n}` }));
const buttons = [[`${BASE}/series/200/bcs-s1`, "الموسم الاول"], [`${BASE}/series/201/bcs-s2`, "الموسم الثاني"]];
SEARCH["better call saul"] = [["series", 200, "bcs-s1", "مسلسل Better Call Saul الموسم الاول"]];
PAGES["/series/200/bcs-s1"] = seriesPage({ title: "مسلسل Better Call Saul الموسم الاول", year: 2015, seasons: buttons, eps: s1 });
PAGES["/series/201/bcs-s2"] = seriesPage({ title: "مسلسل Better Call Saul الموسم الثاني", year: 2016, seasons: buttons, eps: s2 });
for (const [list, tag] of [[s1, "s01"], [s2, "s02"]]) {
  for (const e of list) {
    PAGES[`/episode/${e.id}/${e.slug}`] = layout(`<h1 class="entry-title">الحلقة ${e.n}</h1>${watchBtn(`https://akwam.cx/link/${e.id + 3000}`)}`);
    PAGES[`/link/${e.id + 3000}`] = watchPage([[`https://s2.downet.net/bcs/bcs-${tag}e${String(e.n).padStart(2, "0")}-720.mp4`, "720"]]);
  }
}

// anime-style: the whole show on one page, numbering keeps counting across seasons
const flat = range(24).map((n) => ({ n, id: 4000 + n, slug: `one-page-e${n}` }));
SEARCH["one page anime"] = [["series", 300, "one-page", "One Page Anime"]];
PAGES["/series/300/one-page"] = seriesPage({ title: "One Page Anime", year: 2020, eps: flat });
for (const e of flat) {
  PAGES[`/episode/${e.id}/${e.slug}`] = layout(`<h1 class="entry-title">الحلقة ${e.n}</h1>${watchBtn(`${BASE}/link/${e.id + 3000}`)}`);
  PAGES[`/link/${e.id + 3000}`] = watchPage([[`https://s3.downet.net/op/onepage-ep${e.n}.mp4`, "480"]]);
}

const seasonsOf = (counts, startYear) => counts.map((c, i) => ({ season_number: i + 1, episode_count: c, air_date: `${startYear + i}-01-01` }));
const TMDB_DB = {
  "movie/550": { title: "Fight Club", original_title: "Fight Club", release_date: "1999-10-15", translations: { translations: [{ iso_639_1: "ar", data: { title: "نادي القتال" } }] }, alternative_titles: { titles: [{ title: "El club de la lucha" }] } },
  "movie/438631": { title: "Dune", original_title: "Dune", release_date: "2021-09-15", alternative_titles: { titles: [] } },
  "movie/999999": { title: "Totally Unknown Film", original_title: "Totally Unknown Film", release_date: "2020-01-01", alternative_titles: { titles: [] } },
  "movie/880001": { title: "Al Hareef", original_title: "الحريف", release_date: "1983-01-01", translations: { translations: [{ iso_639_1: "ar", data: { title: "الحريف" } }] }, alternative_titles: { titles: [] } },
  "movie/880002": { title: "Script Player", original_title: "Script Player", release_date: "2018-05-05", alternative_titles: { titles: [] } },
  "movie/880003": { title: "No Watch Link", original_title: "No Watch Link", release_date: "2019-03-03", alternative_titles: { titles: [] } },
  "tv/60059": { name: "Better Call Saul", original_name: "Better Call Saul", first_air_date: "2015-02-08", seasons: [{ season_number: 0, episode_count: 3 }].concat(seasonsOf([10, 10, 10], 2015)), alternative_titles: { results: [] } },
  "tv/70001": { name: "One Page Anime", original_name: "One Page Anime", first_air_date: "2020-01-01", seasons: seasonsOf([12, 12], 2020), alternative_titles: { results: [] } },
};

const reply = (status, body) => ({ ok: status < 400, status, headers: { get: () => null }, text: async () => body, json: async () => JSON.parse(body) });

// mimics the Nuvio runtime fetch: no `url` on the response
function installFetch(alive, blocked) {
  alive = alive || ["akwam.ss"];
  blocked = blocked || [];
  const calls = [];
  global.fetch = async (url) => {
    const u = String(url);
    calls.push(u);
    let m = /^https:\/\/api\.themoviedb\.org\/3\/(movie|tv)\/(\d+)/.exec(u);
    if (m) {
      const d = TMDB_DB[`${m[1]}/${m[2]}`];
      return d ? reply(200, JSON.stringify(d)) : reply(404, JSON.stringify({ status_code: 34 }));
    }
    m = /^https:\/\/([^\/]+)(\/.*)$/.exec(u);
    if (!m || alive.indexOf(m[1]) < 0) throw new Error(`getaddrinfo ENOTFOUND ${m ? m[1] : u}`);
    if (blocked.indexOf(m[1]) >= 0) return reply(403, "<html><head><title>Just a moment...</title></head><body>Checking your browser before accessing the site.</body></html>");
    let path = m[2];
    try { path = decodeURIComponent(path); } catch (e) {}
    const sm = /^\/search\?q=(.*)$/.exec(path);
    if (sm) return reply(200, searchPage(SEARCH[sm[1].toLowerCase()] || []));
    return PAGES[path] ? reply(200, PAGES[path]) : reply(404, layout("<h1>404</h1>"));
  };
  return calls;
}

const hits = (calls, host) => calls.filter((c) => c.indexOf(`https://${host}/`) === 0).length;

// ---------------------------------------------------------------- cases
const cases = [
  ["movie: nested cards, stale watch host, https->http, spaces, quality order", async () => {
    const calls = installFetch(); reset();
    const out = await getStreams(550, "movie");
    assert.deepStrictEqual(out.map((x) => x.quality), ["1080p", "720p", "480p"]);
    assert.strictEqual(out[0].url, "http://s1.downet.net/files/Fight%20Club%201080.mp4");
    assert.strictEqual(out[0].headers.Referer, `${BASE}/movie/101/fight-club`);
    assert(out.every((x) => x.provider === "akwam" && x.name.indexOf("Akwam - ") === 0), "stream shape");
    assert.strictEqual(hits(calls, "akwam.cx"), 0, "went to the stale domain found inside the page");
  }],
  ["movie: skips the 1984 remake, takes Dune (2021)", async () => {
    installFetch(); reset();
    const out = await getStreams(438631, "movie");
    assert.strictEqual(out.length, 1);
    assert(out[0].url.indexOf("dune-2021") > 0, out[0].url);
  }],
  ["movie: not on the site -> empty", async () => {
    installFetch(); reset();
    assert.deepStrictEqual(await getStreams(999999, "movie"), []);
  }],
  ["movie: unknown tmdb id -> empty", async () => {
    installFetch(); reset();
    assert.deepStrictEqual(await getStreams(424242, "movie"), []);
  }],
  ["domain: akwam.ss down -> ak.sv answers and is remembered", async () => {
    const calls = installFetch(["ak.sv"]); reset();
    const out = await getStreams(550, "movie");
    assert.strictEqual(out.length, 3);
    assert.strictEqual(hits(calls, "akwam.ss"), 1, "keeps retrying the dead domain");
    assert(out[0].headers.Referer.indexOf("https://ak.sv/") === 0, out[0].headers.Referer);
  }],
  ["domain: akwam.ss answers with a challenge page -> falls through to ak.sv", async () => {
    const calls = installFetch(["akwam.ss", "ak.sv"], ["akwam.ss"]); reset();
    const out = await getStreams(550, "movie");
    assert.strictEqual(out.length, 3);
    assert.strictEqual(hits(calls, "akwam.ss"), 1, "keeps retrying the blocked domain");
  }],
  ["movie: Arabic-only title (english query finds nothing, site decoration words ignored)", async () => {
    installFetch(); reset();
    const out = await getStreams(880001, "movie");
    assert(out.length === 1 && /hareef-480\.mp4$/.test(out[0].url), JSON.stringify(out.map((x) => x.url)));
    assert.strictEqual(out[0].quality, "480p");
  }],
  ["movie: <source> built by a script (JSON-escaped url fallback)", async () => {
    installFetch(); reset();
    const out = await getStreams(880002, "movie");
    assert(out.length === 1 && out[0].url === "http://cdn.example/video/sp-720.mp4", JSON.stringify(out.map((x) => x.url)));
    assert.strictEqual(out[0].quality, "720p");
  }],
  ["movie: page without a watch button -> empty", async () => {
    installFetch(); reset();
    assert.deepStrictEqual(await getStreams(880003, "movie"), []);
  }],
  ["series S1E5 (not E10 / E1)", async () => {
    installFetch(); reset();
    const out = await getStreams(60059, "tv", 1, 5);
    assert(out.length === 1 && out[0].url.indexOf("bcs-s01e05") > 0, JSON.stringify(out.map((x) => x.url)));
    assert.strictEqual(out[0].title, "Better Call Saul S01E05");
  }],
  ["series S1E1 vs E10/E1x", async () => {
    installFetch(); reset();
    const out = await getStreams(60059, "tv", 1, 1);
    assert(out.length === 1 && out[0].url.indexOf("bcs-s01e01") > 0, JSON.stringify(out.map((x) => x.url)));
  }],
  ["series S1E10", async () => {
    installFetch(); reset();
    const out = await getStreams(60059, "tv", 1, 10);
    assert(out.length === 1 && out[0].url.indexOf("bcs-s01e10") > 0, JSON.stringify(out.map((x) => x.url)));
  }],
  ["series S2E3 -> season button page", async () => {
    installFetch(); reset();
    const out = await getStreams(60059, "tv", 2, 3);
    assert(out.length === 1 && out[0].url.indexOf("bcs-s02e03") > 0, JSON.stringify(out.map((x) => x.url)));
  }],
  ["series S3 missing on site -> empty (no wrong season)", async () => {
    installFetch(); reset();
    assert.deepStrictEqual(await getStreams(60059, "tv", 3, 1), []);
  }],
  ["anime on one page: S1E3 -> ep 3, S2E3 -> ep 15", async () => {
    installFetch(); reset();
    const a = await getStreams(70001, "tv", 1, 3);
    const b = await getStreams(70001, "tv", 2, 3);
    assert(a.length === 1 && /onepage-ep3\.mp4$/.test(a[0].url), JSON.stringify(a.map((x) => x.url)));
    assert(b.length === 1 && /onepage-ep15\.mp4$/.test(b[0].url), JSON.stringify(b.map((x) => x.url)));
  }],
];

// pure helpers (skipped for modules without the __test export)
if (T) {
  cases.push(["parseCards: nested divs + <script> junk", async () => {
    const root = T.parseHtml(searchPage([["movie", 1, "a", "A film"], ["shows", 2, "b", "A show"], ["episode", 3, "c", "skip me"]]));
    const cards = T.parseCards(root);
    assert.deepStrictEqual(cards.map((c) => [c.title, c.path, c.type]), [["A film", "/movie/1/a", "movie"], ["A show", "/shows/2/b", "series"]]);
  }]);
  cases.push(["seasonNumber", async () => {
    const t = [["الموسم الاول", 1], ["الموسم الأول", 1], ["الموسم الثاني", 2], ["الموسم الثاني عشر", 12], ["الموسم الحادي عشر", 11],
      ["الموسم الحادي والعشرون", 21], ["Season 3", 3], ["الموسم 4", 4], ["مسلسل X الموسم الخامس 2021", 5], ["الموسم ٣", 3], ["مسلسل بدون رقم", 999]];
    for (const [name, n] of t) assert.strictEqual(T.seasonNumber(name), n, name);
  }]);
  cases.push(["epNumber", async () => {
    const t = [["الحلقة 10", null, 10], ["الحلقة 1", null, 1], ["حلقة ٥ والأخيرة", null, 5], ["Episode 7", null, 7], ["EP 12", null, 12], ["", "/episode/1/x-%D8%A7%D9%84%D8%AD%D9%84%D9%82%D8%A9-8", 8]];
    for (const [name, path, n] of t) assert.strictEqual(T.epNumber(name, path), n, name || path);
  }]);
  cases.push(["titleScore / cleanTitle", async () => {
    assert.strictEqual(T.titleScore("فيلم Fight Club 1999 مترجم", ["Fight Club"]), 100);
    assert.strictEqual(T.titleScore("مسلسل Better Call Saul الموسم الاول", ["Better Call Saul"]), 100);
    assert.strictEqual(T.titleScore("1917", ["1917"]), 100);
    assert.strictEqual(T.titleScore("نادى القتال", ["نادي القتال"]), 100);
    const sequel = T.titleScore("Fight Club 2", ["Fight Club"]);
    assert(sequel >= 50 && sequel < 100, String(sequel));
    assert.strictEqual(T.titleScore("Something Else", ["Fight Club"]), 0);
  }]);
}

(async () => {
  let failed = 0;
  for (const [label, fn] of cases) {
    const realLog = console.log;
    console.log = () => {};
    try {
      await fn();
      console.log = realLog;
      console.log("PASS", label);
    } catch (err) {
      console.log = realLog;
      failed++;
      console.log("FAIL", label, "-", err.message);
    }
  }
  console.log(failed ? `\n${failed} failed` : `\nall ${cases.length} passed`);
  process.exit(failed ? 1 : 0);
})();

// Nuvio plugin: Cee (cee.buzz). Generated from cinemana-plugins/src/template.js by build.mjs; edit the template.
// Streams and subtitles for any title the app plays: TMDB numbers, IMDb (tt…) and anime IDs (mal:, kitsu:, anilist:,
// anidb:) are turned into an IMDb ID, the site is searched by title, and only the result carrying that IMDb ID is used.
// The site answers only inside Iraq. ES5 and promises only: the app's runtime has no async/await, arrow functions,
// setTimeout or TextDecoder.

var SITE = { key: 'cee', name: 'Cee', api: 'https://cee.buzz/api/android/' };
var TAG = '[' + SITE.name + ']';
var ANIME = { 'mal': 'myanimelist', 'kitsu': 'kitsu', 'anilist': 'anilist', 'anidb': 'anidb' };

function getJson(url) {
  return fetch(url, { headers: { 'Accept': 'application/json' } }).then(function (res) {
    if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url.split('?')[0]);
    return res.json();
  });
}

// The site wraps lists as an array, or as { info | content | data | <key>: [...] }.
function rows(value, key) {
  var source = key && value && !Array.isArray(value) ? value[key] : value;
  if (!source) return [];
  if (Array.isArray(source)) return source.filter(function (x) { return x && typeof x === 'object'; });
  var wrappers = ['info', 'content', 'data'];
  for (var i = 0; i < wrappers.length; i++) if (source[wrappers[i]]) return rows(source[wrappers[i]]);
  return [];
}

function imdbOf(text) {
  var m = /tt\d{5,12}/.exec(String(text || ''));
  return m ? m[0] : null;
}

// Builds without a TMDB key (CinemaHomeTV ships none): Wikidata holds the TMDB number (P4947 film, P4983 series) next
// to the IMDb ID (P345) and the English title.
function fromWikidata(tmdb, isTv) {
  var api = 'https://www.wikidata.org/w/api.php?format=json&origin=*';
  var headers = { 'Accept': 'application/json', 'User-Agent': 'CinemaHome-Cinemana-plugin/1.0' };
  return fetch(api + '&action=query&list=search&srlimit=1&srsearch=haswbstatement:' + (isTv ? 'P4983' : 'P4947') + '=' + tmdb, { headers: headers })
    .then(function (res) { return res.json(); })
    .then(function (d) {
      var item = d && d.query && d.query.search && d.query.search[0] && d.query.search[0].title;
      if (!/^Q\d+$/.test(item || '')) return null;
      return fetch(api + '&action=wbgetentities&props=labels|claims&languages=en|ar&ids=' + item, { headers: headers })
        .then(function (res) { return res.json(); })
        .then(function (e) {
          var entity = e && e.entities && e.entities[item] || {};
          var claim = function (p) { var c = entity.claims && entity.claims[p] && entity.claims[p][0]; return c && c.mainsnak && c.mainsnak.datavalue && c.mainsnak.datavalue.value; };
          var date = claim('P577') || claim('P580');
          return {
            imdb: imdbOf(claim('P345')),
            titles: [entity.labels && entity.labels.en && entity.labels.en.value, entity.labels && entity.labels.ar && entity.labels.ar.value].filter(Boolean),
            year: date && date.time ? String(date.time).slice(1, 5) : ''
          };
        });
    });
}

// TMDB through the key the app hands every plugin, or Wikidata when the build has none.
function fromTmdb(tmdb, isTv) {
  var key = typeof TMDB_API_KEY !== 'undefined' ? TMDB_API_KEY : '';
  if (!key) return fromWikidata(tmdb, isTv);
  var url = 'https://api.themoviedb.org/3/' + (isTv ? 'tv' : 'movie') + '/' + tmdb + '?api_key=' + key + '&append_to_response=external_ids';
  return getJson(url).then(function (d) {
    return {
      imdb: imdbOf(d.imdb_id || (d.external_ids && d.external_ids.imdb_id)),
      titles: [d.title || d.name, d.original_title || d.original_name].filter(Boolean),
      year: String(d.release_date || d.first_air_date || '').slice(0, 4)
    };
  });
}

// Whatever the app sent, as { imdb, titles, year, season }.
function identify(id, isTv) {
  var s = String(id || '');
  if (/^\d+$/.test(s)) return fromTmdb(s, isTv);
  if (/^tmdb:\d+/i.test(s)) return fromTmdb(s.split(':')[1], isTv);
  var imdb = imdbOf(s);
  if (imdb && s.indexOf('tt') === 0) {
    return getJson('https://v3-cinemeta.strem.io/meta/' + (isTv ? 'series' : 'movie') + '/' + imdb + '.json').then(function (d) {
      var m = d && d.meta || {};
      return { imdb: imdb, titles: [m.name].filter(Boolean), year: String(m.year || m.releaseInfo || '').slice(0, 4) };
    });
  }
  var anime = /^(mal|kitsu|anilist|anidb):(\d+)/i.exec(s);
  if (anime) {
    // ARM maps anime IDs to IMDb/TMDB and the TMDB season of the entry.
    return getJson('https://arm.haglund.dev/api/v2/ids?source=' + ANIME[anime[1].toLowerCase()] + '&id=' + anime[2]).then(function (ids) {
      var season = ids && ids['themoviedb-season'] ? Number(ids['themoviedb-season']) : null;
      var viaTmdb = ids && ids.themoviedb ? fromTmdb(String(ids.themoviedb), isTv) : Promise.resolve(null);
      return viaTmdb.then(function (info) {
        info = info || { titles: [], year: '' };
        info.imdb = info.imdb || imdbOf(ids && ids.imdb);
        info.anilist = ids && ids.anilist ? ids.anilist : null;
        info.season = season;
        return info;
      });
    });
  }
  return Promise.resolve(null);
}

function norm(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9؀-ۿ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// The site's search over the given titles (two pages each). A result whose IMDb link matches wins; with
// byName, a result carrying no IMDb link is also accepted when its name matches a title exactly (anime entries).
function search(titles, info, isTv, byName) {
  var type = isTv ? 'series' : 'movies';
  var wanted = titles.map(norm);
  var tries = [];
  titles.forEach(function (t) { tries.push([t, 0]); tries.push([t, 1]); });
  function attempt(i) {
    if (i >= tries.length) return Promise.resolve(null);
    var url = SITE.api + 'AdvancedSearch?level=0&videoTitle=' + encodeURIComponent(tries[i][0]) + '&type=' + type + '&page=' + tries[i][1];
    return getJson(url).then(function (data) {
      var list = rows(data);
      var hit = list.filter(function (x) { return info.imdb && imdbOf(x.imdbUrlRef) === info.imdb; })[0] ||
        (byName ? list.filter(function (x) {
          var yearOk = !info.year || !x.year || Math.abs(Number(x.year) - Number(info.year)) <= 1;
          return !imdbOf(x.imdbUrlRef) && yearOk && (wanted.indexOf(norm(x.en_title)) >= 0 || wanted.indexOf(norm(x.ar_title)) >= 0);
        })[0] : null);
      return hit || attempt(i + 1);
    }, function () { return attempt(i + 1); });
  }
  return attempt(0);
}

// Anime names as AniList has them (the sites list anime by romaji, "Sousou no Frieren", often without an IMDb link).
function animeTitles(info) {
  var find = info.anilist ? Promise.resolve(info.anilist) : info.imdb
    ? getJson('https://arm.haglund.dev/api/v2/imdb?id=' + info.imdb).then(function (list) {
        var hit = (list || []).filter(function (x) { return x && x.anilist; })[0];
        return hit ? hit.anilist : null;
      }, function () { return null; })
    : Promise.resolve(null);
  return find.then(function (anilist) {
    if (!anilist) return [];
    return fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ query: 'query($id:Int){Media(id:$id){title{romaji english}}}', variables: { id: Number(anilist) } })
    }).then(function (res) { return res.json(); }).then(function (d) {
      var t = d && d.data && d.data.Media && d.data.Media.title || {};
      return [t.romaji, t.english].filter(Boolean);
    }, function () { return []; });
  }, function () { return []; });
}

// By IMDb ID first; when that finds nothing, by the anime's romaji/English names.
// The site may know a title by its Cinemeta (IMDb) name rather than TMDB's or Wikidata's ("The Shadow Team").
function withCinemetaName(info, isTv) {
  if (!info.imdb) return Promise.resolve(info);
  return getJson('https://v3-cinemeta.strem.io/meta/' + (isTv ? 'series' : 'movie') + '/' + info.imdb + '.json').then(function (d) {
    var name = d && d.meta && d.meta.name;
    if (name && info.titles.indexOf(name) < 0) info.titles.unshift(name);
    if (!info.year && d && d.meta && d.meta.year) info.year = String(d.meta.year).slice(0, 4);
    return info;
  }, function () { return info; });
}

// By IMDb ID first; then the same names for entries without an IMDb link (Arabic series); then anime names.
function findEntry(info, isTv) {
  return withCinemetaName(info, isTv).then(function () {
    return search(info.titles.slice(0, 3), info, isTv, false);
  }).then(function (hit) {
    return hit || search(info.titles.slice(0, 3), info, isTv, true);
  }).then(function (hit) {
    if (hit) return hit;
    return animeTitles(info).then(function (names) {
      var extra = names.filter(function (n) { return info.titles.indexOf(n) < 0; });
      return extra.length ? search(extra, info, isTv, true) : null;
    });
  });
}

// Episodes before the season plus the episode, from TVmaze's season sizes (they match TMDB's: Teşkilat 14/34/31/32/37/36).
function absoluteEpisode(imdb, season, episode) {
  if (!imdb || Number(season) <= 1) return Promise.resolve(Number(episode));
  return getJson('https://api.tvmaze.com/lookup/shows?imdb=' + imdb).then(function (show) {
    return getJson('https://api.tvmaze.com/shows/' + show.id + '/episodes');
  }).then(function (list) {
    var before = (list || []).filter(function (e) { return e.number && e.season < Number(season); }).length;
    return before ? before + Number(episode) : null;
  }, function () { return null; });
}

// The episode by its season and number; a site that keeps the whole show in one season (Teşkilat: 1-191) gets the
// absolute number instead.
function episodeNb(seriesNb, season, episode, imdb) {
  return getJson(SITE.api + 'videoSeason/id/' + seriesNb).then(function (data) {
    var list = rows(data);
    var pick = function (s, e) {
      var hit = list.filter(function (x) { return Number(x.season || 1) === Number(s) && Number(x.episodeNummer) === Number(e); })[0];
      return hit ? String(hit.nb) : null;
    };
    var exact = pick(season || 1, episode || 1);
    var seasons = {};
    list.forEach(function (x) { seasons[Number(x.season || 1)] = true; });
    if (exact || Number(season || 1) <= 1 || Object.keys(seasons).length !== 1) return exact;
    return absoluteEpisode(imdb, season, episode).then(function (n) { return n ? pick(Object.keys(seasons)[0], n) : null; });
  });
}

function languageOf(type) {
  var t = String(type || '').toLowerCase();
  if (t === 'ar' || t === 'arabic' || t === 'sp') return 'ara';
  if (t === 'en' || t === 'english') return 'eng';
  return t || 'und';
}

function streamsFor(videoNb, title) {
  var subs = getJson(SITE.api + 'translationFiles/id/' + videoNb).then(function (data) {
    return rows(data, 'translations').filter(function (s) { return /^https:\/\//.test(s.file || ''); }).map(function (s) {
      var lang = languageOf(s.type);
      return { url: s.file, lang: lang, label: lang === 'ara' ? 'العربية · ' + SITE.name : lang === 'eng' ? 'English · ' + SITE.name : SITE.name };
    }).sort(function (a, b) { return (b.lang === 'ara') - (a.lang === 'ara'); });
  }, function () { return []; });
  return Promise.all([getJson(SITE.api + 'transcoddedFiles/id/' + videoNb), subs]).then(function (both) {
    return rows(both[0]).filter(function (f) { return /^https:\/\//.test(f.videoUrl || ''); }).map(function (f) {
      var q = String(f.resolution || '').trim();
      return {
        name: SITE.name + (q ? ' · ' + q : ''),
        title: title + (q ? ' · ' + q : '') + (f.container ? ' · ' + f.container : ''),
        url: f.videoUrl,
        quality: q,
        provider: SITE.key,
        subtitles: both[1],
        _q: parseInt(q, 10) || 0
      };
    }).sort(function (a, b) { return b._q - a._q; }).map(function (s) { delete s._q; return s; });
  });
}

function getStreams(id, mediaType, season, episode) {
  var isTv = mediaType === 'tv' || mediaType === 'series';
  return identify(id, isTv).then(function (info) {
    if (!info || (!info.imdb && !info.anilist)) { console.log(TAG, 'no IMDb or AniList ID for', id); return []; }
    return findEntry(info, isTv).then(function (entry) {
      if (!entry) { console.log(TAG, 'not on', SITE.name, info.imdb); return []; }
      var title = entry.en_title || entry.ar_title || info.titles[0];
      if (!isTv) return streamsFor(String(entry.nb), title);
      // Anime IDs carry their own TMDB season (ARM); otherwise the app's season.
      var s = info.season || season || 1;
      return episodeNb(entry.nb, s, episode || 1, info.imdb).then(function (nb) {
        if (!nb) { console.log(TAG, 'no S' + s + 'E' + episode + ' on', SITE.name); return []; }
        return streamsFor(nb, title + ' S' + s + 'E' + (episode || 1));
      });
    });
  }).catch(function (err) {
    console.log(TAG, 'error', err && err.message);
    return [];
  });
}

module.exports = { getStreams: getStreams };

# mo7AmMeD64's Nuvio Plugins

Nuvio local scrapers (JavaScript) for the [Nuvio](https://github.com/nuvio-app/nuvio) streaming app.

## Installation

1. Open **Nuvio**
2. Go to **Settings → Plugins → Add new repository**
3. Paste:
   ```
   https://raw.githubusercontent.com/mo7AmMeD64/nuvio-plugins/main/manifest.json
   ```

## Plugins

| Plugin | Content | Quality |
| --- | --- | --- |
| CinemaBox | Movies & Series (cinema.albox.co) — Arabic subs | 1080p / 720p / 480p MP4 |
| Oscar TV | Movies, Series & Anime (ostv-11-11.xyz) | 1080p / 720p / 480p / 360p HLS |
| AnimeWitcher | Anime Movies & Series (animewitcher.com) — Arabic subs | 1080p / 720p / 480p MP4 |
| Cima Cloud | Movies, Series & Anime (cima-cloud.com) — full Arabic catalog | 1080p / 720p / 480p HLS & MP4 |
| Anime3rb | Anime Movies & Series (anime3rb.com) — Arabic subs | 1080p / 720p / 480p MP4 |
| Akwam | Movies & Series (akwam.ss / ak.sv) — Arabic content | 1080p / 720p / 480p MP4 |


<h2>support me </h2>
<p>you can support me there 🙏</p>
<p>
<a href="https://creators.sa/x3onq">https://creators.sa/x3onq</a>
</p>

## Visitors 👀
<div align="center">
  <a href="https://count.getloli.com/">
    <img src="https://count.getloli.com/@mo7AmMeD64-nuvio-plugins?name=mo7AmMeD64-nuvio-plugins&theme=rule34&padding=8&offset=0&align=top&scale=1&pixelated=1&darkmode=auto" alt="Visitor count"/>
  </a>
</div>

## How it works

Nuvio gives the scraper a TMDB id; the scraper maps it to the site by
title/year (via the TMDB API), then resolves the site's internal
show/season/episode ids and returns direct MP4 streams.

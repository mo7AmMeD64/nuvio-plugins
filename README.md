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

## How it works

Nuvio gives the scraper a TMDB id; the scraper maps it to the site by
title/year (via the TMDB API), then resolves the site's internal
show/season/episode ids and returns direct MP4 streams.

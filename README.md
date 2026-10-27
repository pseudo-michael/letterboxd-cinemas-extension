# Watchlist at London Cinemas

A Chrome extension that shows which films on your Letterboxd watchlist are playing at London cinemas, and when.

1. Open your watchlist on letterboxd.com.
2. Click the extension, then **Find screenings**.
3. A page opens with your films, every screening grouped by day, and booking links.

On the page you can tick **Favourite cinemas** (choose yours with **Choose cinemas…**) to show only those, and **Rescreenings only** to hide this year's and last year's releases, so you see the older films that only turn up now and then.

It works in Chrome, and should work in Edge, Brave and other Chromium browsers.

## Install

There's no Chrome Web Store listing, so you install it yourself. It takes a minute:

1. Download the zip (`letterboxd-cinemas-extension.zip` from the latest release, or **Code → Download ZIP** on this page) and unzip it somewhere you'll keep it. Chrome reads the extension from that folder, so don't delete it afterwards.
2. In Chrome, go to `chrome://extensions`.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and choose the unzipped folder, the one that contains `manifest.json`. If you downloaded the repo with **Download ZIP**, that's the folder inside the zip.
5. Click the puzzle-piece icon in Chrome's toolbar and pin **Watchlist at London Cinemas**.

To update, download the new zip, replace the folder's contents, and press the refresh icon on the extension's card at `chrome://extensions`.

## What it does with your data

- **Your watchlist** is read from the Letterboxd tab you're on, by the extension itself. This works for private watchlists too, because you're already logged in. Nothing is sent anywhere. A copy is kept in your browser so you can reopen the report later.
- **London listings** are downloaded from [Clusterflick](https://clusterflick.com)'s public data on GitHub (about 27 MB, kept in your browser and refreshed when there's a new release, at most every three hours). GitHub can see that you downloaded a public file; the file contains nothing about you.
- **Matching** happens in your browser. There's no server, no account, no analytics and no AI service involved.
- **Posters** are loaded from TMDB's image server when the report opens.

The extension asks for access to `letterboxd.com` (to read your watchlist) and to GitHub (to download the listings), and for permission to run a script in the Letterboxd tab and to store settings. Nothing else.

## How matching works

Clusterflick identifies most listings as a specific film, using the same film database (TMDB) that Letterboxd does, so most matches are exact: same title, and a release year within a year either way.

For listings that aren't an exact match there's a second, cautious pass. It's flagged **Possible match** on the page, with the reason in a tooltip:

- **Event titles with extras**, such as *Mona Lisa + Q&A with the cast*, *Preview: Heat* or *Dracula: Restored and Uncut*, when Clusterflick couldn't identify the listing.
- **Typos and garbled characters**, such as *Les Mis�rables*, when the year agrees.

It's designed to miss a match rather than show a wrong one. It will **not** catch a film listed under a different title (for instance *Dracula* for *Horror of Dracula*), because that can't be told apart from two different films with similar names without more data.

## Good to know

- London only, because that's what Clusterflick covers.
- Listings are scraped once or twice a day, so check the cinema's own site before booking or travelling. Sold-out status in particular can be out of date.
- If Letterboxd redesigns its watchlist pages, reading your watchlist may stop working until the extension is updated.

## Development

No build step: the extension is plain JavaScript modules, so the repo folder can be loaded directly.

```bash
npm test                                    # unit tests (Node 16+)
node scripts/evaluate.mjs data.json my.csv  # run the matcher on a Clusterflick data file and a Letterboxd export
python scripts/make_zip.py                  # build letterboxd-cinemas-extension.zip for sharing
```

- `lib/matching.js`: exact and fuzzy matching (pure, no network)
- `lib/listings.js`: turning Clusterflick's data into listings
- `lib/watchlist.js`: reading a watchlist from a Letterboxd page
- `lib/dataset.js`: downloading and keeping the listings
- `lib/render.js`: building the report HTML
- `report.js`: the report page (filters, cinema picker)

## Credits

Listings and film identification come from the open-data work of [Clusterflick](https://clusterflick.com). Posters are from [TMDB](https://www.themoviedb.org); this product uses TMDB images but is not endorsed or certified by TMDB. This project isn't affiliated with Letterboxd.

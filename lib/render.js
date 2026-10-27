// Builds the report's HTML. Pure string-building, so it can be tested without a browser.
// Filtering, favourites and the venue picker are applied afterwards by report.js, which
// reads the data-* attributes written here.

import { normalize } from "./matching.js";
import { dayKey, fmtDayLong, fmtDayShort, fmtTime, fmtWhen, londonYear } from "./dates.js";

const POSTER_BASE = "https://image.tmdb.org/t/p/w154";

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
const esc = escapeHtml;

const plural = (n, word) => `${n.toLocaleString("en-GB")} ${word}${n === 1 ? "" : "s"}`;

/**
 * @param matches  [{film, listing, method: "exact"|"fuzzy", reason}]
 * @returns {string} HTML for everything inside <main> below the header
 */
export function renderResults(matches, nowMs) {
  const rows = screeningRows(matches);
  const films = summariseFilms(matches, rows);
  if (!films.length) return `<p class="empty">None of your films are showing in the listings I checked. New programmes are announced every month, so check back.</p>`;

  const filmIds = new Map(films.map((f, i) => [f.film, `f${i}`]));
  const newFrom = newReleaseCutoff(nowMs);

  const cards = films.map((f) => filmCard(f, filmIds.get(f.film))).join("");
  const byDay = new Map();
  for (const row of rows) {
    const key = dayKey(row.screening.time);
    if (!byDay.has(key)) byDay.set(key, { label: fmtDayLong(row.screening.time), items: [] });
    byDay.get(key).items.push(screeningRow(row, filmIds, newFrom));
  }
  const calendar = [...byDay.values()]
    .map((d) => `<h3 class="day">${esc(d.label)}</h3><ul class="rows">${d.items.join("")}</ul>`)
    .join("");

  return `<section><h2>Films</h2><div class="films">${cards}</div></section>
<section><h2>Screenings</h2>${calendar}
<p class="empty" id="no-results" hidden></p></section>`;
}

/** "New releases" are films from this year or last; everything older counts as a rescreening. */
export function newReleaseCutoff(nowMs) {
  return londonYear(nowMs) - 1;
}

/** One row per screening, shared by every watchlist film its listing matched, in time order. */
function screeningRows(matches) {
  const byListing = new Map();
  for (const m of matches) {
    if (!byListing.has(m.listing)) byListing.set(m.listing, []);
    byListing.get(m.listing).push(m);
  }
  const rows = [];
  for (const [listing, ms] of byListing) {
    for (const screening of listing.screenings) rows.push({ listing, screening, matches: ms });
  }
  rows.sort((a, b) => a.screening.time - b.screening.time);
  rows.forEach((row, i) => { row.id = `s${i}`; });
  return rows;
}

function summariseFilms(matches, rows) {
  const rowsByScreening = new Map(rows.map((row) => [row.screening, row]));
  const films = new Map();
  for (const m of matches) {
    let summary = films.get(m.film);
    if (!summary) {
      summary = { film: m.film, rows: [], posterPath: null, exact: false, reason: null };
      films.set(m.film, summary);
    }
    for (const screening of m.listing.screenings) summary.rows.push(rowsByScreening.get(screening));
    summary.posterPath ??= posterFor(m.film, m.listing);
    if (m.method === "exact") summary.exact = true;
    else summary.reason ??= m.reason;
  }
  for (const summary of films.values()) summary.rows.sort((a, b) => a.screening.time - b.screening.time);
  return [...films.values()].sort((a, b) => a.rows[0].screening.time - b.rows[0].screening.time);
}

function posterFor(film, listing) {
  const same = listing.films.filter((r) => normalize(r.title) === normalize(film.title));
  return [...same, ...listing.films].find((r) => r.posterPath)?.posterPath ?? null;
}

function filmCard(summary, filmId) {
  const { film } = summary;
  const first = summary.rows[0];
  const poster = summary.posterPath
    ? `<img src="${POSTER_BASE}${esc(summary.posterPath)}" alt="" loading="lazy">`
    : `<div class="no-poster">${esc([...film.title][0] ?? "?")}</div>`;
  const badge = summary.exact ? "" : possibleBadge(summary.reason);
  const year = film.year ? ` <span class="year">${film.year}</span>` : "";
  const letterboxd = film.url ? ` · <a class="letterboxd" href="${esc(film.url)}" target="_blank" rel="noopener">Letterboxd</a>` : "";
  // The title link stretches over the whole card (see .film h3 a::after in the CSS).
  return `<article class="film" data-film="${filmId}">${poster}<div>
<h3><a href="#${first.id}">${esc(film.title)}</a>${year}</h3>
<p><span class="count">${plural(summary.rows.length, "screening")}</span> · next <span class="next">${esc(fmtWhen(first.screening.time))}</span>${letterboxd}</p>
${badge}</div></article>`;
}

function screeningRow(row, filmIds, newFrom) {
  const { screening: s, matches } = row;
  const meta = [s.venueName];
  if (s.screen) meta.push(/^\d+$/.test(s.screen) ? `Screen ${s.screen}` : s.screen);
  meta.push(...s.tags);
  if (s.notes) meta.push(s.notes.split("\n")[0]);

  const why = [];
  for (const m of matches) {
    if (m.method === "fuzzy") why.push(`${esc(filmLabel(m.film))} ${possibleBadge(m.reason)}`);
    else if (normalize(m.film.title) !== normalize(s.title)) why.push(esc(filmLabel(m.film)));
  }
  const whyHtml = why.length ? `<p class="why">On your watchlist as ${why.join(", ")}</p>` : "";

  let action = "";
  if (s.soldOut) action = `<span class="sold-out">Sold out</span>`;
  else if (s.bookingUrl) action = `<a class="book" href="${esc(s.bookingUrl)}" target="_blank" rel="noopener">Book</a>`;

  // A row counts as a new release only if every film it shows is; films with no year yet
  // are usually unreleased, so they count as new too.
  const isNew = matches.every((m) => m.film.year == null || m.film.year >= newFrom);
  const attrs = `data-films="${[...new Set(matches.map((m) => filmIds.get(m.film)))].join(" ")}" data-venue="${esc(s.venueId)}" data-new="${isNew ? 1 : 0}" data-when="${esc(fmtWhen(s.time))}"`;
  return `<li id="${row.id}" ${attrs}><time>${fmtTime(s.time)}</time><div class="what">
<p class="title">${esc(s.title)}</p><p class="meta">${meta.map(esc).join(" · ")}</p>${whyHtml}</div>${action}</li>`;
}

const filmLabel = (film) => (film.year ? `${film.title} (${film.year})` : film.title);

function possibleBadge(reason) {
  return `<span class="badge possible" title="${esc(reason ?? "Matched by title similarity")}">Possible match</span>`;
}

export { fmtDayShort };

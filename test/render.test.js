import { test } from "node:test";
import assert from "node:assert/strict";
import { renderResults, escapeHtml, newReleaseCutoff } from "../lib/render.js";
import { fmtWhen, fmtDayLong, fmtTime } from "../lib/dates.js";

// 2026-10-27 12:00 London time (GMT, since BST ended on 25 Oct)
const NOW = Date.UTC(2026, 9, 27, 12, 0);
const at = (iso) => Date.parse(iso);
const screening = (over = {}) => ({
  time: at("2026-10-28T18:15:00Z"), venueId: "v1", venueName: "BFI Southbank", title: "Double Indemnity",
  bookingUrl: "https://example.com/book?a=1&b=2", screen: "1", soldOut: false, notes: null, tags: ["35mm"], ...over,
});
const listing = (screenings, over = {}) => ({ id: "1", key: "1|x", title: "Double Indemnity", films: [], altTitles: [], screenings, ...over });
const film = (title, year) => ({ title, year, url: `https://letterboxd.com/film/${title}/` });

test("dates are shown in London time, including across the clock change", () => {
  assert.equal(fmtTime(at("2026-10-24T17:30:00Z")), "18:30"); // still BST
  assert.equal(fmtTime(at("2026-10-26T17:30:00Z")), "17:30"); // GMT
  assert.equal(fmtDayLong(at("2026-10-24T23:30:00Z")), "Sunday 25 October"); // 00:30 BST next day
  assert.equal(fmtWhen(at("2026-09-05T12:00:00Z")), "Sat 5 Sep, 13:00");
});

test("a year-end rollover moves the rescreening cutoff", () => {
  assert.equal(newReleaseCutoff(NOW), 2025);
  assert.equal(newReleaseCutoff(at("2027-01-02T12:00:00Z")), 2026);
  assert.equal(newReleaseCutoff(at("2026-12-31T23:30:00Z")), 2025); // 23:30 GMT, still 2026 in London
});

test("results include a card and a row per screening, with filter data", () => {
  const l = listing([screening(), screening({ time: at("2026-10-29T14:00:00Z"), venueId: "v2", venueName: "Close-Up", soldOut: true })],
    { films: [{ title: "Double Indemnity", year: 1944, tmdbId: "1", posterPath: "/p.jpg" }] });
  const html = renderResults([{ film: film("Double Indemnity", 1944), listing: l, method: "exact", reason: null }], NOW);
  assert.equal((html.match(/<article class="film"/g) || []).length, 1);
  assert.equal((html.match(/<li id="s\d+"/g) || []).length, 2);
  assert.match(html, /data-venue="v1"/);
  assert.match(html, /data-new="0"/); // 1944 is a rescreening
  assert.match(html, /Sold out/);
  assert.match(html, /image\.tmdb\.org\/t\/p\/w154\/p\.jpg/);
  assert.match(html, /<a href="#s0">Double Indemnity<\/a>/); // card jumps to the first screening
  assert.match(html, /next <span class="next">Wed 28 Oct, 18:15<\/span>/);
});

test("recent releases and films without a year count as new; a double bill is new only if both films are", () => {
  const mk = (...films) => films.map((f) => ({ film: f, listing: listing([screening()]), method: "exact", reason: null }));
  const flag = (matches) => /data-new="(\d)"/.exec(renderResults(matches, NOW))[1];
  assert.equal(flag(mk(film("A", 2026))), "1");
  assert.equal(flag(mk(film("A", 2025))), "1");
  assert.equal(flag(mk(film("A", 2024))), "0");
  assert.equal(flag(mk(film("A", null))), "1");
  const l = listing([screening()]);
  const double = [film("Old", 1950), film("New", 2026)].map((f) => ({ film: f, listing: l, method: "exact", reason: null }));
  assert.equal(flag(double), "0"); // shows an old film too, so it's a rescreening
});

test("fuzzy matches are flagged with their reason; untrusted text is escaped", () => {
  const l = listing([screening({ title: `<img src=x onerror=alert(1)> + Q&A`, venueName: `A "quoted" <venue>` })]);
  const html = renderResults([{ film: film("Pressure", 1976), listing: l, method: "fuzzy", reason: `Listed as "x" <b>` }], NOW);
  assert.match(html, /class="badge possible" title="Listed as &quot;x&quot; &lt;b&gt;"/);
  assert.ok(!html.includes("<img src=x"));
  assert.ok(!html.includes("<venue>"));
  assert.match(html, /href="https:\/\/example\.com\/book\?a=1&amp;b=2"/);
  assert.equal(escapeHtml(`<a href="x">&'`), "&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
});

test("nothing showing gives a friendly message instead of an empty page", () => {
  assert.match(renderResults([], NOW), /None of your films are showing/);
});

test("each film card has an untick checkbox and a stable key", () => {
  const l = listing([screening()]);
  const html = renderResults([
    { film: film("Double Indemnity", 1944), listing: l, method: "exact", reason: null },
    { film: { title: "No Link", year: null }, listing: l, method: "exact", reason: null },
  ], NOW);
  assert.equal((html.match(/<label class="pick"/g) || []).length, 2);
  assert.match(html, /data-key="https:\/\/letterboxd\.com\/film\/Double Indemnity\/"/); // the Letterboxd URL when there is one
  assert.match(html, /data-key="No Link\|"/);                                           // otherwise title and year
});

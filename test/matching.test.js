import { test } from "node:test";
import assert from "node:assert/strict";
import { normalize, titleCandidates, matchExact, matchFuzzy, findMatches } from "../lib/matching.js";

const film = (title, year) => ({ title, year });
const ref = (title, year) => ({ title, year, tmdbId: "1", posterPath: null });
// A listing Clusterflick identified (films = what it shows) or didn't (films = []).
const listing = (title, films = [], altTitles = []) =>
  ({ id: title, key: title, title, films, altTitles, screenings: [] });

test("normalize ignores case, accents, punctuation, ampersands and leading articles", () => {
  assert.equal(normalize("The Emperor's New Groove"), "emperors new groove");
  assert.equal(normalize("Emperor�s New Groove"), "emperors new groove"); // replacement char
  assert.equal(normalize("Ganja & Hess"), normalize("Ganja and Hess"));
  assert.equal(normalize("Amélie"), "amelie");
  assert.equal(normalize("Billy Wilder: Americaâ€™s Witness"), normalize("Billy Wilder: America's Witness"));
  assert.equal(normalize("日本語"), "日本語"); // non-Latin falls back instead of becoming empty
});

test("exact matching uses title and year, with a year of slack", () => {
  const wl = [film("35 Shots of Rum", 2008), film("Thunder Road", 2018), film("Mona Lisa", null)];
  const ls = [
    listing("35 Shots of Rum", [ref("35 Shots of Rum", 2009)]),
    listing("Thunder Road", [ref("Thunder Road", 1958)]), // different film, same title
    listing("Mona Lisa", [ref("Mona Lisa", 1986)]),       // watchlist year unknown
  ];
  const [matches, leftover] = matchExact(wl, ls);
  assert.deepEqual(matches.map((m) => m.film.title).sort(), ["35 Shots of Rum", "Mona Lisa"]);
  assert.deepEqual(leftover.map((l) => l.title), ["Thunder Road"]);
});

test("a double bill matches every watchlist film in it", () => {
  const wl = [film("Alpha", 2000), film("Beta", 2001)];
  const [matches] = matchExact(wl, [listing("Alpha + Beta", [ref("Alpha", 2000), ref("Beta", 2001)])]);
  assert.equal(matches.length, 2);
});

test("title candidates strip decorations", () => {
  const keys = (t) => [...titleCandidates(t).keys()];
  assert.ok(keys("Mona Lisa + Q&A with Lola Young and actor Cathy Tyson").includes("mona lisa"));
  assert.ok(keys("Member Picks: The Man with Two Brains").includes("man with two brains"));
  assert.ok(keys("Dracula: Restored and Uncut + extended intro").includes("dracula"));
  assert.ok(keys("Preview: Heat (1995)").includes("heat"));
  assert.ok(keys("Alien with live score").includes("alien"));
  assert.ok(keys("Replikka (2025) + My Foreign Land (2025) + Intro").includes("my foreign land"));
  assert.equal(titleCandidates("Replikka (2025) + My Foreign Land (2025)").get("my foreign land").year, 2025);
});

test("fuzzy: finds a film hidden in an unidentified event title", () => {
  const wl = [film("Pressure", 1976), film("The Man with Two Brains", 1983)];
  const found = matchFuzzy(wl, [
    listing("Pressure + intro by Xavier Alexandre Pillai, BFI TV Programmer"),
    listing("Member Picks: The Man with Two Brains"),
  ]);
  assert.deepEqual(found.map((m) => m.film.title), ["Pressure", "The Man with Two Brains"]);
  assert.ok(found.every((m) => m.method === "fuzzy" && m.reason));
});

test("fuzzy: checks the year when the event title states one", () => {
  const wl = [film("Ink", 2009), film("Replika", 2025)];
  const found = matchFuzzy(wl, [listing("Ink (2023) + Q&A"), listing("Replika (2025) + Intro")]);
  assert.deepEqual(found.map((m) => m.film.title), ["Replika"]);
});

test("fuzzy: catches typos and encoding glitches in identified films", () => {
  const wl = [film("Filipiñana", 2020), film("Les Misérables", 2019)];
  const found = matchFuzzy(wl, [
    listing("FilipiÃ±ana", [ref("FilipiÃ±ana", 2020)]),
    listing("Les Mis�rables", [ref("Les Mis�rables", 2019)]),
  ]);
  assert.equal(found.length, 2);
});

test("fuzzy: does not trust an event title when Clusterflick identified the films", () => {
  // A shorts programme that happens to share a name with a feature on the watchlist.
  const wl = [film("Altered States", 1980)];
  const programme = listing("Altered States", [ref("Mon Taxi", 2026), ref("Bundle", 2026)]);
  assert.deepEqual(matchFuzzy(wl, [programme]), []);
});

test("fuzzy: does not match different films with similar names", () => {
  const wl = [film("Sunshine", 2007), film("The Kingdom", 2024), film("Legend", 1985), film("Rose", 2026),
    film("Alien", 1979), film("Thunder Road", 2018), film("Opening Night", 1977), film("Introduction", 2021)];
  const found = matchFuzzy(wl, [
    listing("Secret Sunshine", [ref("Secret Sunshine", 2007)]),
    listing("Kensuke's Kingdom", [ref("Kensuke's Kingdom", 2024)]),
    listing("The Legend of the Suram Fortress", [ref("The Legend of the Suram Fortress", 1985)]),
    listing("Aliens", [ref("Aliens", 1986)]),
    listing("Thunder Road", [ref("Thunder Road", 1958)]),
    // events whose titles merely contain a watchlist title
    listing("Unrestricted View Horror Film Festival 2026: Opening Night"),
    listing("LIAF: British Showcase + Introduction"),
    listing("Rose Theatre Quiz Night"),
    listing("Sunshine Sing-along Club"),
  ]);
  assert.deepEqual(found.map((m) => m.film.title), []);
});

test("fuzzy: won't match a very short title without a year to confirm it", () => {
  assert.equal(matchFuzzy([film("Rose", 2026)], [listing("Rose + Q&A")]).length, 0);
  assert.equal(matchFuzzy([film("Rose", 2026)], [listing("Rose (2026) + Q&A")]).length, 1);
});

test("findMatches runs exact first and only fuzzes the leftovers", () => {
  const wl = [film("Mona Lisa", 1986), film("Pressure", 1976)];
  const found = findMatches(wl, [
    listing("Mona Lisa", [ref("Mona Lisa", 1986)]),
    listing("Pressure + intro"),
  ]);
  assert.deepEqual(found.map((m) => `${m.film.title}:${m.method}`), ["Mona Lisa:exact", "Pressure:fuzzy"]);
});

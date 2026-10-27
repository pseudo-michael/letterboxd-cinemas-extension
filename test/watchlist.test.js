import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDisplayName, watchlistUserFromUrl, readWatchlist, toFilm } from "../lib/watchlist.js";

test("splits a Letterboxd display name into title and year", () => {
  assert.deepEqual(parseDisplayName("The History of Concrete (2026)"), { title: "The History of Concrete", year: 2026 });
  assert.deepEqual(parseDisplayName("Saturn Return"), { title: "Saturn Return", year: null });
  assert.deepEqual(parseDisplayName("Mr. Nobody (Director's Cut) (2009)"), { title: "Mr. Nobody (Director's Cut)", year: 2009 });
  assert.deepEqual(parseDisplayName("2001 (1968)"), { title: "2001", year: 1968 });
});

test("recognises watchlist pages, whichever page or filter you're on", () => {
  assert.equal(watchlistUserFromUrl("https://letterboxd.com/dave/watchlist/"), "dave");
  assert.equal(watchlistUserFromUrl("https://letterboxd.com/dave/watchlist/page/3/"), "dave");
  assert.equal(watchlistUserFromUrl("https://letterboxd.com/dave/watchlist/by/rating/"), "dave");
  assert.equal(watchlistUserFromUrl("https://letterboxd.com/dave/watchlist"), "dave");
  assert.equal(watchlistUserFromUrl("https://letterboxd.com/dave/films/"), null);
  assert.equal(watchlistUserFromUrl("https://letterboxd.com/film/watchlist/"), "film"); // a user can be called anything
  assert.equal(watchlistUserFromUrl("https://example.com/dave/watchlist/"), null);
  assert.equal(watchlistUserFromUrl(undefined), null);
});

test("readWatchlist reads every page in order and drops duplicates", async () => {
  const pages = {
    1: [{ name: "A (2000)", link: "/film/a/" }, { name: "B (2001)", link: "/film/b/" }],
    2: [{ name: "C (2002)", link: "/film/c/" }, { name: "B (2001)", link: "/film/b/" }], // shifted while reading
    3: [{ name: "D", link: "/film/d/" }],
  };
  const calls = [];
  const progress = [];
  const films = await readWatchlist(
    async (page) => { calls.push(page); await new Promise((r) => setTimeout(r, 5 - page)); return { items: pages[page], lastPage: 3 }; },
    (done, total) => progress.push([done, total]),
  );
  assert.deepEqual(films.map((f) => f.title), ["A", "B", "C", "D"]);
  assert.deepEqual([...calls].sort(), [1, 2, 3]);
  assert.deepEqual(progress.at(-1), [3, 3]);
  assert.equal(films[0].url, "https://letterboxd.com/film/a/");
});

test("readWatchlist copes with a single page and surfaces errors", async () => {
  assert.equal((await readWatchlist(async () => ({ items: [{ name: "A", link: "/film/a/" }], lastPage: 1 }))).length, 1);
  await assert.rejects(readWatchlist(async () => ({ error: "Letterboxd answered 403" })), /403/);
  await assert.rejects(
    readWatchlist(async (p) => (p === 2 ? { error: "Letterboxd answered 429" } : { items: [], lastPage: 3 })), /429/);
});

// Dev tool: run the matcher on real data and print what it finds.
//   node scripts/evaluate.mjs path/to/combined-data.json path/to/watchlist.csv
import { readFileSync } from "node:fs";
import { extractListings } from "../lib/listings.js";
import { matchExact, matchFuzzy } from "../lib/matching.js";

const [dataPath, csvPath] = process.argv.slice(2);
if (!dataPath || !csvPath) { console.error("usage: node scripts/evaluate.mjs combined-data.json watchlist.csv"); process.exit(1); }

function parseCsv(text) {
  const rows = []; let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false; } else cell += c; }
    else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const [head, ...body] = parseCsv(readFileSync(csvPath, "utf8").replace(/^﻿/, ""));
const iName = head.indexOf("Name"), iYear = head.indexOf("Year");
const watchlist = body.filter((r) => r[iName]).map((r) => ({ title: r[iName], year: parseInt(r[iYear], 10) || null }));

const dataset = JSON.parse(readFileSync(dataPath, "utf8"));
const listings = extractListings(dataset, null, Date.now());
const [exact, leftover] = matchExact(watchlist, listings);
console.time("fuzzy");
const t0 = performance.now();
const fuzzy = matchFuzzy(watchlist, leftover);
const ms = Math.round(performance.now() - t0);

const films = (ms_) => new Set(ms_.map((m) => m.film)).size;
console.log(`watchlist ${watchlist.length} | listings ${listings.length} | exact: ${films(exact)} films | fuzzy pass over ${leftover.length} leftovers took ${ms} ms`);
console.log(`\n${fuzzy.length} fuzzy match(es):`);
for (const m of fuzzy) {
  const venues = [...new Set(m.listing.screenings.map((s) => s.venueName))].slice(0, 2).join(", ");
  console.log(`  ${m.film.title} (${m.film.year ?? "?"})  <=  ${JSON.stringify(m.listing.title).slice(0, 70)}  @ ${venues}\n      ${m.reason}`);
}

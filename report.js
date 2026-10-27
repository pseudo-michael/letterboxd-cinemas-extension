// The report page: reads the watchlist from the Letterboxd tab, loads London listings,
// matches them, and shows the result with filters.

import { loadDataset } from "./lib/dataset.js";
import { londonYear } from "./lib/dates.js";
import { extractListings, venuesWithListings } from "./lib/listings.js";
import { findMatches } from "./lib/matching.js";
import { escapeHtml, newReleaseCutoff, renderResults } from "./lib/render.js";
import { fetchWatchlistPage, readWatchlist } from "./lib/watchlist.js";

const $ = (id) => document.getElementById(id);
const plural = (n, word) => `${n.toLocaleString("en-GB")} ${word}${n === 1 ? "" : "s"}`;
const paint = () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve)));

// ?tab=…&user=… is set by the popup; it's used once, then the saved watchlist takes over.
const params = new URLSearchParams(location.search);
let pendingTab = params.has("tab") ? { tabId: Number(params.get("tab")), user: params.get("user") } : null;

let favourites = new Set();
let filters = { fav: false, old: false };
let venues = []; // [{id, name, films}] for the venue picker
let watchlistSize = 0;

// ---------------------------------------------------------------------------------------
// Progress

function setStatus(text, { fraction = null, detail = "" } = {}) {
  $("status").hidden = false;
  $("status").classList.remove("error");
  $("status-text").textContent = text;
  $("status-detail").textContent = detail;
  $("status-bar").parentElement.hidden = fraction === null;
  $("status-bar").style.width = `${Math.round((fraction ?? 0) * 100)}%`;
}

/** "all" shows the toggles, "refresh" only the refresh button, "none" hides the whole row. */
function showControls(mode) {
  $("filters").hidden = mode === "none";
  for (const id of ["filter-fav", "filter-old", "choose-venues"]) $(id).closest("label, button").hidden = mode !== "all";
}

function showError(error) {
  console.error(error);
  $("status").hidden = false;
  $("status").classList.add("error");
  $("status-text").textContent = "That didn't work.";
  $("status-bar").parentElement.hidden = true;
  $("status-detail").textContent = error.message;
  $("headline").textContent = "Couldn't finish";
  $("refresh").disabled = false;
  showControls("refresh");
}

// ---------------------------------------------------------------------------------------
// Steps

async function getWatchlist() {
  const { watchlist: saved } = await chrome.storage.local.get("watchlist");

  if (pendingTab) {
    const { tabId, user } = pendingTab;
    pendingTab = null;
    try {
      setStatus("Reading your watchlist…", { fraction: 0 });
      const fetchPage = async (page) => {
        const [result] = await chrome.scripting.executeScript({ target: { tabId }, func: fetchWatchlistPage, args: [user, page] });
        return result?.result ?? { error: "the Letterboxd tab didn't answer" };
      };
      const films = await readWatchlist(fetchPage, (done, total) =>
        setStatus("Reading your watchlist…", { fraction: done / total, detail: `Page ${done} of ${total}` }));
      if (!films.length) throw new Error("no films were found on that page. Is the watchlist empty, or private while you're logged out?");
      const watchlist = { user, films, savedAt: Date.now() };
      await chrome.storage.local.set({ watchlist });
      history.replaceState(null, "", "report.html");
      return { watchlist, note: null };
    } catch (e) {
      if (!saved) throw new Error(`Couldn't read the watchlist from Letterboxd: ${e.message} Open your watchlist on letterboxd.com and click the extension again.`);
      const when = new Date(saved.savedAt).toLocaleDateString(undefined, { day: "numeric", month: "long" });
      return { watchlist: saved, note: `Couldn't read your watchlist from Letterboxd (${e.message}), so this uses the copy saved on ${when}.` };
    }
  }

  if (!saved) {
    throw new Error("There's no watchlist yet. Open your watchlist on letterboxd.com, then click the extension icon and choose “Find screenings”.");
  }
  return { watchlist: saved, note: null };
}

async function run({ refresh }) {
  showControls("none");
  $("refresh").disabled = true;
  $("results").replaceChildren();
  $("warning").hidden = true;

  const { watchlist, note } = await getWatchlist();
  watchlistSize = watchlist.films.length;

  setStatus("Getting the London listings…", { fraction: 0 });
  const { dataset, warning } = await loadDataset({
    refresh,
    onProgress: (loaded, total) => setStatus("Downloading the London listings…", {
      fraction: total ? loaded / total : null,
      detail: total ? `${(loaded / 1e6).toFixed(0)} of ${(total / 1e6).toFixed(0)} MB. This only happens when there's a new release.` : "",
    }),
  });

  setStatus("Matching your films…");
  await paint();
  const now = Date.now();
  const listings = extractListings(dataset, null, now);
  const matches = findMatches(watchlist.films, listings);

  const filmsByVenue = new Map();
  for (const m of matches) {
    for (const s of m.listing.screenings) {
      if (!filmsByVenue.has(s.venueId)) filmsByVenue.set(s.venueId, new Set());
      filmsByVenue.get(s.venueId).add(m.film);
    }
  }
  venues = venuesWithListings(dataset, listings).map((v) => ({ ...v, films: filmsByVenue.get(v.id)?.size ?? 0 }));

  const films = new Set(matches.map((m) => m.film)).size;
  $("eyebrow").textContent = `London · ${plural(venues.length, "cinema")} checked`;
  $("results").innerHTML = renderResults(matches, now);
  $("status").hidden = true;

  const warnings = [note, warning].filter(Boolean);
  $("warning").textContent = warnings.join(" ");
  $("warning").hidden = !warnings.length;

  const updated = dataset.generatedAt ? ` · listings updated ${new Date(dataset.generatedAt).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : "";
  $("meta").innerHTML = `${escapeHtml(watchlist.user)}'s watchlist (${plural(watchlist.films.length, "film")})`
    + (films ? ` · <span id="screening-count"></span>` : "") + escapeHtml(updated);

  if (films) {
    $("old-hint").textContent = `hides ${newReleaseCutoff(now)}–${londonYear(now)} releases`;
    showControls("all");
    applyFilters();
  } else {
    $("headline").textContent = `None of your ${plural(watchlistSize, "film")} are showing`;
    showControls("refresh");
  }
  $("refresh").disabled = false;
}

async function start(options) {
  try {
    await run(options);
  } catch (e) {
    showError(e);
  }
}

// ---------------------------------------------------------------------------------------
// Filters

async function saveSettings() {
  await chrome.storage.local.set({ favouriteVenues: [...favourites], filters });
}

/** Hides screenings, days and films that don't pass the toggles, and updates every count. */
function applyFilters() {
  const rows = [...document.querySelectorAll(".rows li")];
  const byFilm = new Map();
  let shown = 0;
  for (const row of rows) {
    const ok = (!filters.fav || favourites.has(row.dataset.venue)) && (!filters.old || row.dataset.new === "0");
    row.hidden = !ok;
    if (!ok) continue;
    shown++;
    for (const id of row.dataset.films.split(" ")) {
      if (!byFilm.has(id)) byFilm.set(id, []);
      byFilm.get(id).push(row);
    }
  }
  for (const list of document.querySelectorAll(".rows")) {
    list.hidden = list.previousElementSibling.hidden = ![...list.children].some((li) => !li.hidden);
  }

  let films = 0;
  for (const card of document.querySelectorAll(".film")) {
    const filmRows = byFilm.get(card.dataset.film);
    card.hidden = !filmRows;
    if (!filmRows) continue;
    films++;
    card.querySelector(".count").textContent = plural(filmRows.length, "screening");
    card.querySelector(".next").textContent = filmRows[0].dataset.when;
    card.querySelector("h3 a").href = `#${filmRows[0].id}`;
  }

  $("headline").textContent = `${films} of your ${watchlistSize} watchlist films ${films === 1 ? "is" : "are"} showing`;
  const count = $("screening-count");
  if (count) count.textContent = `${plural(shown, "upcoming screening")}`;

  const empty = $("no-results");
  if (empty) {
    empty.hidden = shown > 0;
    empty.textContent = filters.fav && favourites.size === 0
      ? "You haven't chosen any favourite cinemas yet. Use “Choose cinemas…” to pick some."
      : "No screenings match these filters.";
  }
  $("filter-fav").checked = filters.fav;
  $("filter-old").checked = filters.old;
}

function buildVenueList() {
  const list = $("venue-list");
  list.replaceChildren();
  const rank = (v) => (favourites.has(v.id) ? 0 : v.films ? 1 : 2);
  const sorted = [...venues].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, "en"));
  for (const v of sorted) {
    const item = document.createElement("li");
    item.dataset.name = v.name.toLowerCase();
    const label = document.createElement("label");
    const box = Object.assign(document.createElement("input"), { type: "checkbox", value: v.id, checked: favourites.has(v.id) });
    label.append(box, v.name);
    if (v.films) label.append(Object.assign(document.createElement("span"), { className: "n", textContent: `${v.films.toLocaleString("en-GB")} of your film${v.films === 1 ? "" : "s"}` }));
    item.append(label);
    list.append(item);
  }
}

function openVenueDialog() {
  $("venue-search").value = "";
  buildVenueList();
  $("venue-dialog").showModal();
}

function setupControls() {
  $("filter-fav").addEventListener("change", (e) => {
    filters.fav = e.target.checked;
    saveSettings();
    applyFilters();
    if (filters.fav && favourites.size === 0) openVenueDialog();
  });
  $("filter-old").addEventListener("change", (e) => {
    filters.old = e.target.checked;
    saveSettings();
    applyFilters();
  });
  $("choose-venues").addEventListener("click", openVenueDialog);
  $("refresh").addEventListener("click", () => start({ refresh: true }));

  $("venue-search").addEventListener("input", (e) => {
    const query = e.target.value.trim().toLowerCase();
    for (const item of $("venue-list").children) item.hidden = Boolean(query) && !item.dataset.name.includes(query);
  });
  $("venue-list").addEventListener("change", (e) => {
    if (e.target.checked) favourites.add(e.target.value);
    else favourites.delete(e.target.value);
    saveSettings();
    applyFilters();
  });
  $("venue-clear").addEventListener("click", () => {
    favourites.clear();
    for (const box of $("venue-list").querySelectorAll("input")) box.checked = false;
    saveSettings();
    applyFilters();
  });
}

// ---------------------------------------------------------------------------------------

const stored = await chrome.storage.local.get(["favouriteVenues", "filters"]);
favourites = new Set(stored.favouriteVenues ?? []);
filters = { fav: false, old: false, ...stored.filters };
setupControls();
start({ refresh: false });

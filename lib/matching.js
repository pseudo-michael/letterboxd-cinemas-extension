// Matching watchlist films to cinema listings, with no AI and no network.
//
// 1. matchExact: normalised title + year (within one year) against the films that
//    Clusterflick identified for each listing. Catches nearly everything.
// 2. matchFuzzy: for listings exact matching left over. Deliberately strict, and every
//    match it makes carries a human-readable reason so the report can flag it as "possible".
//      a. typos and encoding glitches ("Filipiñana" vs "FilipiÃ±ana"): near-identical titles
//         with a compatible year
//      b. decorated event titles ("Mona Lisa + Q&A", "Preview: X", "X: Restored and Uncut")
//         for listings Clusterflick couldn't identify at all

const MOJIBAKE = [[/â€™|â€˜/g, ""], [/â€“|â€”/g, " "]];

/** Lower-case ASCII words, no accents, punctuation or leading article. */
export function normalize(title) {
  let text = title;
  for (const [pattern, replacement] of MOJIBAKE) text = text.replace(pattern, replacement);
  text = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’‘`´]/g, "")
    .replace(/[^\x00-\x7f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^(the|a|an) /, "");
  // Titles in non-Latin scripts normalise to nothing; fall back so they can still match each other.
  return text || title.trim().toLowerCase();
}

export function yearsCompatible(a, b, tolerance = 1) {
  // Letterboxd and TMDB occasionally disagree by a year (festival vs release dates).
  return a == null || b == null || Math.abs(a - b) <= tolerance;
}

export function editDistance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[b.length];
}

export const similarity = (a, b) => 1 - editDistance(a, b) / (Math.max(a.length, b.length) || 1);

function indexByTitle(watchlist) {
  const index = new Map();
  for (const film of watchlist) {
    const key = normalize(film.title);
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(film);
  }
  return index;
}

/** Returns [matches, leftoverListings]. */
export function matchExact(watchlist, listings) {
  const byTitle = indexByTitle(watchlist);
  const matches = [];
  const leftover = [];
  for (const listing of listings) {
    const found = new Set();
    for (const ref of listing.films) {
      for (const film of byTitle.get(normalize(ref.title)) ?? []) {
        if (yearsCompatible(film.year, ref.year)) found.add(film);
      }
    }
    if (found.size) for (const film of found) matches.push({ film, listing, method: "exact", reason: null });
    else leftover.push(listing);
  }
  return [matches, leftover];
}

// ---------------------------------------------------------------------------------------
// Fuzzy matching

// Words an event title adds to a film's title without changing which film it is.
const DECORATION_WORDS = new Set([
  "restored", "restoration", "uncut", "extended", "remastered", "remaster", "cut", "directors",
  "director", "version", "newly", "new", "digital", "preview", "previews", "relaxed", "screening",
  "intro", "introduction", "introduced", "qa", "q", "a", "and", "with", "plus", "rerelease",
  "re", "release", "anniversary", "special", "encore", "dubbed", "subtitled", "imax", "3d", "2d",
  "35mm", "70mm", "16mm", "4k", "2k", "hd", "uhd", "s",
]);

// Labels cinemas put before a film's title ("Member Picks: Heat").
const PREFIXES = new Set([
  "member picks", "member exclusive", "members exclusive", "member screening", "members screening",
  "cult classic", "cult classics", "classic", "classics", "funday classics", "classic matinee",
  "family film club", "kids club", "kids", "family", "relaxed screening", "sing along",
  "singalong", "double bill", "film", "screening", "special screening", "tv preview",
  "bfi player", "pay what you can", "queer horror nights", "late night", "midnight",
]);

const isDecoration = (text) => normalize(text).split(" ").every((w) => DECORATION_WORDS.has(w));
const isPrefix = (text) => PREFIXES.has(normalize(text)) || isDecoration(text);
const WITH_CUE = /^(.*?)\s+(?:with|w\/)\s+(?:an?\s+|the\s+)?(?:intro|introduction|q\s*&\s*a|live|director|guests?|panel|discussion|special|new score|talk)\b/i;

/**
 * Titles a decorated event name might be hiding, each with the release year the event
 * title states (if any): "Mona Lisa + Q&A with Lola Young" -> "Mona Lisa".
 */
export function titleCandidates(text, depth = 0) {
  const out = new Map(); // normalised -> { text, year }
  const add = (t, year) => {
    const key = normalize(t);
    // "Introduction" or "Preview" on its own is part of an event title, not a film.
    if (key && !out.has(key) && !isDecoration(t)) out.set(key, { text: t.trim(), year });
  };

  for (const part of text.split(/\s*\+\s*/)) {
    let year = null;
    const segment = part
      .replace(/[([]([^)\]]*)[)\]]/g, (_, inner) => {
        const y = /^\s*((?:19|20)\d{2})\s*$/.exec(inner);
        if (y) year = Number(y[1]);
        return " ";
      })
      .replace(/\s+/g, " ")
      .trim();
    if (!segment) continue;
    add(segment, year);

    const heads = [segment];
    const withCue = WITH_CUE.exec(segment);
    if (withCue) { add(withCue[1], year); heads.push(withCue[1]); }

    for (const head of heads) {
      const pieces = head.split(/\s*[:|]\s*|\s+[-–—]\s+/).filter(Boolean);
      if (pieces.length < 2) continue;
      if (isPrefix(pieces[0]) && depth < 3) {
        for (const c of titleCandidates(pieces.slice(1).join(": "), depth + 1).values()) add(c.text, c.year ?? year);
      }
      if (pieces.slice(1).every(isDecoration)) add(pieces[0], year);
    }
  }
  return out;
}

export function matchFuzzy(watchlist, listings) {
  const byTitle = indexByTitle(watchlist);
  const entries = watchlist.map((film) => ({ film, key: normalize(film.title) }));
  const matches = [];

  for (const listing of listings) {
    const found = new Map(); // film -> reason

    if (listing.films.length) {
      // Clusterflick knows which film(s) this is, so never second-guess it from the event
      // title (a shorts programme called "Altered States" isn't the Ken Russell film).
      // Only look for the same film spelt slightly differently. (Alternative titles like
      // "Dracula" / "Horror of Dracula" can't be told apart from different films like
      // "Sunshine" / "Secret Sunshine" without more data, so they're left alone.)
      for (const ref of listing.films) {
        const refKey = normalize(ref.title);
        for (const { film, key } of entries) {
          if (found.has(film) || film.year == null || ref.year == null) continue;
          if (!yearsCompatible(film.year, ref.year)) continue;
          if (Math.abs(key.length - refKey.length) <= 3 && Math.min(key.length, refKey.length) >= 7
              && similarity(key, refKey) >= 0.88) {
            found.set(film, `"${ref.title}" (${ref.year}) is spelt almost the same as "${film.title}".`);
          }
        }
      }
    } else {
      const titles = [listing.title, ...listing.altTitles];
      for (const title of titles) {
        for (const [key, candidate] of titleCandidates(title)) {
          for (const film of byTitle.get(key) ?? []) {
            if (found.has(film)) continue;
            if (candidate.year != null && film.year != null) {
              if (!yearsCompatible(film.year, candidate.year)) continue;
            } else if (key.length < 5) {
              continue; // short title and no year to confirm it: too easy to be wrong
            }
            const yearNote = candidate.year != null ? "" : " The listing doesn't say which year.";
            found.set(film, `Listed as "${title}", which contains the title "${film.title}".${yearNote}`);
          }
        }
      }
    }
    for (const [film, reason] of found) matches.push({ film, listing, method: "fuzzy", reason });
  }
  return matches;
}

/** Exact first, then fuzzy on whatever's left. */
export function findMatches(watchlist, listings) {
  const [exact, leftover] = matchExact(watchlist, listings);
  return [...exact, ...matchFuzzy(watchlist, leftover)];
}

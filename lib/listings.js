// Turning Clusterflick's combined-data.json into listings.
//
// Clusterflick (https://clusterflick.com) scrapes ~480 London venues daily. Each "movie" in
// its data is either matched to TMDB (its id is the TMDB id) or left unmatched (talks,
// quizzes, oddly titled events). Events can also list the films they include.

const FORMAT_LABELS = {
  "3d": "3D", "4dx": "4DX", "imax": "IMAX", "screenx": "ScreenX",
  "dolby-cinema": "Dolby Cinema", "imax-70mm": "IMAX 70mm", "vhs": "VHS",
};
// Audio description is offered at almost every chain screening, so it's left out as noise.
const ACCESSIBILITY_LABELS = {
  subtitled: "Subtitled", hardOfHearing: "Captioned", relaxed: "Relaxed", babyFriendly: "Parent & baby",
};

/**
 * @typedef {{title: string, year: number|null, tmdbId: string|null, posterPath: string|null}} FilmRef
 * @typedef {{time: number, venueId: string, venueName: string, title: string, bookingUrl: string|null,
 *   screen: string|null, soldOut: boolean, notes: string|null, tags: string[]}} Screening
 * @typedef {{id: string, key: string, title: string, films: FilmRef[], screenings: Screening[],
 *   altTitles: string[]}} Listing
 */

/**
 * Upcoming listings at the given venues (every venue if venueIds is null).
 * @returns {Listing[]}
 */
export function extractListings(dataset, venueIds, startMs) {
  const listings = [];
  for (const movie of Object.values(dataset.movies)) {
    const showings = movie.showings ?? {};
    const screenings = [];
    for (const perf of movie.performances ?? []) {
      const showing = showings[perf.showingId];
      if (!showing) continue;
      const venueId = showing.venueId;
      if (venueIds && !venueIds.has(venueId)) continue;
      if (perf.time < startMs) continue;
      screenings.push({
        time: perf.time,
        venueId,
        venueName: dataset.venues[venueId]?.name ?? venueId,
        title: showing.title || movie.title,
        bookingUrl: perf.bookingUrl || showing.url || null,
        screen: perf.screen ?? null,
        soldOut: Boolean(perf.status?.soldOut),
        notes: perf.notes ?? null,
        tags: tagsFor(perf),
      });
    }
    if (!screenings.length) continue;
    screenings.sort((a, b) => a.time - b.time);

    const films = movie.isUnmatched ? [] : [filmRef(movie)];
    for (const included of movie.includedMovies ?? []) films.push(filmRef(included));

    const altTitles = [];
    for (const s of screenings) {
      if (s.title !== movie.title && !altTitles.includes(s.title)) altTitles.push(s.title);
    }
    listings.push({ id: movie.id, key: `${movie.id}|${movie.title}`, title: movie.title, films, screenings, altTitles });
  }
  return listings;
}

function filmRef(movie) {
  const year = parseInt(movie.year, 10);
  return {
    title: movie.title ?? "",
    year: Number.isNaN(year) ? null : year,
    tmdbId: movie.id ?? null,
    posterPath: movie.posterPath ?? null,
  };
}

function tagsFor(perf) {
  const tags = [];
  const format = perf.format ?? {};
  for (const key of ["source", "presentation", "dimension"]) {
    const value = format[key];
    if (value && value !== "2d") tags.push(FORMAT_LABELS[value] ?? value);
  }
  const access = perf.accessibility ?? {};
  for (const [key, label] of Object.entries(ACCESSIBILITY_LABELS)) if (access[key]) tags.push(label);
  return tags;
}

/** Venues that have at least one upcoming screening: [{id, name}] sorted by name. */
export function venuesWithListings(dataset, listings) {
  const ids = new Set();
  for (const listing of listings) for (const s of listing.screenings) ids.add(s.venueId);
  return [...ids]
    .map((id) => ({ id, name: dataset.venues[id]?.name ?? id }))
    .sort((a, b) => a.name.localeCompare(b.name, "en"));
}

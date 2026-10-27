// Reading a Letterboxd watchlist from the page the user is on.

/**
 * Runs inside the Letterboxd tab (injected with chrome.scripting.executeScript, so it must
 * be self-contained). Fetching from there means requests look exactly like the user browsing:
 * same cookies, so private watchlists work too, and no bot checks.
 */
export async function fetchWatchlistPage(user, page) {
  const res = await fetch(`/${encodeURIComponent(user)}/watchlist/page/${page}/`, { credentials: "same-origin" });
  if (!res.ok) return { error: `Letterboxd answered ${res.status}` };
  const doc = new DOMParser().parseFromString(await res.text(), "text/html");
  const items = [...doc.querySelectorAll("[data-item-name][data-item-link]")].map((el) => ({
    name: el.getAttribute("data-item-name"),
    link: el.getAttribute("data-item-link"),
  }));
  const pageNumbers = [...doc.querySelectorAll(".paginate-page a")].map((a) => parseInt(a.textContent, 10));
  return { items, lastPage: Math.max(1, ...pageNumbers.filter(Number.isFinite)) };
}

/** Which user's watchlist a Letterboxd URL points at, or null. */
export function watchlistUserFromUrl(url) {
  const m = /^https:\/\/letterboxd\.com\/([^/]+)\/watchlist(?:\/|$)/.exec(url ?? "");
  return m ? decodeURIComponent(m[1]) : null;
}

/** "The History of Concrete (2026)" -> { title, year }. */
export function parseDisplayName(name) {
  const m = /^(.*?)\s+\((\d{4})\)$/.exec(name.trim());
  return m ? { title: m[1], year: Number(m[2]) } : { title: name.trim(), year: null };
}

export function toFilm({ name, link }) {
  return { ...parseDisplayName(name), url: `https://letterboxd.com${link}` };
}

/**
 * Reads every page of the watchlist via `fetchPage(page)`, a few at a time.
 * @param {(page: number) => Promise<{items?: object[], lastPage?: number, error?: string}>} fetchPage
 */
export async function readWatchlist(fetchPage, onProgress = () => {}, concurrency = 3) {
  const first = await fetchPage(1);
  if (first.error) throw new Error(first.error);
  const pages = new Map([[1, first.items]]);
  const lastPage = first.lastPage;
  onProgress(1, lastPage);

  let next = 2;
  const worker = async () => {
    while (next <= lastPage) {
      const page = next++;
      const result = await fetchPage(page);
      if (result.error) throw new Error(result.error);
      pages.set(page, result.items);
      onProgress(pages.size, lastPage);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, lastPage - 1) }, worker));

  const films = new Map();
  for (let p = 1; p <= lastPage; p++) {
    for (const item of pages.get(p) ?? []) if (!films.has(item.link)) films.set(item.link, toFilm(item));
  }
  return [...films.values()];
}

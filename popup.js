import { watchlistUserFromUrl } from "./lib/watchlist.js";

const content = document.getElementById("content");
const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
const user = watchlistUserFromUrl(tab?.url);
const { watchlist } = await chrome.storage.local.get("watchlist");

const openReport = async (query = "") => {
  await chrome.tabs.create({ url: chrome.runtime.getURL(`report.html${query}`) });
  window.close();
};

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

if (user) {
  content.append(
    el("p", {}, "Ready to read ", el("strong", {}, `${user}'s`), " watchlist."),
    el("button", { className: "primary", textContent: "Find screenings", onclick: () =>
      openReport(`?tab=${tab.id}&user=${encodeURIComponent(user)}`) }),
  );
} else {
  content.append(
    el("p", {}, "Open your ", el("strong", {}, "Letterboxd watchlist"), " (your profile, then Watchlist), then click this icon again."),
    el("a", { className: "button", href: "https://letterboxd.com/", target: "_blank", textContent: "Go to Letterboxd" }),
  );
}
if (watchlist?.films?.length) {
  const when = new Date(watchlist.savedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  content.append(el("button", { textContent: `Open last report (${watchlist.films.length} films, ${when})`, onclick: () => openReport() }));
}

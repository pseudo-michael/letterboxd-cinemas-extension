// Downloading Clusterflick's listings, and keeping a copy so most visits are instant.
// Browser-only: uses IndexedDB and chrome.storage, so it lives apart from the pure logic.

const RELEASE_API = "https://api.github.com/repos/clusterflick/data-combined/releases/latest";
const ASSET_NAME = "combined-data.json";
const DB_NAME = "clusterflick";
const STORE = "files";
const KEY = "combined-data";
const CHECK_EVERY_MS = 3 * 60 * 60 * 1000; // matches Clusterflick's update rhythm; GitHub's API allows 60 calls/hour

/**
 * @param {{refresh?: boolean, onProgress?: (loaded: number, total: number) => void}} options
 * @returns {Promise<{dataset: object, tag: string|null, warning: string|null}>}
 */
export async function loadDataset({ refresh = false, onProgress = () => {} } = {}) {
  const { datasetMeta = {} } = await chrome.storage.local.get("datasetMeta");
  const cached = await readSaved(); // a Blob, or null if nothing usable is saved
  const due = Date.now() - (datasetMeta.checkedAt ?? 0) > CHECK_EVERY_MS;

  let tag = datasetMeta.tag ?? null;
  let warning = null;
  let blob = cached;
  if (refresh || due || !cached) {
    try {
      const release = await getJson(RELEASE_API);
      const asset = release.assets?.find((a) => a.name === ASSET_NAME);
      if (!asset) throw new Error(`release ${release.tag_name} has no ${ASSET_NAME}`);
      if (refresh || !cached || release.tag_name !== datasetMeta.tag) {
        blob = await download(asset.browser_download_url, asset.size, onProgress);
        // Saving is a convenience: if it fails, this run still works and the next one downloads again.
        if (await save(blob)) await chrome.storage.local.set({ datasetMeta: { tag: release.tag_name, checkedAt: Date.now() } });
      } else {
        await chrome.storage.local.set({ datasetMeta: { tag: release.tag_name, checkedAt: Date.now() } });
      }
      tag = release.tag_name;
    } catch (e) {
      if (!cached) throw new Error(`Couldn't download the London listings (${e.message}). Check your connection and try again.`);
      warning = `Couldn't check for newer listings (${e.message}), so these are the ones saved earlier.`;
    }
  }
  return { dataset: JSON.parse(await blob.text()), tag, warning };
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readSaved() {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const get = db.transaction(STORE).objectStore(STORE).get(KEY);
      get.onsuccess = () => resolve(get.result instanceof Blob ? get.result : null);
      get.onerror = () => reject(get.error);
    });
  } catch {
    return null;
  }
}

async function save(blob) {
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(blob, KEY);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    return true;
  } catch {
    return false;
  }
}

async function getJson(url) {
  const res = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
  if (!res.ok) throw new Error(res.status === 403 ? "GitHub rate limit reached, try again in a while" : `GitHub answered ${res.status}`);
  return res.json();
}

async function download(url, expectedSize, onProgress) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed with ${res.status}`);
  const total = Number(res.headers.get("content-length")) || expectedSize || 0;
  const reader = res.body.getReader();
  const chunks = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress(loaded, total);
  }
  return new Blob(chunks);
}

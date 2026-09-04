// Storage adapter.
// Runs against the Claude artifact storage API when present, and plain
// localStorage everywhere else (which is what the deployed site uses).
const hasArtifactStorage = () =>
  typeof window !== "undefined" && window.storage && typeof window.storage.get === "function";

export async function loadJSON(key, fallback) {
  try {
    if (hasArtifactStorage()) {
      const res = await window.storage.get(key);
      return res && res.value ? JSON.parse(res.value) : fallback;
    }
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

export async function saveJSON(key, value) {
  try {
    const str = JSON.stringify(value);
    if (hasArtifactStorage()) {
      await window.storage.set(key, str);
      return true;
    }
    window.localStorage.setItem(key, str);
    return true;
  } catch (e) {
    return false;
  }
}

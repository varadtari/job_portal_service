// Firefox exposes the promise-based `browser` namespace; Chrome's `chrome` returns promises in MV3 too.
export const ext: typeof chrome = (globalThis as unknown as { browser?: typeof chrome }).browser ?? chrome;

/** The tab the user is looking at. On Firefox for Android the popup may itself count as the active tab. */
export async function activeWebTab(): Promise<chrome.tabs.Tab | undefined> {
  const active = await ext.tabs.query({ active: true, currentWindow: true });
  const web = active.find((t) => t.url && /^https?:/.test(t.url));
  if (web) return web;
  const all = await ext.tabs.query({});
  return all.filter((t) => t.url && /^https?:/.test(t.url)).sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))[0] ?? active[0];
}

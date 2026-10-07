import { ext } from "./ext";
import { type ApiRequest, type ApiResponse, type FillReport, getSettings, type LearnResult } from "./shared";

// All API calls go through here: the token never touches the job site's page.
async function api(req: ApiRequest): Promise<ApiResponse> {
  const { server, token } = await getSettings();
  if (!token) return { ok: false, status: 0, error: "Add your JobPilot token in the extension popup." };
  try {
    const res = await fetch(`${server}${req.path}`, {
      method: req.method,
      headers: { Authorization: `Bearer ${token}`, ...(req.body ? { "Content-Type": "application/json" } : {}) },
      body: req.body ? JSON.stringify(req.body) : undefined,
    });
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => (headers[k] = v));
    if (req.binary && res.ok) {
      const buf = new Uint8Array(await res.arrayBuffer());
      let bin = "";
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      return { ok: true, status: res.status, base64: btoa(bin), headers };
    }
    const data = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, data, headers, error: res.ok ? undefined : (data as { error?: string })?.error ?? `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, status: 0, error: `Can't reach ${server}: ${(e as Error).message}` };
  }
}

/** Injects the content script into every frame we may access, then runs autofill in each. */
export async function autofillTab(tabId: number): Promise<FillReport[]> {
  // Page-world helper first (custom dropdowns), then the isolated content script
  await ext.scripting.executeScript({ target: { tabId, allFrames: true }, files: ["main.js"], world: "MAIN" }).catch(() => undefined);
  await ext.scripting.executeScript({ target: { tabId, allFrames: true }, files: ["content.js"] }).catch(() => undefined);
  const queue = await getQueue();
  const tabJob = queue?.tabId === tabId ? null : await getTabJob(tabId);
  if (tabJob) await pageCall(tabId, "setQueueContext", [{ jobId: tabJob.jobId, itemId: "", index: 0, total: 0, title: "", company: "" }]);
  const results = await ext.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: () => (window as unknown as { __jobpilot?: { autofill: () => Promise<unknown> } }).__jobpilot?.autofill() ?? null,
  });
  const all = results.map((r) => r.result as FillReport | null).filter((r): r is FillReport => !!r);
  // Keep the top frame's "challenge"/"none" report so the popup and queue bar can explain what's going on
  const withFields = all.filter((r) => r.fields > 0);
  const challenge = all.find((r) => r.page === "challenge");
  const reports = withFields.length ? withFields : challenge ? [challenge] : all.slice(0, 1);
  await ext.storage.session.set({ [`report:${tabId}`]: { at: Date.now(), reports } });
  return reports;
}

type PageApi = { learn: (markApplied: boolean) => Promise<unknown>; answeredCount: () => number };

/**
 * Saves answers from every frame, but only the frame holding most of the answers logs the application
 * (an embedded form iframe on a company page, or the page itself), so one submission = one application.
 */
export async function saveAnswersTab(tabId: number): Promise<LearnResult | { error: string }> {
  const counts = await ext.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: () => (window as unknown as { __jobpilot?: PageApi }).__jobpilot?.answeredCount() ?? -1,
  });
  const ready = counts.filter((c) => typeof c.result === "number" && c.result >= 0);
  if (!ready.length) return { error: "Click “Autofill this page” first, so JobPilot can read the form." };
  const main = ready.reduce((a, b) => ((b.result as number) > (a.result as number) ? b : a));
  const results = await Promise.all(
    ready.map((c) =>
      ext.scripting
        .executeScript({
          target: { tabId, frameIds: [c.frameId] },
          func: (mark: boolean) => (window as unknown as { __jobpilot?: PageApi }).__jobpilot?.learn(mark) ?? null,
          args: [c.frameId === main.frameId],
        })
        .then((r) => r[0]?.result as LearnResult | { error: string } | null),
    ),
  );
  const primary = results[ready.indexOf(main)];
  if (!primary || "error" in primary) return primary ?? { error: "Failed to save" };
  const extra = results.flatMap((r) => (r && "learned" in r && r !== primary ? r.learned : []));
  return { ...primary, learned: [...primary.learned, ...extra] };
}

// ---------- Which job is this tab for? ----------
// "Open & apply" in JobPilot opens /go/<jobId>, which then forwards to the posting in the same tab.
// We remember that tab (and tabs it opens) → job, so the right tailored resume is attached anywhere.

type TabJob = { jobId: string };
const tabJobKey = (tabId: number) => `tabjob:${tabId}`;
export async function getTabJob(tabId: number): Promise<TabJob | null> {
  return ((await ext.storage.session.get(tabJobKey(tabId)))[tabJobKey(tabId)] as TabJob | undefined) ?? null;
}

ext.tabs.onUpdated.addListener(async (tabId, info) => {
  if (!info.url) return;
  const { server } = await getSettings();
  const m = info.url.startsWith(server) ? info.url.match(/\/go\/([0-9a-f-]{36})/) : null;
  if (m) await ext.storage.session.set({ [tabJobKey(tabId)]: { jobId: m[1] } satisfies TabJob });
});

ext.tabs.onCreated.addListener(async (tab) => {
  if (tab.openerTabId === undefined || tab.id === undefined) return;
  const parent = await getTabJob(tab.openerTabId);
  if (parent) await ext.storage.session.set({ [tabJobKey(tab.id)]: parent });
});

ext.tabs.onRemoved.addListener((tabId) => ext.storage.session.remove(tabJobKey(tabId)));

// ---------- Apply queue ----------

type QueueItem = { id: string; jobId: string; title: string; company: string; location: string | null; url: string };
type QueueState = { tabId: number; items: QueueItem[]; index: number; advancing?: boolean };
type QueuePage = {
  setQueueContext: (c: unknown) => void;
  showQueueBar: (c: unknown, r?: { filled: number; missing: number }) => void;
  queueMessage: (t: string, final?: boolean) => void;
};

const getQueue = async () => ((await ext.storage.session.get("queue")).queue as QueueState | undefined) ?? null;
const setQueue = (q: QueueState | null) => (q ? ext.storage.session.set({ queue: q }) : ext.storage.session.remove("queue"));

const ctxFor = (q: QueueState) => {
  const it = q.items[q.index];
  return { jobId: it.jobId, itemId: it.id, index: q.index, total: q.items.length, title: it.title, company: it.company };
};

/** Calls a named method of the content script's page API (no eval: method name + JSON-able args only). */
async function pageCall(tabId: number, method: keyof QueuePage, args: unknown[] = [], topOnly = false) {
  await ext.scripting
    .executeScript({
      target: topOnly ? { tabId, frameIds: [0] } : { tabId, allFrames: true },
      func: (m: string, a: unknown[]) => {
        const p = (window as unknown as { __jobpilot?: Record<string, (...x: unknown[]) => unknown> }).__jobpilot;
        p?.[m]?.(...a);
      },
      args: [method, args],
    })
    .catch(() => undefined);
}

export async function startQueue(tabId?: number): Promise<{ total?: number; error?: string }> {
  const res = await api({ type: "api", method: "GET", path: "/api/ext/queue" });
  if (!res.ok) return { error: res.error ?? "Couldn't load the queue" };
  const items = ((res.data as { items: QueueItem[] }).items ?? []).filter((i) => i.url);
  if (!items.length) return { error: "Your apply queue is empty. Add jobs on the Jobs page." };
  const tab = tabId !== undefined ? await ext.tabs.update(tabId, { url: items[0].url }) : await ext.tabs.create({ url: items[0].url });
  await setQueue({ tabId: tab!.id!, items, index: 0 });
  await api({ type: "api", method: "POST", path: `/api/ext/queue/${items[0].id}`, body: { action: "active" } });
  return { total: items.length };
}

/** Called on every page load in the queue tab: inject, set context, autofill, show the bar. */
async function runQueuePage(tabId: number) {
  const q = await getQueue();
  if (!q || q.tabId !== tabId || q.advancing) return;
  await ext.scripting.executeScript({ target: { tabId, allFrames: true }, files: ["main.js"], world: "MAIN" }).catch(() => undefined);
  await ext.scripting.executeScript({ target: { tabId, allFrames: true }, files: ["content.js"] }).catch(() => undefined);
  const ctx = ctxFor(q);
  await pageCall(tabId, "setQueueContext", [ctx]);
  await pageCall(tabId, "showQueueBar", [ctx], true);
  const reports = await autofillTab(tabId).catch(() => []);
  const filled = reports.reduce((n, r) => n + r.filled, 0);
  const missing = reports.reduce((n, r) => n + r.missingRequired, 0);
  const page = reports.some((r) => r.page === "challenge") ? "challenge" : filled > 0 || reports.some((r) => r.page === "form") ? "form" : "none";
  await pageCall(tabId, "showQueueBar", [ctx, { filled, missing, page }], true);
  // Bot checks usually pass without a reload (Turnstile): look again shortly
  if (page === "challenge") setTimeout(() => runQueuePage(tabId), 6000);
}

/** Finish the current item ("done" or "skip") and open the next one. */
async function advance(outcome: "done" | "skip") {
  const q = await getQueue();
  if (!q || q.advancing) return;
  await setQueue({ ...q, advancing: true });
  const item = q.items[q.index];
  if (outcome === "done") {
    // Logs the application against this exact job (and saves any new answers)
    await saveAnswersTab(q.tabId).catch(() => undefined);
  }
  await api({ type: "api", method: "POST", path: `/api/ext/queue/${item.id}`, body: { action: outcome } });
  const next = q.index + 1;
  if (next >= q.items.length) {
    await pageCall(q.tabId, "queueMessage", [`🎉 Queue finished: ${q.items.length} job(s). Track them in JobPilot → Applications.`, true], true);
    await setQueue(null);
    return;
  }
  await pageCall(q.tabId, "queueMessage", [outcome === "done" ? "✓ Marked applied. Opening the next job…" : "Skipped. Opening the next job…"], true);
  await setQueue({ ...q, index: next, advancing: false });
  await api({ type: "api", method: "POST", path: `/api/ext/queue/${q.items[next].id}`, body: { action: "active" } });
  await ext.tabs.update(q.tabId, { url: q.items[next].url });
}

export async function stopQueue() {
  const q = await getQueue();
  if (q) {
    await api({ type: "api", method: "POST", path: `/api/ext/queue/${q.items[q.index].id}`, body: { action: "requeue" } });
    await pageCall(q.tabId, "queueMessage", ["Queue stopped. Resume any time from the extension.", true], true);
  }
  await setQueue(null);
}

ext.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === "complete") runQueuePage(tabId);
});
// "Apply" often opens the real application form in a new tab: the queue follows it there
ext.tabs.onCreated.addListener(async (tab) => {
  const q = await getQueue();
  if (q && tab.openerTabId === q.tabId && tab.id !== undefined) await setQueue({ ...q, tabId: tab.id });
});

ext.tabs.onRemoved.addListener(async (tabId) => {
  const q = await getQueue();
  if (q?.tabId === tabId) await setQueue(null);
});

ext.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "tab:job" && typeof msg.tabId === "number") {
    (async () => {
      const q = await getQueue();
      const jobId = q && q.tabId === msg.tabId ? q.items[q.index]?.jobId : (await getTabJob(msg.tabId))?.jobId;
      if (!jobId) return sendResponse(null);
      const res = await api({ type: "api", method: "GET", path: `/api/ext/job/${jobId}` });
      sendResponse(res.ok ? res.data : null);
    })();
    return true;
  }
  if (msg?.type === "queue:start") {
    startQueue(msg.tabId).then(sendResponse);
    return true;
  }
  if (msg?.type === "queue:status") {
    getQueue().then((q) => sendResponse(q ? { running: true, index: q.index, total: q.items.length } : { running: false }));
    return true;
  }
  if (msg?.type === "queue:stop") {
    stopQueue().then(() => sendResponse({ ok: true }));
    return true;
  }
  if ((msg?.type === "queue:next" || msg?.type === "queue:skip") && sender.tab?.id !== undefined) {
    advance(msg.type === "queue:next" ? "done" : "skip");
    return false;
  }
  if (msg?.type === "api") {
    api(msg as ApiRequest).then(sendResponse);
    return true;
  }
  if (msg?.type === "autofill" && typeof msg.tabId === "number") {
    autofillTab(msg.tabId).then(sendResponse, (e) => sendResponse({ error: String(e?.message ?? e) }));
    return true;
  }
  if (msg?.type === "saveAnswers" && typeof msg.tabId === "number") {
    saveAnswersTab(msg.tabId).then(sendResponse, (e) => sendResponse({ error: String(e?.message ?? e) }));
    return true;
  }
  if (msg?.type === "learned" && sender.tab?.id !== undefined) {
    // Submit detected in a page: remember the outcome for the popup
    const tabId = sender.tab.id;
    ext.storage.session.set({ [`learn:${tabId}`]: { at: Date.now(), result: msg.result } });
    // In queue mode, a detected submit finishes this job (the learn call already logged it)
    getQueue().then(async (q) => {
      if (q?.tabId !== tabId || q.advancing) return;
      const item = q.items[q.index];
      await setQueue({ ...q, advancing: true });
      await api({ type: "api", method: "POST", path: `/api/ext/queue/${item.id}`, body: { action: "done" } });
      const next = q.index + 1;
      if (next >= q.items.length) {
        await setQueue(null);
        return;
      }
      await setQueue({ ...q, index: next, advancing: false });
      setTimeout(() => ext.tabs.update(tabId, { url: q.items[next].url }), 2500); // let the site finish its submit
    });
  }
  return false;
});

// Keyboard shortcuts don't exist on Firefox for Android: guard, or the whole background script would fail
ext.commands?.onCommand.addListener(async (command, tab) => {
  if (command === "autofill" && tab?.id !== undefined) await autofillTab(tab.id);
});

// Expose for automated tests (service worker global)
(globalThis as unknown as Record<string, unknown>).jobpilot = { autofillTab, saveAnswersTab, api, startQueue, stopQueue, getQueue };

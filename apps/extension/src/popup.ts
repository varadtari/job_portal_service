import { activeWebTab, ext } from "./ext";
import { type ApiResponse, DEFAULT_SERVER, type FillReport, getSettings, type LearnResult } from "./shared";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const activeTab = async () => (await activeWebTab())!;

type Part = { text: string; cls?: "ok" | "warn" | "err" | "muted"; bold?: boolean };

/** Renders result lines with DOM APIs (no innerHTML). */
function show(parts: Part[]) {
  const el = $("result");
  el.hidden = false;
  el.replaceChildren(
    ...parts.map((p) => {
      const n = document.createElement(p.bold ? "b" : "span");
      n.textContent = p.text;
      if (p.cls) n.className = p.cls;
      return n;
    }),
  );
}

function renderFill(reports: FillReport[] | { error: string }) {
  if ("error" in reports) return show([{ text: reports.error, cls: "err" }]);
  if (reports.some((r) => r.page === "challenge"))
    return show([{ text: "This page is a security check (“Verify you are human”).", cls: "warn", bold: true }, { text: "Complete it, then click Autofill again once the job or form appears." }]);
  if (!reports.length || reports.every((r) => r.fields === 0))
    return show([{ text: "No application form on this page.", cls: "warn", bold: true }, { text: "If this is a job description, click the site's Apply button first, then Autofill on the form." }]);
  const err = reports.find((r) => r.error);
  if (err) return show([{ text: err.error!, cls: "err" }]);
  const sum = (k: "fields" | "filled" | "learned" | "missingRequired") => reports.reduce((n, r) => n + r[k], 0);
  const resume = reports.find((r) => r.resume === "attached") ? "attached" : reports.find((r) => r.resume === "failed") ? "failed" : "none";
  const parts: Part[] = [{ text: `Filled ${sum("filled")} of ${sum("fields")} fields`, cls: "ok", bold: true }];
  if (sum("learned")) parts.push({ text: `${sum("learned")} from saved answers (blue). Check they fit.` });
  if (sum("missingRequired")) parts.push({ text: `${sum("missingRequired")} required field(s) need you (yellow)`, cls: "warn" });
  parts.push({ text: `Resume: ${resume === "attached" ? "attached ✓" : resume === "failed" ? "couldn't attach. Upload it manually." : "no upload field found"}`, cls: "muted" });
  show(parts);
}

function renderLearn(r: LearnResult | { error: string }) {
  if ("error" in r) return show([{ text: r.error, cls: "err" }]);
  const parts: Part[] = [];
  if (r.application) parts.push({ text: `${r.application.isNew ? "Marked applied" : "Already tracked"}: ${r.application.title} · ${r.application.company}`, cls: "ok", bold: true });
  parts.push({ text: r.learned.length ? `Saved ${r.learned.length} new answer(s) to your profile` : "No new answers to save" });
  show(parts);
}

async function init() {
  const s = await getSettings();
  $<HTMLAnchorElement>("settingsLink").href = `${s.server}/settings`;
  $<HTMLInputElement>("server").value = s.server;
  if (!s.token) {
    $("setup").hidden = false;
    return;
  }
  const me = (await ext.runtime.sendMessage({ type: "api", method: "GET", path: "/api/ext/me" })) as ApiResponse;
  if (!me.ok) {
    $("setup").hidden = false;
    $("setupMsg").textContent = me.error ?? "Couldn't connect.";
    return;
  }
  $("who").textContent = (me.data as { email: string }).email;
  $("ready").hidden = false;
  await renderQueue();
  await renderTabJob(s.server);
  const tab = await activeTab();
  const last = await ext.storage.session.get([`learn:${tab.id}`, `report:${tab.id}`]);
  const learned = last[`learn:${tab.id}`] as { result: LearnResult } | undefined;
  const report = last[`report:${tab.id}`] as { reports: FillReport[] } | undefined;
  if (learned) renderLearn(learned.result);
  else if (report) renderFill(report.reports);
}

$("saveSettings").addEventListener("click", async () => {
  const token = $<HTMLInputElement>("token").value.trim();
  const server = ($<HTMLInputElement>("server").value.trim() || DEFAULT_SERVER).replace(/\/$/, "");
  if (!/^jp_[A-Za-z0-9_-]{20,}$/.test(token)) {
    $("setupMsg").textContent = "That doesn't look like a JobPilot token (starts with jp_).";
    return;
  }
  await ext.storage.local.set({ token, server });
  $("setup").hidden = true;
  $("setupMsg").textContent = "";
  await /** Shows which job this tab is for and which resume Autofill will attach. */
async function renderTabJob(server: string) {
  const tab = await activeTab().catch(() => undefined);
  if (tab?.id === undefined) return;
  const job = (await ext.runtime.sendMessage({ type: "tab:job", tabId: tab.id })) as { title: string; company: string; tailored: { id: string; scoreAfter: number | null } | null } | null;
  if (!job) return;
  $("tabJob").hidden = false;
  $("tabJobTitle").textContent = `${job.company} – ${job.title}`;
  const resume = $("tabJobResume");
  if (job.tailored) {
    resume.textContent = `Resume: tailored ✓${job.tailored.scoreAfter != null ? ` (${job.tailored.scoreAfter}% match)` : ""}`;
    resume.className = "ok";
    const btn = $<HTMLButtonElement>("tabJobPdf");
    btn.hidden = false;
    btn.onclick = () => ext.tabs.create({ url: `${server}/api/resumes/${job.tailored!.id}/export?format=pdf` });
  } else {
    resume.textContent = "Resume: master (tailor it in JobPilot for a better match)";
    resume.className = "muted";
  }
}

async function renderQueue() {
  const status = (await ext.runtime.sendMessage({ type: "queue:status" })) as { running: boolean; index?: number; total?: number };
  const info = $("queueInfo");
  if (status.running) {
    info.textContent = `Running: job ${status.index! + 1} of ${status.total}. Use the bar at the bottom of the page.`;
    $("queueStart").hidden = true;
    $("queueStop").hidden = false;
    return;
  }
  const res = (await ext.runtime.sendMessage({ type: "api", method: "GET", path: "/api/ext/queue" })) as ApiResponse;
  const n = res.ok ? ((res.data as { items: unknown[] }).items ?? []).length : 0;
  info.textContent = n ? `${n} job(s) waiting. Opens each one, fills it in and attaches its resume; you press Submit.` : "Empty. Add jobs from JobPilot → Jobs (Tailor & queue).";
  $("queueStart").hidden = n === 0;
  $<HTMLButtonElement>("queueStart").textContent = `Start apply queue (${n})`;
  $("queueStop").hidden = true;
}

$("queueStart").addEventListener("click", async () => {
  const btn = $<HTMLButtonElement>("queueStart");
  btn.disabled = true;
  // Job sites vary (Indeed, company career pages, …): ask once for access to fill forms on any site.
  // Must run inside this click (a user gesture). Declining still works, with manual Autofill instead.
  const all = { origins: ["<all_urls>"] };
  if (!(await ext.permissions.contains(all).catch(() => false))) await ext.permissions.request(all).catch(() => false);
  const tab = await activeTab().catch(() => undefined);
  const r = (await ext.runtime.sendMessage({ type: "queue:start", tabId: tab?.id })) as { total?: number; error?: string };
  btn.disabled = false;
  if (r.error) $("queueInfo").textContent = r.error;
  else window.close();
});

$("queueStop").addEventListener("click", async () => {
  await ext.runtime.sendMessage({ type: "queue:stop" });
  await renderQueue();
});

init();
});

$("disconnect").addEventListener("click", async (e) => {
  e.preventDefault();
  await ext.storage.local.remove("token");
  location.reload();
});

$("autofill").addEventListener("click", async () => {
  const btn = $<HTMLButtonElement>("autofill");
  btn.disabled = true;
  btn.textContent = "Filling…";
  const tab = await activeTab();
  renderFill(await ext.runtime.sendMessage({ type: "autofill", tabId: tab.id }));
  btn.disabled = false;
  btn.textContent = "Autofill this page";
});

$("saveAnswers").addEventListener("click", async () => {
  const btn = $<HTMLButtonElement>("saveAnswers");
  btn.disabled = true;
  const tab = await activeTab();
  renderLearn(await ext.runtime.sendMessage({ type: "saveAnswers", tabId: tab.id }));
  btn.disabled = false;
});

/** Shows which job this tab is for and which resume Autofill will attach. */
async function renderTabJob(server: string) {
  const tab = await activeTab().catch(() => undefined);
  if (tab?.id === undefined) return;
  const job = (await ext.runtime.sendMessage({ type: "tab:job", tabId: tab.id })) as { title: string; company: string; tailored: { id: string; scoreAfter: number | null } | null } | null;
  if (!job) return;
  $("tabJob").hidden = false;
  $("tabJobTitle").textContent = `${job.company} – ${job.title}`;
  const resume = $("tabJobResume");
  if (job.tailored) {
    resume.textContent = `Resume: tailored ✓${job.tailored.scoreAfter != null ? ` (${job.tailored.scoreAfter}% match)` : ""}`;
    resume.className = "ok";
    const btn = $<HTMLButtonElement>("tabJobPdf");
    btn.hidden = false;
    btn.onclick = () => ext.tabs.create({ url: `${server}/api/resumes/${job.tailored!.id}/export?format=pdf` });
  } else {
    resume.textContent = "Resume: master (tailor it in JobPilot for a better match)";
    resume.className = "muted";
  }
}

async function renderQueue() {
  const status = (await ext.runtime.sendMessage({ type: "queue:status" })) as { running: boolean; index?: number; total?: number };
  const info = $("queueInfo");
  if (status.running) {
    info.textContent = `Running: job ${status.index! + 1} of ${status.total}. Use the bar at the bottom of the page.`;
    $("queueStart").hidden = true;
    $("queueStop").hidden = false;
    return;
  }
  const res = (await ext.runtime.sendMessage({ type: "api", method: "GET", path: "/api/ext/queue" })) as ApiResponse;
  const n = res.ok ? ((res.data as { items: unknown[] }).items ?? []).length : 0;
  info.textContent = n ? `${n} job(s) waiting. Opens each one, fills it in and attaches its resume; you press Submit.` : "Empty. Add jobs from JobPilot → Jobs (Tailor & queue).";
  $("queueStart").hidden = n === 0;
  $<HTMLButtonElement>("queueStart").textContent = `Start apply queue (${n})`;
  $("queueStop").hidden = true;
}

$("queueStart").addEventListener("click", async () => {
  const btn = $<HTMLButtonElement>("queueStart");
  btn.disabled = true;
  // Job sites vary (Indeed, company career pages, …): ask once for access to fill forms on any site.
  // Must run inside this click (a user gesture). Declining still works, with manual Autofill instead.
  const all = { origins: ["<all_urls>"] };
  if (!(await ext.permissions.contains(all).catch(() => false))) await ext.permissions.request(all).catch(() => false);
  const tab = await activeTab().catch(() => undefined);
  const r = (await ext.runtime.sendMessage({ type: "queue:start", tabId: tab?.id })) as { total?: number; error?: string };
  btn.disabled = false;
  if (r.error) $("queueInfo").textContent = r.error;
  else window.close();
});

$("queueStop").addEventListener("click", async () => {
  await ext.runtime.sendMessage({ type: "queue:stop" });
  await renderQueue();
});

init();

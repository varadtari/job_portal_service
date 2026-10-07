import { ext } from "./ext";
import { pickIndex } from "./pick";
import type { ApiResponse, FieldDescriptor, FieldMatch, FillReport, LearnResult } from "./shared";

// Injected on demand (popup click / shortcut) into each frame. Guarded against double injection.

type Control = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
type QueueCtx = { jobId: string; itemId: string; index: number; total: number; title: string; company: string };
type Tracked = { desc: FieldDescriptor; els: Control[] };

const COLORS = { filled: "#16a34a", learned: "#2563eb", missing: "#d97706" };
const W = window as unknown as { __jobpilot?: unknown };

if (!W.__jobpilot) {
  let tracked = new Map<string, Tracked>();
  let learnedSent = false;

  const api = (path: string, method: "GET" | "POST", body?: unknown, binary = false) =>
    ext.runtime.sendMessage({ type: "api", path, method, body, binary }) as Promise<ApiResponse>;

  const clean = (s: string | null | undefined) =>
    (s ?? "").replace(/\s+/g, " ").replace(/\s*\*\s*$/, "").trim().slice(0, 300);

  const visible = (el: Element) => {
    const r = (el as HTMLElement).getBoundingClientRect();
    const st = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && st.visibility !== "hidden" && st.display !== "none";
  };

  /** Text of an element without the text of form controls inside it. */
  function ownText(el: Element): string {
    const copy = el.cloneNode(true) as Element;
    copy.querySelectorAll("input,textarea,select,option,button,script,style,[aria-hidden=true]").forEach((n) => n.remove());
    return clean(copy.textContent);
  }

  function labelFor(el: Control): string {
    if ("labels" in el && el.labels?.length) {
      const t = ownText(el.labels[0]);
      if (t) return t;
    }
    const by = el.getAttribute("aria-labelledby");
    if (by) {
      const t = clean(by.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? "").join(" "));
      if (t) return t;
    }
    const aria = clean(el.getAttribute("aria-label"));
    if (aria) return aria;
    // Walk up a few levels looking for a label-ish element or short question text
    let node: Element | null = el.parentElement;
    for (let depth = 0; node && depth < 5; depth++, node = node.parentElement) {
      const labelish = node.querySelector(":scope > label, :scope > legend, :scope > .application-label, :scope > [class*='label' i], :scope > [data-automation-id*='label' i], :scope > [class*='question' i]");
      if (labelish && !labelish.contains(el)) {
        const t = ownText(labelish);
        if (t) return t;
      }
      const t = ownText(node);
      if (t && t.length <= 200 && node.querySelectorAll("input,textarea,select").length <= (el instanceof HTMLInputElement && el.type === "radio" ? 12 : 1)) return t;
    }
    return clean((el as HTMLInputElement).placeholder) || clean(el.name);
  }

  function radioGroupLabel(radios: HTMLInputElement[]): string {
    const fieldset = radios[0].closest("fieldset");
    const legend = fieldset?.querySelector("legend");
    if (legend) return ownText(legend);
    // Nearest ancestor containing all radios: its text minus the option labels
    let node: Element | null = radios[0].parentElement;
    while (node && !radios.every((r) => node!.contains(r))) node = node.parentElement;
    for (let depth = 0; node && depth < 4; depth++, node = node.parentElement) {
      const copy = node.cloneNode(true) as Element;
      copy.querySelectorAll("label, input, [role=radio]").forEach((n) => n.remove());
      const t = clean(copy.textContent);
      if (t) return t;
    }
    return clean(radios[0].name);
  }

  // Searchable custom dropdowns (react-select on Greenhouse, Workday prompts, etc.)
  const isCombobox = (el: Element) =>
    el instanceof HTMLInputElement &&
    (el.getAttribute("role") === "combobox" || el.getAttribute("aria-autocomplete") === "list" || /select__input|react-select/.test(el.className + " " + el.id));

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  /** Options belonging to this combobox only (pages often keep other option lists in the DOM). */
  function optionsFor(el: HTMLInputElement): HTMLElement[] {
    const sel = "[role=option], [class*='select__option']";
    const ok = (o: HTMLElement) => visible(o) && o.getAttribute("aria-disabled") !== "true";
    const controlled = el.getAttribute("aria-controls") || el.getAttribute("aria-owns");
    const listbox = controlled ? document.getElementById(controlled) : null;
    if (listbox) return [...listbox.querySelectorAll<HTMLElement>(sel)].filter(ok);
    const root = el.closest<HTMLElement>("[class*='select__container'], [class*='-container']") ?? el.closest<HTMLElement>("[class*='control' i]")?.parentElement;
    return root ? [...root.querySelectorAll<HTMLElement>(sel)].filter(ok) : [];
  }

  function comboValue(el: HTMLInputElement): string {
    // react-select renders the chosen option next to the input
    let node: Element | null = el;
    for (let i = 0; node && i < 5; i++, node = node.parentElement) {
      const single = node.querySelector("[class*='single-value' i], [class*='singleValue']");
      if (single) return clean(single.textContent);
    }
    return el.value ?? "";
  }

  /** Asks the page-world helper (main.ts) to select via the component itself. */
  function selectInPage(el: HTMLInputElement, value: string): Promise<boolean> {
    const id = (el.dataset.jpId ||= Math.random().toString(36).slice(2));
    const req = Math.random().toString(36).slice(2);
    return new Promise((resolve) => {
      const done = (e: Event) => {
        const r = JSON.parse((e as CustomEvent<string>).detail) as { req: string; ok: boolean };
        if (r.req !== req) return;
        document.removeEventListener("jobpilot:select:done", done);
        resolve(r.ok);
      };
      document.addEventListener("jobpilot:select:done", done);
      document.dispatchEvent(new CustomEvent("jobpilot:select", { detail: JSON.stringify({ req, id, value }) }));
      setTimeout(() => {
        document.removeEventListener("jobpilot:select:done", done);
        resolve(false);
      }, 1000);
    });
  }

  async function fillCombobox(el: HTMLInputElement, value: string): Promise<boolean> {
    if (comboValue(el).trim()) return false; // already answered
    if (await selectInPage(el, value)) {
      await sleep(80);
      if (comboValue(el).trim()) return true;
    }
    el.focus();
    // react-select opens on mousedown on its control box, not the input itself
    const control = el.closest<HTMLElement>("[class*='control' i]") ?? el;
    control.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
    const tryPick = async (): Promise<boolean> => {
      for (let i = 0; i < 15; i++) {
        await sleep(100);
        const opts = optionsFor(el);
        if (!opts.length) continue;
        const idx = pickIndex(value, opts.map((o) => clean(o.textContent)));
        if (idx < 0) return false;
        const o = opts[idx];
        o.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        o.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
        o.click();
        return true;
      }
      return false;
    };
    // First with the full list open, then filtered by typing the value
    let ok = await tryPick();
    if (!ok) {
      setValue(el, value);
      ok = await tryPick();
    }
    if (!ok) setValue(el, "");
    el.blur();
    await sleep(50);
    return ok && !!comboValue(el).trim();
  }

  const optionLabel = (r: HTMLInputElement) => clean(r.labels?.[0]?.textContent) || clean(r.value);

  function collect(): Tracked[] {
    const out: Tracked[] = [];
    const radios = new Map<string, HTMLInputElement[]>();
    let n = 0;
    const els = document.querySelectorAll<Control>("input, textarea, select");
    for (const el of els) {
      if (el.disabled || (el as HTMLInputElement).readOnly) continue;
      const type = el instanceof HTMLSelectElement ? "select" : el instanceof HTMLTextAreaElement ? "textarea" : isCombobox(el) ? "combobox" : (el.type || "text").toLowerCase();
      if (["hidden", "submit", "button", "image", "reset", "password", "file", "search", "range", "color"].includes(type)) continue;
      if (type === "radio") {
        const key = (el as HTMLInputElement).name || `__r${n++}`;
        radios.set(key, [...(radios.get(key) ?? []), el as HTMLInputElement]);
        continue;
      }
      if (!visible(el)) continue;
      const id = `jp${n++}`;
      out.push({
        els: [el],
        desc: {
          id,
          label: labelFor(el),
          name: el.name || el.id || undefined,
          placeholder: (el as HTMLInputElement).placeholder || undefined,
          autocomplete: el.getAttribute("autocomplete") || undefined,
          type,
          options: el instanceof HTMLSelectElement ? [...el.options].map((o) => clean(o.textContent)) : undefined,
          required: el.required || el.getAttribute("aria-required") === "true",
        },
      });
    }
    for (const group of radios.values()) {
      if (!group.some(visible) && !group.some((r) => r.labels?.[0] && visible(r.labels[0]))) continue;
      out.push({
        els: group,
        desc: { id: `jp${n++}`, label: radioGroupLabel(group), name: group[0].name || undefined, type: "radio", options: group.map(optionLabel), required: group.some((r) => r.required) },
      });
    }
    return out;
  }

  // React/Vue track input values through the prototype setter; setting .value directly is ignored.
  function setValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  function mark(el: HTMLElement, color: string, title: string) {
    el.style.outline = `2px solid ${color}`;
    el.style.outlineOffset = "1px";
    el.title = title;
    el.addEventListener("input", () => (el.style.outline = ""), { once: true });
  }

  async function fill(t: Tracked, m: FieldMatch): Promise<boolean> {
    if (!m.value) return false;
    const el = t.els[0];
    const color = m.source === "learned" ? COLORS.learned : COLORS.filled;
    const note = m.source === "learned" ? "JobPilot: from a saved answer. Check it fits this company." : "JobPilot: filled from your profile";
    if (t.desc.type === "combobox") {
      const ok = await fillCombobox(el as HTMLInputElement, m.value);
      if (ok) mark((el.closest("[class*='container' i], [class*='control' i]") as HTMLElement) ?? el, color, note);
      return ok;
    }
    if (t.desc.type === "radio") {
      if (t.els.some((r) => (r as HTMLInputElement).checked)) return false;
      const target = (t.els as HTMLInputElement[]).find((r) => optionLabel(r) === m.value);
      if (!target) return false;
      target.click();
      mark((target.labels?.[0] as HTMLElement) ?? target, color, note);
      return true;
    }
    if (el instanceof HTMLSelectElement) {
      if (el.selectedIndex > 0 && el.value) return false;
      const opt = [...el.options].find((o) => clean(o.textContent) === m.value);
      if (!opt) return false;
      el.value = opt.value;
      el.dispatchEvent(new Event("change", { bubbles: true }));
      mark(el, color, note);
      return true;
    }
    if ((el as HTMLInputElement).value?.trim()) return false; // never overwrite what's there
    setValue(el as HTMLInputElement, m.value);
    mark(el, color, note);
    return true;
  }

  async function attachResume(): Promise<FillReport["resume"]> {
    const all = [...document.querySelectorAll<HTMLInputElement>("input[type=file]")].filter((i) => !(i.files && i.files.length) && !i.disabled);
    const own = (i: HTMLInputElement) => `${labelFor(i)} ${i.name} ${i.id} ${i.getAttribute("aria-label") ?? ""}`.toLowerCase();
    // Upload pickers often hide the input inside a labelled card/button ("Upload a resume")
    const near = (i: HTMLInputElement) =>
      (i.closest("label, [role=button], [class*='upload' i], [class*='resume' i], [data-testid*='resume' i], section, div")?.textContent ?? "").slice(0, 200).toLowerCase();
    const notOther = (i: HTMLInputElement) => !/cover|photo|avatar|picture|transcript|portfolio/.test(own(i)) && !/^image\//.test(i.accept);
    let inputs = all.filter((i) => notOther(i) && /resume|cv\b|curriculum/.test(`${own(i)} ${i.accept} ${near(i)}`));
    // A single document-type upload on the page is almost certainly the resume
    if (!inputs.length) {
      const docs = all.filter((i) => notOther(i) && /pdf|doc|application\//.test(i.accept.toLowerCase()));
      if (docs.length === 1) inputs = docs;
    }
    // Prefer inputs whose own label says resume over ones matched only by surrounding text
    inputs.sort((a, b) => Number(/resume|cv\b/.test(own(b))) - Number(/resume|cv\b/.test(own(a))));
    if (!inputs.length) return "none";
    const jobParam = queueCtx ? `&jobId=${encodeURIComponent(queueCtx.jobId)}` : "";
    const res = await api(`/api/ext/resume?url=${encodeURIComponent(location.href)}${jobParam}`, "GET", undefined, true);
    if (!res.ok || !res.base64) return "failed";
    const bytes = Uint8Array.from(atob(res.base64), (c) => c.charCodeAt(0));
    const name = decodeURIComponent((res.headers?.["content-disposition"] ?? "").match(/filename\*=UTF-8''([^;]+)/)?.[1] ?? "Resume.pdf");
    const file = new File([bytes], name, { type: "application/pdf" });
    try {
      const dt = new DataTransfer();
      dt.items.add(file);
      inputs[0].files = dt.files;
      inputs[0].dispatchEvent(new Event("input", { bubbles: true }));
      inputs[0].dispatchEvent(new Event("change", { bubbles: true }));
      return "attached";
    } catch {
      return "failed";
    }
  }

  function currentValue(t: Tracked): string {
    if (t.desc.type === "radio") {
      const r = (t.els as HTMLInputElement[]).find((x) => x.checked);
      return r ? optionLabel(r) : "";
    }
    const el = t.els[0];
    if (t.desc.type === "combobox") return comboValue(el as HTMLInputElement);
    if (el instanceof HTMLSelectElement) return el.selectedIndex > 0 ? clean(el.options[el.selectedIndex]?.textContent) : "";
    if (el instanceof HTMLInputElement && el.type === "checkbox") return "";
    return el.value ?? "";
  }

  function pageInfo() {
    const og = (p: string) => document.querySelector<HTMLMetaElement>(`meta[property='${p}']`)?.content;
    const h1 = clean(document.querySelector("h1")?.textContent);
    return {
      title: (h1 || clean(document.title)).slice(0, 300),
      company: (og("og:site_name") || location.hostname.replace(/^www\./, "").split(".")[0]).slice(0, 200),
    };
  }

  async function learn(markApplied: boolean): Promise<LearnResult | { error: string }> {
    if (!tracked.size) tracked = new Map(collect().map((t) => [t.desc.id, t]));
    const fields = [...tracked.values()]
      .map((t) => ({ ...t.desc, options: undefined, autocomplete: undefined, required: undefined, value: currentValue(t) }))
      .filter((f) => f.value.trim());
    if (!fields.length && !markApplied) return { error: "No answers found on this page." };
    const res = await api("/api/ext/learn", "POST", { url: location.href, page: pageInfo(), fields, markApplied, ...(queueCtx ? { jobId: queueCtx.jobId } : {}) });
    if (!res.ok) return { error: res.error ?? "Failed to save" };
    learnedSent = true;
    return res.data as LearnResult;
  }

  // Learn + log when the user submits (only after Autofill ran on this page, and only for a real form)
  function onSubmitIntent(e: Event) {
    if (learnedSent || !tracked.size) return;
    if (e.type === "click") {
      const btn = (e.target as Element).closest?.("button, input[type=submit], [role=button]") as HTMLElement | null;
      const text = clean(btn?.textContent || (btn as HTMLInputElement | null)?.value);
      if (!btn || !/submit|send application|apply now|^apply$|finish|complete application/i.test(text)) return;
    }
    const answered = [...tracked.values()].filter((t) => currentValue(t).trim()).length;
    if (answered < 3) return;
    learnedSent = true; // set before the request: click and submit both fire for one submission
    learn(true).then((result) => ext.runtime.sendMessage({ type: "learned", result }));
  }
  document.addEventListener("submit", onSubmitIntent, true);
  document.addEventListener("click", onSubmitIntent, true);

  /** Bot-check interstitials (Cloudflare, hCaptcha, …): there's nothing to fill until the user passes them. */
  function isChallenge(): boolean {
    const t = `${document.title} ${document.body?.innerText?.slice(0, 2000) ?? ""}`;
    return (
      /just a moment|verify you are human|performing security verification|checking your browser|are you a robot|security check|captcha/i.test(t) ||
      !!document.querySelector("iframe[src*='challenges.cloudflare.com'], iframe[src*='hcaptcha.com'], iframe[src*='recaptcha'], #challenge-form, .cf-turnstile")
    );
  }

  async function autofill(): Promise<FillReport> {
    const frame = location.hostname;
    if (isChallenge() && window === window.top) {
      return { frame, fields: 0, filled: 0, learned: 0, missingRequired: 0, resume: "skipped", page: "challenge" };
    }
    const items = collect();
    tracked = new Map(items.map((t) => [t.desc.id, t]));
    if (!items.length) return { frame, fields: 0, filled: 0, learned: 0, missingRequired: 0, resume: "skipped", page: "none" };
    const res = await api("/api/ext/match", "POST", { url: location.href, fields: items.map((t) => t.desc) });
    if (!res.ok) return { frame, fields: items.length, filled: 0, learned: 0, missingRequired: 0, resume: "skipped", error: res.error };
    const matches = (res.data as { matches: FieldMatch[] }).matches;
    let filled = 0;
    let learned = 0;
    for (const m of matches) {
      const t = tracked.get(m.id);
      if (t && (await fill(t, m))) {
        filled++;
        if (m.source === "learned") learned++;
      }
    }
    let missingRequired = 0;
    for (const t of items) {
      if (t.desc.required && !currentValue(t).trim()) {
        missingRequired++;
        const el = t.desc.type === "radio" ? ((t.els[0] as HTMLInputElement).labels?.[0] as HTMLElement) ?? t.els[0] : t.els[0];
        mark(el, COLORS.missing, "JobPilot: required, not filled");
      }
    }
    const resume = await attachResume();
    return { frame, fields: items.length, filled, learned, missingRequired, resume, page: "form" };
  }

  const answeredCount = () => {
    if (!tracked.size) tracked = new Map(collect().map((t) => [t.desc.id, t]));
    return [...tracked.values()].filter((t) => currentValue(t).trim()).length;
  };

  // ---- Apply-queue mode ----
  let queueCtx: QueueCtx | null = null;
  let bar: { root: HTMLElement; status: HTMLElement; buttons: HTMLElement } | null = null;

  function setQueueContext(ctx: QueueCtx | null) {
    queueCtx = ctx;
  }

  /** Floating bar at the bottom of the page (shadow DOM so the site's CSS can't touch it). */
  function showQueueBar(ctx: QueueCtx, report?: { filled: number; missing: number; page?: string }) {
    if (window !== window.top) return;
    bar?.root.remove();
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;left:0;right:0;bottom:0;z-index:2147483647;";
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `<style>
      .bar{font:14px/1.4 system-ui,sans-serif;background:#18181b;color:#f4f4f5;padding:10px 14px calc(10px + env(safe-area-inset-bottom));display:flex;flex-wrap:wrap;gap:8px;align-items:center;box-shadow:0 -4px 20px rgba(0,0,0,.25)}
      .info{flex:1 1 220px;min-width:0}.title{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.status{font-size:12px;color:#a1a1aa}
      button{font:inherit;font-weight:600;border:0;border-radius:8px;padding:8px 12px;cursor:pointer}
      .next{background:#818cf8;color:#0c0c0e}.skip{background:#27272a;color:#f4f4f5}.stop{background:transparent;color:#a1a1aa}
    </style><div class="bar"><div class="info"><div class="title"></div><div class="status"></div></div><div class="buttons"></div></div>`;
    const title = shadow.querySelector(".title") as HTMLElement;
    const status = shadow.querySelector(".status") as HTMLElement;
    const buttons = shadow.querySelector(".buttons") as HTMLElement;
    title.textContent = `JobPilot queue ${ctx.index + 1}/${ctx.total} · ${ctx.company} – ${ctx.title}`;
    status.textContent = !report
      ? "Filling in the form…"
      : report.page === "challenge"
        ? "This site is checking you're human. Complete the check; JobPilot continues automatically."
        : report.page === "none" || report.filled === 0
          ? "No application form on this page. Click the site's Apply button; JobPilot follows you to the form."
          : `Filled ${report.filled} field(s)${report.missing ? ` · ${report.missing} need you (yellow)` : ""}. Check, then press the site's Submit.`;
    const btn = (label: string, cls: string, type: string) => {
      const b = document.createElement("button");
      b.className = cls;
      b.textContent = label;
      b.addEventListener("click", () => {
        status.textContent = "Working…";
        ext.runtime.sendMessage({ type });
      });
      buttons.appendChild(b);
    };
    btn("✓ Submitted → next", "next", "queue:next");
    btn("Skip", "skip", "queue:skip");
    btn("Stop", "stop", "queue:stop");
    document.documentElement.appendChild(host);
    bar = { root: host, status, buttons };
  }

  function queueMessage(text: string, final = false) {
    if (!bar) return;
    bar.status.textContent = text;
    if (final) bar.buttons.replaceChildren();
  }

  W.__jobpilot = { autofill, learn, answeredCount, setQueueContext, showQueueBar, queueMessage };
}

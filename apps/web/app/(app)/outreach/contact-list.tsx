"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Badge, Button } from "@/components/ui";
import type { ContactRow } from "@/lib/outreach/repo";
import { setContactsStatus, writeDraft } from "./actions";

export const SOURCE: Record<string, string> = { job_post: "Job post", gmail: "Gmail", website: "Website", manual: "Added by you" };
const STATUS: Record<string, { label: string; tone: "neutral" | "accent" | "success" | "warning" | "danger" }> = {
  new: { label: "Not emailed", tone: "neutral" },
  emailed: { label: "Emailed", tone: "accent" },
  replied: { label: "Replied", tone: "success" },
  bounced: { label: "Bounced", tone: "danger" },
  do_not_contact: { label: "Do not contact", tone: "warning" },
};

const GEMINI_GAP_MS = 7000; // Gemini free tier ≈ 10 requests/minute

type Progress = { done: number; total: number; current?: string; ok: number; errors: string[] };

export function ContactList({ items, canDraft }: { items: ContactRow[]; canDraft: boolean }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const [progress, setProgress] = useState<Progress | null>(null);
  const cancel = useRef(false);
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allSelected = items.length > 0 && items.every((c) => selected.has(c.id));
  const ids = [...selected];

  const writeAll = async () => {
    const list = items.filter((c) => selected.has(c.id));
    cancel.current = false;
    const p: Progress = { done: 0, total: list.length, ok: 0, errors: [] };
    for (const ct of list) {
      if (cancel.current) break;
      setProgress({ ...p, current: ct.company ?? ct.email });
      const r = await writeDraft(ct.id).catch((e) => ({ ok: false as const, error: String(e?.message ?? e) }));
      p.done++;
      if (r.ok) p.ok++;
      else p.errors.push(`${ct.email}: ${r.error}`);
      setProgress({ ...p });
      if (r.ok && r.method === "gemini" && p.done < list.length) await new Promise((res) => setTimeout(res, GEMINI_GAP_MS));
    }
    setProgress({ ...p, current: undefined });
    setSelected(new Set());
    router.refresh();
  };

  return (
    <>
      <div className="mb-2 flex items-center gap-2 px-1 text-sm text-fg-muted">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(items.map((c) => c.id)))} aria-label="Select all contacts" />
          Select all
        </label>
        {selected.size > 0 && <span>· {selected.size} selected</span>}
      </div>

      {progress && (
        <div className="mb-3 rounded-xl border border-border bg-surface p-3 text-sm" role="status">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">
              {progress.current ? `Writing ${Math.min(progress.done + 1, progress.total)} of ${progress.total}…` : `Wrote ${progress.ok} of ${progress.total} emails`}
              {!progress.current && progress.ok > 0 && <Link href="/outreach?tab=drafts" className="ml-2 font-normal text-accent hover:underline">Review drafts →</Link>}
            </span>
            {progress.current ? (
              <button type="button" className="text-fg-muted hover:text-fg" onClick={() => (cancel.current = true)}>Stop</button>
            ) : (
              <button type="button" className="text-fg-muted hover:text-fg" onClick={() => setProgress(null)}>Close</button>
            )}
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-muted"><div className="h-1.5 rounded-full bg-accent transition-all" style={{ width: `${(progress.done / Math.max(progress.total, 1)) * 100}%` }} /></div>
          {progress.current && <p className="mt-1 truncate text-xs text-fg-muted">{progress.current}</p>}
          {progress.errors.length > 0 && <ul className="mt-2 max-h-28 space-y-0.5 overflow-y-auto text-xs text-danger">{progress.errors.map((e) => <li key={e} className="truncate">{e}</li>)}</ul>}
        </div>
      )}

      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
        {items.map((ct) => (
          <li key={ct.id} className="flex items-start gap-1">
            <label className="flex shrink-0 items-center self-stretch py-3 pl-3 pr-1">
              <input type="checkbox" checked={selected.has(ct.id)} onChange={() => toggle(ct.id)} aria-label={`Select ${ct.email}`} />
            </label>
            <div className="min-w-0 flex-1 py-3 pl-1 pr-4">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 truncate font-medium">{ct.company ?? ct.domain}</p>
                <Badge tone={STATUS[ct.status].tone}>{STATUS[ct.status].label}</Badge>
              </div>
              <p className="truncate text-sm text-fg-muted">{ct.name ? `${ct.name} · ` : ""}{ct.email}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-fg-muted">
                {ct.remote && <Badge tone="accent">Remote</Badge>}
                <span>{[ct.location, SOURCE[ct.source], ct.kind === "role" ? "team inbox" : null].filter(Boolean).join(" · ")}</span>
                {ct.draftId && <Link href="/outreach?tab=drafts" className="text-accent hover:underline">Draft ready →</Link>}
              </div>
            </div>
          </li>
        ))}
      </ul>

      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(57px+env(safe-area-inset-bottom))] z-30 border-t border-border bg-surface/95 backdrop-blur md:bottom-0">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 py-3 md:px-8">
            <span className="mr-auto text-sm font-medium">{selected.size} selected</span>
            <Button disabled={!canDraft || pending || !!progress?.current} onClick={writeAll} title={canDraft ? undefined : "Upload a master resume first"}>✍ Write emails ({selected.size})</Button>
            {items.some((c) => selected.has(c.id) && c.status === "do_not_contact") ? (
              <Button variant="secondary" disabled={pending} onClick={() => start(async () => { await setContactsStatus(ids, "new"); setSelected(new Set()); })}>Allow again</Button>
            ) : (
              <Button variant="ghost" disabled={pending} onClick={() => start(async () => { await setContactsStatus(ids, "do_not_contact"); setSelected(new Set()); })}>Do not contact</Button>
            )}
            <Button variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
          </div>
        </div>
      )}
    </>
  );
}

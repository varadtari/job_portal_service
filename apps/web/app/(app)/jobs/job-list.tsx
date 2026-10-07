"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Badge, Button } from "@/components/ui";
import { SOURCE_LABEL, STATUS_LABEL, timeAgo } from "@/lib/format";
import type { JobListItem } from "@/lib/jobs/repo";
import type { AutoTailorResult } from "@/lib/tailor/auto";
import { hideJobs, oneClickTailor, saveJobs } from "./actions";
import { queueJobs } from "../queue/actions";


function MatchChip({ score }: { score: number }) {
  const tone = score >= 70 ? "success" : score >= 40 ? "warning" : "neutral";
  return <Badge tone={tone}>{score}% match</Badge>;
}

type Progress = { done: number; total: number; current?: string; results: { job: JobListItem; r: AutoTailorResult }[] };

const GEMINI_GAP_MS = 7000; // Gemini free tier ≈ 10 requests/minute

export function JobList({ items, hrefs, selectedId, extraBulk }: {
  items: JobListItem[];
  hrefs: Record<string, string>;
  selectedId?: string;
  extraBulk?: (ids: string[]) => React.ReactNode;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const [progress, setProgress] = useState<Progress | null>(null);
  const cancel = useRef(false);

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allSelected = items.length > 0 && items.every((j) => selected.has(j.id));
  const ids = [...selected];

  const tailorAll = async (thenQueue = false) => {
    const jobs = items.filter((j) => selected.has(j.id));
    cancel.current = false;
    const p: Progress = { done: 0, total: jobs.length, results: [] };
    setProgress({ ...p });
    for (const job of jobs) {
      if (cancel.current) break;
      setProgress({ ...p, current: `${job.company} – ${job.title}` });
      const r = await oneClickTailor(job.id).catch((e) => ({ ok: false as const, error: String(e?.message ?? e) }));
      p.done++;
      p.results.push({ job, r });
      // Queue as we go, so stopping or leaving the page never loses already-tailored jobs
      if (thenQueue && r.ok) await queueJobs([job.id]).catch(() => undefined);
      setProgress({ ...p });
      if (r.ok && !r.reused && r.method === "gemini" && p.done < jobs.length) await new Promise((res) => setTimeout(res, GEMINI_GAP_MS));
    }
    setProgress({ ...p, current: undefined });
    setSelected(new Set());
    router.refresh();
  };

  return (
    <>
      <div className="mb-2 flex items-center gap-2 px-1 text-sm text-fg-muted">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(items.map((j) => j.id)))} aria-label="Select all jobs on this page" />
          Select all
        </label>
        {selected.size > 0 && <span>· {selected.size} selected</span>}
      </div>

      {progress && (
        <div className="mb-3 rounded-xl border border-border bg-surface p-3 text-sm" role="status">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">
              {progress.current ? `Tailoring ${Math.min(progress.done + 1, progress.total)} of ${progress.total}…` : `Tailored ${progress.results.filter((x) => x.r.ok).length} of ${progress.total}`}
              {!progress.current && <Link href="/queue" className="ml-2 font-normal text-accent hover:underline">Open apply queue →</Link>}
            </span>
            {progress.current ? (
              <button type="button" className="text-fg-muted hover:text-fg" onClick={() => (cancel.current = true)}>Stop</button>
            ) : (
              <button type="button" className="text-fg-muted hover:text-fg" onClick={() => setProgress(null)}>Close</button>
            )}
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-muted"><div className="h-1.5 rounded-full bg-accent transition-all" style={{ width: `${(progress.done / Math.max(progress.total, 1)) * 100}%` }} /></div>
          {progress.current && <p className="mt-1 truncate text-xs text-fg-muted">{progress.current}</p>}
          {!progress.current && (
            <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs">
              {progress.results.map(({ job, r }) => (
                <li key={job.id} className="flex justify-between gap-2">
                  <span className="truncate">{job.company} – {job.title}</span>
                  {r.ok ? (
                    <a className="shrink-0 text-accent hover:underline" href={`/api/resumes/${r.resumeId}/export?format=pdf`}>
                      {r.scoreBefore != null ? `${r.scoreBefore}→${r.scoreAfter}%` : "PDF"} · {r.method}
                    </a>
                  ) : (
                    <span className="shrink-0 text-danger">{r.error}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
        {items.map((job) => {
          const active = job.id === selectedId;
          return (
            <li key={job.id} className={`flex items-start gap-1 ${active ? "bg-muted" : ""}`}>
              <label className="flex shrink-0 items-center self-stretch py-3 pl-3 pr-1" onClick={(e) => e.stopPropagation()}>
                <input type="checkbox" checked={selected.has(job.id)} onChange={() => toggle(job.id)} aria-label={`Select ${job.title} at ${job.company}`} />
              </label>
              <Link href={hrefs[job.id]} scroll={false} aria-current={active ? "true" : undefined} className="block min-w-0 flex-1 py-3 pl-1 pr-4 hover:bg-muted">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium leading-snug">{job.title}</p>
                  {job.match && <MatchChip score={job.match.score} />}
                </div>
                <p className="mt-0.5 text-sm text-fg-muted">{job.company}{job.location ? ` · ${job.location}` : ""}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-fg-muted">
                  {job.remote && <Badge tone="accent">Remote</Badge>}
                  {job.status && <Badge tone="success">{STATUS_LABEL[job.status]}</Badge>}
                  <span>{timeAgo(job.postedAt)}</span>
                  <span>· {job.via ?? SOURCE_LABEL[job.source] ?? job.source}</span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(57px+env(safe-area-inset-bottom))] z-30 border-t border-border bg-surface/95 backdrop-blur md:bottom-0">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 py-3 md:px-8">
            <span className="mr-auto text-sm font-medium">{selected.size} selected</span>
            {extraBulk?.(ids)}
            <Button disabled={pending || !!progress?.current} onClick={() => tailorAll(true)}>⚡ Tailor & queue {selected.size}</Button>
            <Button variant="secondary" disabled={pending || !!progress?.current} onClick={() => tailorAll(false)}>Tailor only</Button>
            <Button variant="secondary" disabled={pending} onClick={() => start(async () => { await queueJobs(ids); setSelected(new Set()); router.refresh(); })}>Queue</Button>
            <Button variant="secondary" disabled={pending} onClick={() => start(async () => { await saveJobs(ids); setSelected(new Set()); })}>Save</Button>
            <Button variant="ghost" disabled={pending} onClick={() => start(async () => { await hideJobs(ids); setSelected(new Set()); })}>Not interested</Button>
            <Button variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
          </div>
        </div>
      )}
    </>
  );
}

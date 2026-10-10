"use client";

import { useState, useTransition } from "react";
import { Badge, Button, Input } from "@/components/ui";
import { timeAgo } from "@/lib/format";
import { addWebsite, checkWebsite, removeWebsite } from "./actions";

type Site = { id: string; domain: string; name: string | null; lastCheckedAt: Date | null; ats: string | null; slug: string | null; jobsFound: number; emailsFound: number; error: string | null };

export function Sites({ sites }: { sites: Site[] }) {
  const [domain, setDomain] = useState("");
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const check = async (id: string) => {
    setBusy(id);
    const r = await checkWebsite(id).catch((e) => ({ error: String(e?.message ?? e), pages: 0, boards: [], jobsAdded: 0, emailsAdded: 0 }));
    setBusy(null);
    setMsg(r.error ? r.error : `Checked ${r.pages} page${r.pages === 1 ? "" : "s"}: ${r.boards.length ? `job board found (${r.boards.map((b) => b.ats).join(", ")}), ` : ""}${r.jobsAdded} new job${r.jobsAdded === 1 ? "" : "s"}, ${r.emailsAdded} new contact${r.emailsAdded === 1 ? "" : "s"}.`);
  };

  return (
    <div className="space-y-4">
      <form
        className="flex flex-wrap items-end gap-2 rounded-2xl border border-border bg-surface p-4"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await addWebsite(domain, name);
            if (!r.ok) return setMsg(r.error);
            setDomain("");
            setName("");
            await check(r.id);
          });
        }}
      >
        <div className="min-w-0 flex-1 basis-48"><Input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="Company website, e.g. acme.com" aria-label="Company website" required /></div>
        <div className="min-w-0 flex-1 basis-40"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Company name (optional)" aria-label="Company name" /></div>
        <Button disabled={pending || !!busy}>Add & check</Button>
        <p className="basis-full text-xs text-fg-muted">JobPilot reads a few public pages (home, careers, jobs, contact), respects robots.txt, adds the company&apos;s job board to your sources and saves published hiring addresses. Sites are re-checked every 2 weeks.</p>
      </form>
      {msg && <p className="text-sm" role="status">{msg}</p>}
      {sites.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-fg-muted">No company websites yet. They&apos;re added automatically from your contacts, or add one above.</p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface text-sm">
          {sites.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
              <div className="min-w-0 flex-1">
                <a href={`https://${s.domain}`} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline">{s.name ?? s.domain}</a>
                <p className="text-xs text-fg-muted">
                  {s.domain} · {s.lastCheckedAt ? `checked ${timeAgo(s.lastCheckedAt)}` : "not checked yet"}
                  {s.error && <span className="text-danger"> · {s.error}</span>}
                </p>
              </div>
              <span className="flex flex-wrap items-center gap-1.5">
                {s.ats && <Badge tone="accent">{s.ats} board</Badge>}
                {s.lastCheckedAt && !s.error && <Badge>{s.jobsFound} jobs · {s.emailsFound} contacts</Badge>}
                <Button variant="ghost" disabled={!!busy} onClick={() => check(s.id)}>{busy === s.id ? "Checking…" : "Check now"}</Button>
                <Button variant="ghost" disabled={!!busy || pending} onClick={() => start(() => removeWebsite(s.id))} aria-label={`Remove ${s.domain}`}>✕</Button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

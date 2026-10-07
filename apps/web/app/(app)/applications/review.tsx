"use client";

import { useState, useTransition } from "react";
import { Badge, Button, Card, Input, Select } from "@/components/ui";
import { EVENT_LABEL, gmailLink } from "@/lib/applications/labels";
import { resolveEvent } from "./actions";

type Event = { id: string; type: string; subject: string | null; fromAddress: string | null; snippet: string | null; occurredAt: Date; emailMessageId: string | null };
type App = { id: string; company: string; title: string };

function Row({ e, apps, guess, account }: { e: Event; apps: App[]; guess: string; account: string | null }) {
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<"attach" | "create">(apps.length ? "attach" : "create");
  const [attachTo, setAttachTo] = useState(apps[0]?.id ?? "");
  const [company, setCompany] = useState(guess);
  const [title, setTitle] = useState("");
  return (
    <li className="space-y-2 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="warning">{EVENT_LABEL[e.type] ?? e.type}</Badge>
        <span className="text-xs text-fg-muted">{e.occurredAt.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · {e.fromAddress}</span>
      </div>
      <p className="font-medium">
        {e.subject}
        {e.emailMessageId && (
          <a href={gmailLink(e.emailMessageId, account)} target="_blank" rel="noopener noreferrer" className="ml-2 whitespace-nowrap text-xs font-medium text-accent hover:underline">
            Open in Gmail ↗
          </a>
        )}
      </p>
      {e.snippet && <p className="line-clamp-2 text-sm text-fg-muted">{e.snippet}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Select className="w-auto" value={mode} onChange={(x) => setMode(x.target.value as "attach" | "create")} aria-label="Action">
          {apps.length > 0 && <option value="attach">Attach to…</option>}
          <option value="create">New application</option>
        </Select>
        {mode === "attach" ? (
          <Select className="w-auto max-w-xs" value={attachTo} onChange={(x) => setAttachTo(x.target.value)} aria-label="Application">
            {apps.map((a) => <option key={a.id} value={a.id}>{a.company} – {a.title}</option>)}
          </Select>
        ) : (
          <>
            <Input className="w-40" placeholder="Company" value={company} onChange={(x) => setCompany(x.target.value)} aria-label="Company" />
            <Input className="w-48" placeholder="Role" value={title} onChange={(x) => setTitle(x.target.value)} aria-label="Role" />
          </>
        )}
        <Button
          variant="secondary"
          disabled={pending || (mode === "attach" ? !attachTo : !company.trim())}
          onClick={() => start(() => resolveEvent(e.id, mode === "attach" ? { attachTo } : { create: { company, title } }))}
        >
          Save
        </Button>
        <Button variant="ghost" disabled={pending} onClick={() => start(() => resolveEvent(e.id, { dismiss: true }))}>Not a job email</Button>
      </div>
    </li>
  );
}

export function ReviewQueue({ events, apps, guesses, account }: { events: Event[]; apps: App[]; guesses: Record<string, string>; account: string | null }) {
  if (!events.length) return null;
  return (
    <Card className="mb-6 border-warning/40">
      <h2 className="font-semibold">Needs review <span className="ml-1 rounded-full bg-warning/15 px-2 py-0.5 text-xs text-warning">{events.length}</span></h2>
      <p className="text-sm text-fg-muted">Job emails JobPilot couldn&apos;t confidently link to an application.</p>
      <ul className="divide-y divide-border">{events.map((e) => <Row key={e.id} e={e} apps={apps} guess={guesses[e.id] ?? ""} account={account} />)}</ul>
    </Card>
  );
}

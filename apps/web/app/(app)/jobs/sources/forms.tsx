"use client";

import { useActionState, useState, useTransition } from "react";
import { Alert, Badge, Button, Input, Label } from "@/components/ui";
import { ATS_LABEL } from "@/lib/jobs/types";
import { addCompany, addSearch, deleteCompany, deleteSearch, detectBoards } from "../actions";

export function AddSearchForm() {
  const [state, action, pending] = useActionState(addSearch, undefined);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-[2fr_1fr_auto_auto] sm:items-end">
      <div>
        <Label htmlFor="query">Job titles</Label>
        <Input id="query" name="query" required placeholder="e.g. backend engineer, sde, platform engineer" />
      </div>
      <div>
        <Label htmlFor="location">Location</Label>
        <Input id="location" name="location" placeholder="e.g. Bengaluru, India, Remote" />
      </div>
      <label className="flex items-center gap-2 py-2 text-sm"><input type="checkbox" name="remoteOnly" /> Remote only</label>
      <Button disabled={pending}>Add</Button>
      <p className="text-xs text-fg-muted sm:col-span-4">Commas separate alternatives. Every word in an alternative must appear in the job title.</p>
      {state?.error && <div className="sm:col-span-4"><Alert>{state.error}</Alert></div>}
    </form>
  );
}

export function DeleteButton({ id, kind }: { id: string; kind: "search" | "company" }) {
  const [pending, start] = useTransition();
  return (
    <Button variant="danger" disabled={pending} onClick={() => start(() => (kind === "search" ? deleteSearch(id) : deleteCompany(id)))}>
      Remove
    </Button>
  );
}

export function AddCompanyForm() {
  const [state, action, pending] = useActionState(detectBoards, undefined);
  const [adding, start] = useTransition();
  const [added, setAdded] = useState<string[]>([]);
  return (
    <div className="space-y-3">
      <form action={action} className="flex flex-wrap gap-3 sm:items-end">
        <div className="min-w-60 flex-1">
          <Label htmlFor="company">Company name or careers / job URL</Label>
          <Input id="company" name="company" required placeholder="e.g. Razorpay, CRED, or https://jobs.lever.co/cred" />
        </div>
        <Button disabled={pending}>{pending ? "Searching…" : "Find board"}</Button>
      </form>
      {state?.error && <Alert tone="warning">{state.error}</Alert>}
      {state?.found && (
        <ul className="space-y-2">
          {state.found.map((f) => {
            const key = `${f.ats}:${f.slug}`;
            return (
              <li key={key} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-4 py-3">
                <div>
                  <p className="font-medium">{f.company}</p>
                  <p className="text-xs text-fg-muted">{ATS_LABEL[f.ats]} · {f.slug} · {f.count} open roles</p>
                </div>
                {added.includes(key) ? (
                  <Badge tone="success">Added</Badge>
                ) : (
                  <Button variant="secondary" disabled={adding} onClick={() => start(async () => { await addCompany(f.ats, f.slug, f.company); setAdded((a) => [...a, key]); })}>
                    Track
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

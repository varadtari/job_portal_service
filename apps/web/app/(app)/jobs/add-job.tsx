"use client";

import { useActionState, useState } from "react";
import { Alert, Button, Card, Input, Label, Textarea } from "@/components/ui";
import { addJobFromUrl, addJobManually } from "./actions";

export function AddJob() {
  const [open, setOpen] = useState(false);
  const [manual, setManual] = useState(false);
  const [urlState, urlAction, urlPending] = useActionState(addJobFromUrl, undefined);
  const [manState, manAction, manPending] = useActionState(addJobManually, undefined);

  if (!open) return <Button variant="secondary" onClick={() => setOpen(true)}>+ Add job</Button>;

  return (
    <Card className="mb-4 w-full">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">Add a job</h2>
        <Button variant="ghost" onClick={() => setOpen(false)}>Close</Button>
      </div>
      {!manual ? (
        <form action={urlAction} className="space-y-3">
          <div>
            <Label htmlFor="url">Job posting URL</Label>
            <Input id="url" name="url" type="url" required placeholder="https://jobs.lever.co/company/… or any careers page" />
            <p className="mt-1 text-xs text-fg-muted">Works with Greenhouse, Lever and Ashby, and with most career pages that publish structured job data. LinkedIn and Naukri often block this; add those jobs manually.</p>
          </div>
          {urlState?.error && <Alert>{urlState.error}</Alert>}
          <div className="flex gap-2">
            <Button disabled={urlPending}>{urlPending ? "Fetching…" : "Import"}</Button>
            <Button type="button" variant="ghost" onClick={() => setManual(true)}>Enter details manually</Button>
          </div>
        </form>
      ) : (
        <form action={manAction} className="grid gap-3 sm:grid-cols-2">
          <div><Label htmlFor="m-title">Title *</Label><Input id="m-title" name="title" required /></div>
          <div><Label htmlFor="m-company">Company *</Label><Input id="m-company" name="company" required /></div>
          <div><Label htmlFor="m-location">Location</Label><Input id="m-location" name="location" /></div>
          <div><Label htmlFor="m-url">URL</Label><Input id="m-url" name="url" type="url" /></div>
          <div className="sm:col-span-2"><Label htmlFor="m-desc">Description (paste the full text; it&apos;s used for match and tailoring)</Label><Textarea id="m-desc" name="description" rows={8} /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="remote" /> Remote</label>
          {manState?.error && <div className="sm:col-span-2"><Alert>{manState.error}</Alert></div>}
          <div className="flex gap-2 sm:col-span-2">
            <Button disabled={manPending}>{manPending ? "Adding…" : "Add job"}</Button>
            <Button type="button" variant="ghost" onClick={() => setManual(false)}>Use a URL instead</Button>
          </div>
        </form>
      )}
    </Card>
  );
}

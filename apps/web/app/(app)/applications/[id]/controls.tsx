"use client";

import { useState, useTransition } from "react";
import { Button, Label, Select, Textarea } from "@/components/ui";
import { COLUMNS } from "@/lib/applications/labels";
import { deleteApplication, saveNotes, setStatus } from "../actions";

export function StatusControl({ id, status }: { id: string; status: string }) {
  const [pending, start] = useTransition();
  return (
    <Select className="w-auto" aria-label="Status" value={status} disabled={pending} onChange={(e) => { const v = e.target.value; start(() => setStatus(id, v)); }}>
      {COLUMNS.map((c) => <option key={c.status} value={c.status}>{c.label}</option>)}
    </Select>
  );
}

export function Notes({ id, initial }: { id: string; initial: string }) {
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(true);
  const [pending, start] = useTransition();
  return (
    <div>
      <Label htmlFor="notes">Notes</Label>
      <Textarea id="notes" rows={5} value={value} onChange={(e) => { setValue(e.target.value); setSaved(false); }} placeholder="Recruiter name, interview prep, salary discussed…" />
      <div className="mt-2 flex items-center gap-3">
        <Button variant="secondary" disabled={pending || saved} onClick={() => start(async () => { await saveNotes(id, value); setSaved(true); })}>Save notes</Button>
        {saved && value && <span className="text-xs text-fg-muted">Saved</span>}
      </div>
    </div>
  );
}

export function DeleteApplication({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <Button variant="danger" disabled={pending} onClick={() => confirm("Delete this application and its email history?") && start(() => deleteApplication(id))}>
      Delete application
    </Button>
  );
}

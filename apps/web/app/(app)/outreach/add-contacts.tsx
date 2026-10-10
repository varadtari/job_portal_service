"use client";

import { useState, useTransition } from "react";
import { Button, Textarea } from "@/components/ui";
import { findContactsNow, importContacts } from "./actions";

/** Paste addresses / upload a CSV, or scan jobs and Gmail now. */
export function AddContacts() {
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 1_000_000) return setMsg("That file is too large (max 1 MB).");
    setText(await f.text());
  };

  return (
    <div className="space-y-3 text-sm">
      <h2 className="font-semibold">Add contacts</h2>
      <p className="text-fg-muted">Paste addresses you found (e.g. a LinkedIn post saying “send your CV to …”), one per line as <code>email, company, location</code>, or a CSV with an <code>email</code> column (optional: company, name, location, remote).</p>
      <Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder={"careers@acme.io, Acme, Pune\nhr@globex.com, Globex, Remote"} aria-label="Contacts to add" />
      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={pending || !text.trim()} onClick={() => start(async () => { const r = await importContacts(text); setMsg(`Added ${r.added} new contact${r.added === 1 ? "" : "s"} (${r.found} found${r.found > r.added ? "; the rest were duplicates or not usable" : ""}).`); if (r.added) setText(""); })}>Add</Button>
        <label className="cursor-pointer rounded-lg border border-border px-3.5 py-2 font-medium hover:bg-muted">
          Upload CSV
          <input type="file" accept=".csv,text/csv,text/plain" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
      </div>
      <hr className="border-border" />
      <p className="text-fg-muted">JobPilot also collects addresses from your job posts and from recruiters who emailed you, every day.</p>
      <Button variant="secondary" disabled={pending} onClick={() => start(async () => { const r = await findContactsNow(); setMsg(`Found ${r.jobs} new in job posts and ${r.gmail} from Gmail.`); })}>Scan jobs & Gmail now</Button>
      {msg && <p className="text-success" role="status">{msg}</p>}
    </div>
  );
}

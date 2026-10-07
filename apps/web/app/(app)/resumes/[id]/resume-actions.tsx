"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { deleteResume, reparseResume } from "../actions";

export function ResumeActions({ id, hasFile, parsed, canReparse }: { id: string; hasFile: boolean; parsed: boolean; canReparse: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string>();
  return (
    <div className="flex flex-wrap items-center gap-2">
      {msg && <span className="text-sm text-fg-muted">{msg}</span>}
      {parsed && (
        <>
          <a href={`/api/resumes/${id}/export?format=pdf`} className="rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-accent-fg hover:opacity-90">
            Download PDF
          </a>
          <a href={`/api/resumes/${id}/export?format=docx`} className="rounded-lg border border-border bg-surface px-3.5 py-2 text-sm font-medium hover:bg-muted">
            DOCX
          </a>
        </>
      )}
      {hasFile && (
        <a href={`/api/resumes/${id}/file`} className="rounded-lg border border-border bg-surface px-3.5 py-2 text-sm font-medium hover:bg-muted">
          Original file
        </a>
      )}
      {canReparse && <Button
        variant="secondary"
        disabled={pending}
        onClick={() => {
          if (parsed && !confirm("Re-parse from the original file? Your edits to the sections will be replaced.")) return;
          start(async () => { const r = await reparseResume(id); setMsg(r?.error ?? r?.ok); });
        }}
      >
        {pending ? "Working…" : parsed ? "Re-parse" : "Parse"}
      </Button>}
      <Button
        variant="danger"
        disabled={pending}
        onClick={() => confirm("Delete this resume?") && start(() => deleteResume(id))}
      >
        Delete
      </Button>
    </div>
  );
}

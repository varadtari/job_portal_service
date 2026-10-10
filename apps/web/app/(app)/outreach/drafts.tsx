"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Badge, Button, Input, Textarea } from "@/components/ui";
import type { EmailRow } from "@/lib/outreach/repo";
import { dismissDrafts, saveDraft, sendDraft, writeDraft } from "./actions";
import { reconnectGoogle } from "../applications/followup-actions";

const SEND_GAP_S = 25; // slow, human-like pace protects the Gmail account

type Edit = { subject: string; body: string };
type RowState = { state: "idle" | "sending" | "sent" | "error"; error?: string };

export function Drafts({ drafts, left, canSend, resumeName }: { drafts: EmailRow[]; left: number; canSend: boolean; resumeName: string | null }) {
  const router = useRouter();
  const [edits, setEdits] = useState<Record<string, Edit>>(() => Object.fromEntries(drafts.map((d) => [d.id, { subject: d.subject, body: d.body }])));
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [running, setRunning] = useState(false);
  const [wait, setWait] = useState(0);
  const [notice, setNotice] = useState<{ tone: "danger" | "success"; text: string; permission?: boolean } | null>(null);
  const [pending, start] = useTransition();
  const cancel = useRef(false);

  // Keep local edits for drafts that appear after a refresh (e.g. regenerate)
  const editOf = (d: EmailRow) => edits[d.id] ?? { subject: d.subject, body: d.body };
  const setEdit = (id: string, e: Partial<Edit>, d: EmailRow) => setEdits((s) => ({ ...s, [id]: { ...editOf(d), ...e } }));
  const setRow = (id: string, r: RowState) => setRows((s) => ({ ...s, [id]: r }));
  const open = drafts.filter((d) => rows[d.id]?.state !== "sent");

  const sendOne = async (d: EmailRow): Promise<boolean | "stop"> => {
    setRow(d.id, { state: "sending" });
    const r = await sendDraft(d.id, editOf(d)).catch((e) => ({ ok: false as const, error: String(e?.message ?? e), permission: false, limit: false }));
    if (r.ok) {
      setRow(d.id, { state: "sent" });
      return true;
    }
    setRow(d.id, { state: "error", error: r.error });
    if (r.permission || r.limit) {
      setNotice({ tone: "danger", text: r.error, permission: r.permission });
      return "stop";
    }
    return false;
  };

  const sendAll = async () => {
    cancel.current = false;
    setRunning(true);
    setNotice(null);
    const queue = open.slice(0, left);
    let sent = 0;
    for (let i = 0; i < queue.length; i++) {
      if (cancel.current) break;
      const r = await sendOne(queue[i]);
      if (r === "stop") break;
      if (r) sent++;
      if (i < queue.length - 1) {
        for (let s = SEND_GAP_S; s > 0 && !cancel.current; s--) {
          setWait(s);
          await new Promise((res) => setTimeout(res, 1000));
        }
        setWait(0);
      }
    }
    setRunning(false);
    setNotice((n) => n ?? { tone: "success", text: `Sent ${sent} email${sent === 1 ? "" : "s"}${open.length > left ? `. ${open.length - left} stay as drafts (daily limit); send them tomorrow.` : "."}` });
    router.refresh();
  };

  if (!drafts.length) return <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-fg-muted">No drafts. On Contacts, tick some companies and choose “Write emails”.</p>;

  return (
    <div className="space-y-3">
      <div className="sticky top-14 z-10 rounded-2xl border border-border bg-surface/95 p-3 backdrop-blur md:top-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="mr-auto text-sm">
            <b>{open.length}</b> email{open.length === 1 ? "" : "s"} · {resumeName ? <>master resume attached (<i>{resumeName}</i>)</> : <span className="text-danger">no master resume</span>} · one every ~{SEND_GAP_S}s · <b>{left}</b> left today
          </p>
          {running ? (
            <Button variant="secondary" onClick={() => (cancel.current = true)}>Stop{wait ? ` (next in ${wait}s)` : ""}</Button>
          ) : (
            <Button disabled={!canSend || !open.length || left <= 0 || !resumeName} onClick={sendAll}>Send all ({Math.min(open.length, left)})</Button>
          )}
        </div>
        {running && <p className="mt-1 text-xs text-fg-muted">Keep this tab open while sending. You can stop at any time; unsent emails stay as drafts.</p>}
        {!canSend && (
          <div className="mt-2 text-sm text-warning">
            JobPilot needs permission to send from your Gmail. <form action={reconnectGoogle} className="inline"><button className="font-medium underline">Sign in again to grant it</button></form>
          </div>
        )}
        {notice && (
          <div className={`mt-2 text-sm ${notice.tone === "danger" ? "text-danger" : "text-success"}`} role="status">
            {notice.text} {notice.permission && <form action={reconnectGoogle} className="inline"><button className="font-medium underline">Sign in again</button></form>}
          </div>
        )}
      </div>

      {drafts.map((d) => {
        const e = editOf(d);
        const st = rows[d.id] ?? (d.status === "failed" ? { state: "error" as const, error: d.error ?? "Failed" } : { state: "idle" as const });
        const locked = running || st.state === "sending" || st.state === "sent";
        return (
          <article key={d.id} className={`rounded-2xl border border-border bg-surface p-4 ${st.state === "sent" ? "opacity-60" : ""}`}>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
              <p className="min-w-0 truncate"><span className="text-fg-muted">To</span> <b>{d.company ?? d.email}</b> <span className="text-fg-muted">&lt;{d.email}&gt;{d.location ? ` · ${d.location}` : ""}</span></p>
              <span className="flex items-center gap-1.5">
                <Badge>{d.method === "gemini" ? "Gemini" : "Template"}</Badge>
                {st.state === "sending" && <Badge tone="accent">Sending…</Badge>}
                {st.state === "sent" && <Badge tone="success">Sent ✓</Badge>}
                {st.state === "error" && <Badge tone="danger">Failed</Badge>}
              </span>
            </div>
            <Input value={e.subject} disabled={locked} onChange={(ev) => setEdit(d.id, { subject: ev.target.value }, d)} onBlur={() => saveDraft(d.id, e.subject, e.body)} aria-label="Subject" className="mb-2 font-medium" />
            <Textarea value={e.body} disabled={locked} rows={11} onChange={(ev) => setEdit(d.id, { body: ev.target.value }, d)} onBlur={() => saveDraft(d.id, e.subject, e.body)} aria-label="Message" />
            {st.state === "error" && <p className="mt-1 text-xs text-danger">{st.error}</p>}
            {st.state !== "sent" && (
              <div className="mt-2 flex flex-wrap gap-2">
                <Button variant="secondary" disabled={locked || !canSend || left <= 0} onClick={async () => { const r = await sendOne(d); if (r === true) router.refresh(); }}>Send</Button>
                <Button
                  variant="ghost"
                  disabled={locked || pending}
                  onClick={() => start(async () => {
                    const r = await writeDraft(d.contactId, true);
                    if (!r.ok) setRow(d.id, { state: "error", error: r.error });
                    setEdits((s) => { const n = { ...s }; delete n[d.id]; return n; });
                    router.refresh();
                  })}
                >
                  ↻ Rewrite
                </Button>
                <Button variant="ghost" disabled={locked || pending} onClick={() => start(async () => { await dismissDrafts([d.id]); })}>Discard</Button>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}

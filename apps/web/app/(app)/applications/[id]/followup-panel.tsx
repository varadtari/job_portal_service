"use client";

import { useRef, useState, useTransition } from "react";
import { Alert, Badge, Button, Card, Input, Label, Select, Textarea } from "@/components/ui";
import { discardFollowUp, reconnectGoogle, saveFollowUpSettings, sendFollowUp, writeFollowUp, type Draft } from "../followup-actions";

type Props = {
  applicationId: string;
  status: string;
  settings: { enabled: boolean | null; everyDays: number | null; max: number | null; contactEmail: string | null };
  defaults: { on: boolean; days: number; max: number };
  nextAt: string | null;
  count: number;
  canSend: boolean;
  pendingDraft: Draft | null;
  autoOpen: boolean;
  history: { id: string; sentAt: string; to: string; subject: string }[];
};

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const daysUntil = (iso: string) => Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);

export function FollowUpPanel(p: Props) {
  const [s, setS] = useState(p.settings);
  const initial = p.autoOpen ? p.pendingDraft : null;
  const [draft, setDraft] = useState<Draft | null>(initial);
  const [edit, setEdit] = useState({ to: initial?.to ?? p.settings.contactEmail ?? "", subject: initial?.subject ?? "", body: initial?.body ?? "" });
  const [msg, setMsg] = useState<{ ok?: string; error?: string; needsPermission?: boolean }>();
  const [pending, start] = useTransition();

  /** Opens a draft in the editor (fields start from the draft's text). */
  const openDraft = (d: Draft | null) => {
    setDraft(d);
    if (d) setEdit({ to: d.to ?? s.contactEmail ?? "", subject: d.subject, body: d.body });
  };

  const enabled = s.enabled ?? p.defaults.on;
  const every = s.everyDays ?? p.defaults.days;
  const max = s.max ?? p.defaults.max;
  // Always merge into the latest settings: quick successive changes must not overwrite each other
  const latest = useRef(p.settings);
  const save = (patch: Partial<typeof s>) => {
    const next = { ...latest.current, ...patch };
    latest.current = next;
    setS(next);
    start(async () => {
      const r = await saveFollowUpSettings(p.applicationId, next);
      if ("error" in r && r.error) setMsg({ error: r.error });
    });
  };
  const waiting = ["applied", "oa", "ghosted"].includes(p.status);

  let statusLine: string;
  if (p.pendingDraft) statusLine = "A drafted follow-up is waiting for you to review and send.";
  else if (!enabled) statusLine = "Automatic follow-ups are off for this application.";
  else if (!waiting) statusLine = "Paused: follow-ups only run while you're waiting to hear back.";
  else if (p.count >= max) statusLine = `Done: ${p.count} of ${max} follow-up(s) sent.`;
  else if (p.nextAt) statusLine = daysUntil(p.nextAt) <= 0 ? "A follow-up is due now. JobPilot will draft it at the next daily check, or write it now." : `Next follow-up drafted on ${fmt(p.nextAt)} (in ${daysUntil(p.nextAt)} day${daysUntil(p.nextAt) === 1 ? "" : "s"}).`;
  else statusLine = "Starts once you've applied.";

  return (
    <Card className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Follow-ups</h2>
          <p className="text-sm text-fg-muted">{statusLine}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Automatic follow-ups"
          onClick={() => save({ enabled: !enabled })}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${enabled ? "bg-accent" : "bg-border"}`}
        >
          <span className={`inline-block size-5 rounded-full bg-white shadow transition ${enabled ? "translate-x-5" : "translate-x-0.5"}`} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="fu-every">Every</Label>
          <Select id="fu-every" value={every} onChange={(e) => save({ everyDays: Number(e.target.value) })}>
            {[3, 5, 7, 10, 14, 21].map((d) => <option key={d} value={d}>{d} days{d === p.defaults.days ? " (default)" : ""}</option>)}
          </Select>
        </div>
        <div>
          <Label htmlFor="fu-max">Up to</Label>
          <Select id="fu-max" value={max} onChange={(e) => save({ max: Number(e.target.value) })}>
            {[1, 2, 3].map((n) => <option key={n} value={n}>{n} follow-up{n > 1 ? "s" : ""}</option>)}
          </Select>
        </div>
        <div className="col-span-2">
          <Label htmlFor="fu-contact">Recruiter / contact email</Label>
          <Input
            id="fu-contact"
            type="email"
            placeholder="Found automatically from their emails, or type one"
            defaultValue={s.contactEmail ?? ""}
            onBlur={(e) => e.target.value.trim() !== (latest.current.contactEmail ?? "") && save({ contactEmail: e.target.value.trim() || null })}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          disabled={pending}
          onClick={() =>
            start(async () => {
              setMsg(undefined);
              const r = await writeFollowUp(p.applicationId);
              if (r.error) setMsg({ error: r.error });
              else openDraft(r.draft!);
            })
          }
        >
          {pending && !draft ? "Writing…" : p.pendingDraft ? "Review drafted follow-up" : "✍ Write follow-up"}
        </Button>
        {p.pendingDraft && <Badge tone="warning">Draft ready</Badge>}
        {p.count > 0 && <span className="text-xs text-fg-muted">{p.count} sent</span>}
      </div>
      {msg?.ok && <Alert tone="success">{msg.ok}</Alert>}
      {msg?.error && !draft && <Alert>{msg.error}</Alert>}

      {p.history.length > 0 && (
        <ul className="space-y-1 border-t border-border pt-3 text-sm">
          {p.history.map((h) => (
            <li key={h.id} className="flex justify-between gap-3">
              <span className="min-w-0 truncate">{h.subject}</span>
              <span className="shrink-0 text-xs text-fg-muted">{fmt(h.sentAt)} → {h.to}</span>
            </li>
          ))}
        </ul>
      )}

      {draft && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Follow-up email">
          <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-2xl bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-xl sm:rounded-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold">Follow-up email</h3>
              <Badge>{draft.method === "gemini" ? "Written by Gemini" : "Template"}</Badge>
            </div>
            {!p.canSend && (
              <div className="mb-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
                JobPilot needs permission to send email from your Gmail.{" "}
                <form action={reconnectGoogle} className="inline"><button className="font-medium underline">Sign in again to grant it</button></form>
              </div>
            )}
            <div className="space-y-3">
              <div><Label htmlFor="fu-to">To</Label><Input id="fu-to" type="email" value={edit.to} onChange={(e) => setEdit({ ...edit, to: e.target.value })} placeholder="recruiter@company.com" /></div>
              <div><Label htmlFor="fu-subject">Subject</Label><Input id="fu-subject" value={edit.subject} onChange={(e) => setEdit({ ...edit, subject: e.target.value })} /></div>
              <div><Label htmlFor="fu-body">Message</Label><Textarea id="fu-body" rows={10} value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} /></div>
            </div>
            {msg?.error && <div className="mt-3"><Alert>{msg.error}</Alert></div>}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button
                disabled={pending || !p.canSend || !edit.to.trim()}
                onClick={() =>
                  start(async () => {
                    const r = await sendFollowUp(draft.id, p.applicationId, edit);
                    if (r.error) return setMsg({ error: r.error, needsPermission: r.needsPermission });
                    setDraft(null);
                    setMsg({ ok: `Sent to ${edit.to}. It's in your Gmail “Sent” folder.` });
                  })
                }
              >
                {pending ? "Working…" : "Send from Gmail"}
              </Button>
              <Button variant="secondary" disabled={pending} onClick={() => start(async () => { const r = await writeFollowUp(p.applicationId, true); if (r.draft) openDraft(r.draft); else setMsg({ error: r.error }); })}>Regenerate</Button>
              <Button variant="ghost" disabled={pending} onClick={() => start(async () => { await discardFollowUp(draft.id, p.applicationId); setDraft(null); })}>Discard</Button>
              <Button variant="ghost" onClick={() => setDraft(null)} className="ml-auto">Close</Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

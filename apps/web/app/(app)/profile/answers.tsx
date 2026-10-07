"use client";

import { useState, useTransition } from "react";
import { Alert, Badge, Button, Card, Input, Label, Textarea } from "@/components/ui";
import { deleteAnswer, saveAnswer } from "./actions";

type Answer = { key: string; label: string | null; value: string; source: string; useCount: number };

function AnswerRow({ a }: { a: Answer }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(a.value);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string>();
  return (
    <li className="py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{a.label ?? a.key}</p>
          <div className="mt-1 flex gap-2">
            <Badge tone={a.source === "learned" ? "accent" : "neutral"}>{a.source === "learned" ? "Learned from an application" : "Added by you"}</Badge>
            {a.useCount > 0 && <Badge>Used {a.useCount}×</Badge>}
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button variant="ghost" onClick={() => setEditing(!editing)}>{editing ? "Cancel" : "Edit"}</Button>
          <Button variant="danger" disabled={pending} onClick={() => confirm("Delete this answer?") && start(() => deleteAnswer(a.key))}>Delete</Button>
        </div>
      </div>
      {editing ? (
        <div className="mt-3 space-y-2">
          <Textarea rows={4} value={value} onChange={(e) => setValue(e.target.value)} />
          {err && <Alert>{err}</Alert>}
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await saveAnswer(a.label ?? a.key, value, a.key);
                if (r?.error) setErr(r.error);
                else setEditing(false);
              })
            }
          >
            Save
          </Button>
        </div>
      ) : (
        <p className="mt-2 whitespace-pre-wrap text-sm text-fg-muted">{a.value}</p>
      )}
    </li>
  );
}

export function SavedAnswers({ answers }: { answers: Answer[] }) {
  const [q, setQ] = useState("");
  const [a, setA] = useState("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>();
  return (
    <Card>
      <h2 className="font-semibold">Saved answers</h2>
      <p className="text-sm text-fg-muted">
        Answers to application questions that aren&apos;t standard fields. The browser extension adds new ones automatically as you apply.
      </p>
      {answers.length > 0 ? (
        <ul className="mt-2 divide-y divide-border">{answers.map((x) => <AnswerRow key={x.key} a={x} />)}</ul>
      ) : (
        <p className="mt-4 text-sm text-fg-muted">No saved answers yet.</p>
      )}
      <div className="mt-4 space-y-3 rounded-xl border border-dashed border-border p-4">
        <div>
          <Label htmlFor="q">Question</Label>
          <Input id="q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Why are you interested in this role?" />
        </div>
        <div>
          <Label htmlFor="a">Answer</Label>
          <Textarea id="a" rows={3} value={a} onChange={(e) => setA(e.target.value)} />
        </div>
        {msg?.error && <Alert>{msg.error}</Alert>}
        <Button
          variant="secondary"
          disabled={pending || !q.trim() || !a.trim()}
          onClick={() =>
            start(async () => {
              const r = await saveAnswer(q, a);
              setMsg(r);
              if (!r?.error) { setQ(""); setA(""); }
            })
          }
        >
          Add answer
        </Button>
      </div>
    </Card>
  );
}

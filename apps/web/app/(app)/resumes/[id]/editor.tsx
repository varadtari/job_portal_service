"use client";

import { useRef, useState, useTransition } from "react";
import { Alert, Button, Card, Input, Label, Textarea } from "@/components/ui";
import type { ResumeContent } from "@/lib/resume/types";
import { saveResumeContent } from "../actions";

type R = ResumeContent;

const lines = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);
const csv = (s: string) => s.split(",").map((l) => l.trim()).filter(Boolean);
const orNull = (s: string) => (s.trim() ? s : null);

function Field({ label, value, onChange, className }: { label: string; value: string | null; onChange: (v: string) => void; className?: string }) {
  return (
    <div className={className}>
      <Label>{label}</Label>
      <Input value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function LinesField({ label, value, onChange }: { label: string; value: string[]; onChange: (v: string[]) => void }) {
  // Keep raw text locally so blank lines don't vanish while typing.
  const [text, setText] = useState(value.join("\n"));
  return (
    <div className="sm:col-span-2">
      <Label>{label} <span className="font-normal">(one per line)</span></Label>
      <Textarea
        rows={Math.min(12, Math.max(3, value.length + 1))}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(lines(e.target.value));
        }}
      />
    </div>
  );
}

function Section<T>({
  title,
  items,
  onChange,
  blank,
  render,
}: {
  title: string;
  items: T[];
  onChange: (items: T[]) => void;
  blank: T;
  render: (item: T, set: (patch: Partial<T>) => void) => React.ReactNode;
}) {
  // Stable keys so uncontrolled inputs don't show stale text after remove/reorder.
  const next = useRef(items.length);
  const [keys, setKeys] = useState(() => items.map((_, i) => i));
  const add = () => {
    setKeys([...keys, next.current++]);
    onChange([...items, structuredClone(blank)]);
  };
  const remove = (i: number) => {
    setKeys(keys.filter((_, j) => j !== i));
    onChange(items.filter((_, j) => j !== i));
  };
  const moveUp = (i: number) => {
    const swap = <X,>(a: X[]) => { const n = [...a]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n; };
    setKeys(swap(keys));
    onChange(swap(items));
  };
  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold">{title}</h2>
        <Button variant="ghost" type="button" onClick={add}>+ Add</Button>
      </div>
      <div className="space-y-4">
        {items.map((item, i) => (
          <div key={keys[i]} className="rounded-xl border border-border p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {render(item, (patch) => onChange(items.map((it, j) => (j === i ? { ...it, ...patch } : it))))}
            </div>
            <div className="mt-2 flex justify-end gap-1">
              {i > 0 && (
                <Button variant="ghost" type="button" onClick={() => moveUp(i)}>↑ Move up</Button>
              )}
              <Button variant="danger" type="button" onClick={() => remove(i)}>Remove</Button>
            </div>
          </div>
        ))}
        {items.length === 0 && <p className="text-sm text-fg-muted">None.</p>}
      </div>
    </Card>
  );
}

export function ResumeEditor({ id, title: initialTitle, initial }: { id: string; title: string; initial: R }) {
  const [r, setR] = useState<R>(initial);
  const [title, setTitle] = useState(initialTitle);
  const [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<{ error?: string; ok?: string }>();

  const update = <K extends keyof R>(k: K, v: R[K]) => {
    setR((prev) => ({ ...prev, [k]: v }));
    setDirty(true);
  };
  const b = r.basics;
  const setBasics = (patch: Partial<R["basics"]>) => update("basics", { ...b, ...patch });

  return (
    <div className="space-y-6 pb-24">
      <Card>
        <h2 className="mb-4 font-semibold">Basics</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Resume name" value={title} onChange={(v) => { setTitle(v); setDirty(true); }} className="sm:col-span-2" />
          <Field label="Full name" value={b.name} onChange={(v) => setBasics({ name: v })} />
          <Field label="Headline" value={b.headline} onChange={(v) => setBasics({ headline: orNull(v) })} />
          <Field label="Email" value={b.email} onChange={(v) => setBasics({ email: orNull(v) })} />
          <Field label="Phone" value={b.phone} onChange={(v) => setBasics({ phone: orNull(v) })} />
          <Field label="Location" value={b.location} onChange={(v) => setBasics({ location: orNull(v) })} className="sm:col-span-2" />
          <div className="sm:col-span-2">
            <Label>Summary</Label>
            <Textarea rows={4} value={b.summary ?? ""} onChange={(e) => setBasics({ summary: orNull(e.target.value) })} />
          </div>
          <div className="sm:col-span-2">
            <Label>Links <span className="font-normal">(one per line: Label | URL)</span></Label>
            <Textarea
              rows={3}
              defaultValue={b.links.map((l) => `${l.label} | ${l.url}`).join("\n")}
              onChange={(e) =>
                setBasics({
                  links: lines(e.target.value).map((l) => {
                    const [label, url] = l.includes("|") ? l.split("|").map((s) => s.trim()) : [l, l];
                    return { label, url };
                  }),
                })
              }
            />
          </div>
        </div>
      </Card>

      <Section
        title="Experience"
        items={r.experience}
        onChange={(v) => update("experience", v)}
        blank={{ company: "", title: "", location: null, start: null, end: null, current: false, bullets: [] }}
        render={(e, set) => (
          <>
            <Field label="Title" value={e.title} onChange={(v) => set({ title: v })} />
            <Field label="Company" value={e.company} onChange={(v) => set({ company: v })} />
            <Field label="Start" value={e.start} onChange={(v) => set({ start: orNull(v) })} />
            <div>
              <Field label="End" value={e.current ? "" : e.end} onChange={(v) => set({ end: orNull(v) })} />
              <label className="mt-1 flex items-center gap-2 text-xs text-fg-muted">
                <input type="checkbox" checked={e.current} onChange={(ev) => set({ current: ev.target.checked, end: ev.target.checked ? null : e.end })} /> Current role
              </label>
            </div>
            <Field label="Location" value={e.location} onChange={(v) => set({ location: orNull(v) })} className="sm:col-span-2" />
            <LinesField label="Bullets" value={e.bullets} onChange={(v) => set({ bullets: v })} />
          </>
        )}
      />

      <Section
        title="Skills"
        items={r.skills}
        onChange={(v) => update("skills", v)}
        blank={{ category: "", items: [] }}
        render={(s, set) => (
          <>
            <Field label="Category" value={s.category} onChange={(v) => set({ category: v })} />
            <div>
              <Label>Skills <span className="font-normal">(comma-separated)</span></Label>
              <Input defaultValue={s.items.join(", ")} onChange={(e) => set({ items: csv(e.target.value) })} />
            </div>
          </>
        )}
      />

      <Section
        title="Projects"
        items={r.projects}
        onChange={(v) => update("projects", v)}
        blank={{ name: "", url: null, tech: [], bullets: [] }}
        render={(p, set) => (
          <>
            <Field label="Name" value={p.name} onChange={(v) => set({ name: v })} />
            <Field label="URL" value={p.url} onChange={(v) => set({ url: orNull(v) })} />
            <div className="sm:col-span-2">
              <Label>Tech <span className="font-normal">(comma-separated)</span></Label>
              <Input defaultValue={p.tech.join(", ")} onChange={(e) => set({ tech: csv(e.target.value) })} />
            </div>
            <LinesField label="Bullets" value={p.bullets} onChange={(v) => set({ bullets: v })} />
          </>
        )}
      />

      <Section
        title="Education"
        items={r.education}
        onChange={(v) => update("education", v)}
        blank={{ institution: "", degree: null, field: null, start: null, end: null, grade: null, details: [] }}
        render={(e, set) => (
          <>
            <Field label="Institution" value={e.institution} onChange={(v) => set({ institution: v })} className="sm:col-span-2" />
            <Field label="Degree" value={e.degree} onChange={(v) => set({ degree: orNull(v) })} />
            <Field label="Field" value={e.field} onChange={(v) => set({ field: orNull(v) })} />
            <Field label="Start" value={e.start} onChange={(v) => set({ start: orNull(v) })} />
            <Field label="End" value={e.end} onChange={(v) => set({ end: orNull(v) })} />
            <Field label="Grade" value={e.grade} onChange={(v) => set({ grade: orNull(v) })} />
            <LinesField label="Details" value={e.details} onChange={(v) => set({ details: v })} />
          </>
        )}
      />

      <Section
        title="Certifications"
        items={r.certifications}
        onChange={(v) => update("certifications", v)}
        blank={{ name: "", issuer: null, date: null }}
        render={(c, set) => (
          <>
            <Field label="Name" value={c.name} onChange={(v) => set({ name: v })} className="sm:col-span-2" />
            <Field label="Issuer" value={c.issuer} onChange={(v) => set({ issuer: orNull(v) })} />
            <Field label="Date" value={c.date} onChange={(v) => set({ date: orNull(v) })} />
          </>
        )}
      />

      <Section
        title="Other sections"
        items={r.extra}
        onChange={(v) => update("extra", v)}
        blank={{ heading: "", items: [] }}
        render={(x, set) => (
          <>
            <Field label="Heading" value={x.heading} onChange={(v) => set({ heading: v })} className="sm:col-span-2" />
            <LinesField label="Items" value={x.items} onChange={(v) => set({ items: v })} />
          </>
        )}
      />

      <div className="fixed inset-x-0 bottom-[calc(57px+env(safe-area-inset-bottom))] z-10 md:bottom-0 border-t border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-end gap-3 px-4 py-3 md:px-8">
          {status?.error && <Alert>{status.error}</Alert>}
          {status?.ok && !dirty && <span className="text-sm text-success">{status.ok}</span>}
          {dirty && <span className="text-sm text-fg-muted">Unsaved changes</span>}
          <Button
            disabled={pending || !dirty}
            onClick={() =>
              start(async () => {
                const res = await saveResumeContent(id, title, r);
                setStatus(res);
                if (!res?.error) setDirty(false);
              })
            }
          >
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}

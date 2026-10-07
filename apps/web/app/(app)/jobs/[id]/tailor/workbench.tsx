"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Badge, Button, Card, Select } from "@/components/ui";
import { extractSkills, matchSkills } from "@/lib/match/skills";
import { resumeText } from "@/lib/resume/text";
import type { ResumeContent } from "@/lib/resume/types";
import { allTailored, assemble, type Choices } from "@/lib/tailor/assemble";
import type { Warning } from "@/lib/tailor/guard";
import { addConfirmedSkills } from "@/lib/tailor/rules";
import { saveTailored, tailorWithAI } from "./actions";

type Props = {
  jobId: string;
  job: { title: string; company: string; skills: string[]; descriptionLength: number };
  bases: { id: string; title: string }[];
  baseId: string;
  base: ResumeContent;
  rulesProposal: ResumeContent;
  geminiOn: boolean;
};

function score(r: ResumeContent, jobSkills: string[]) {
  return matchSkills(jobSkills, new Set(extractSkills(resumeText(r))));
}

function ScoreCard({ label, value }: { label: string; value: number | null | undefined }) {
  const tone = value == null ? "text-fg-muted" : value >= 70 ? "text-success" : value >= 40 ? "text-warning" : "text-danger";
  return (
    <div className="rounded-xl bg-muted px-4 py-3">
      <p className="text-xs text-fg-muted">{label}</p>
      <p className={`text-2xl font-semibold ${tone}`}>{value == null ? "–" : `${value}%`}</p>
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-border p-0.5 text-xs">
      <button type="button" onClick={() => onChange(false)} className={`rounded-md px-2.5 py-1 ${!on ? "bg-muted font-medium" : "text-fg-muted"}`}>Original</button>
      <button type="button" onClick={() => onChange(true)} className={`rounded-md px-2.5 py-1 ${on ? "bg-accent text-accent-fg" : "text-fg-muted"}`}>Tailored</button>
    </div>
  );
}

function Bullets({ items, compare, highlight }: { items: string[]; compare?: string[]; highlight: Set<string> }) {
  const known = new Set(compare);
  return (
    <ul className="space-y-1.5 text-sm">
      {items.map((b, i) => {
        const changed = compare && !known.has(b);
        const hits = extractSkills(b).filter((s) => highlight.has(s));
        return (
          <li key={i} className={`flex gap-2 ${changed ? "rounded-md bg-accent/10 px-2 py-1" : ""}`}>
            <span className="text-fg-muted">•</span>
            <span>
              {b}
              {hits.length > 0 && <span className="ml-1 text-xs text-success">({hits.join(", ")})</span>}
            </span>
          </li>
        );
      })}
      {items.length === 0 && <li className="text-sm text-fg-muted">No bullets.</li>}
    </ul>
  );
}

function Block({ title, on, setOn, original, tailored, same }: { title: string; on: boolean; setOn: (v: boolean) => void; original: React.ReactNode; tailored: React.ReactNode; same: boolean }) {
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">{title}</h3>
        {same ? <Badge>No changes</Badge> : <Toggle on={on} onChange={setOn} />}
      </div>
      {same ? (
        original
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <div className={on ? "opacity-60" : ""}><p className="mb-2 text-xs font-medium uppercase tracking-wide text-fg-muted">Original</p>{original}</div>
          <div className={on ? "" : "opacity-60"}><p className="mb-2 text-xs font-medium uppercase tracking-wide text-accent">Tailored</p>{tailored}</div>
        </div>
      )}
    </Card>
  );
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function Workbench({ jobId, job, bases, baseId, base, rulesProposal, geminiOn }: Props) {
  const router = useRouter();
  const [proposal, setProposal] = useState(rulesProposal);
  const [method, setMethod] = useState<"rules" | "gemini">("rules");
  const [choices, setChoices] = useState<Choices>(() => allTailored(base));
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState<string[]>([]);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const jobSet = useMemo(() => new Set(job.skills), [job.skills]);

  const final = useMemo(() => addConfirmedSkills(assemble(base, proposal, choices), confirmed), [base, proposal, choices, confirmed]);
  const before = score(base, job.skills);
  const after = score(final, job.skills);
  const missing = before?.missing ?? [];

  const runGemini = () =>
    start(async () => {
      setError(undefined);
      const res = await tailorWithAI(jobId, baseId);
      if (res.error || !res.proposal) return setError(res.error ?? "Something went wrong.");
      setProposal(res.proposal);
      setWarnings(res.warnings ?? []);
      setNotes(res.notes ?? []);
      setChoices(allTailored(base));
      setMethod("gemini");
    });

  const setExp = (i: number, v: boolean) => setChoices((c) => ({ ...c, experience: c.experience.map((x, j) => (j === i ? v : x)) }));
  const setProj = (i: number, v: boolean) => setChoices((c) => ({ ...c, projects: c.projects.map((x, j) => (j === i ? v : x)) }));
  const projByName = new Map(proposal.projects.map((p) => [p.name, p]));

  return (
    <div className="space-y-6 pb-24">
      <Card>
        <div className="flex flex-wrap items-end justify-between gap-4">
          {bases.length > 1 ? (
            <label className="text-sm">
              <span className="mb-1 block text-xs font-medium text-fg-muted">Start from</span>
              <Select className="w-auto" value={baseId} onChange={(e) => router.replace(`/jobs/${jobId}/tailor?base=${e.target.value}`)}>
                {bases.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
              </Select>
            </label>
          ) : (
            <p className="text-sm">Starting from <span className="font-medium">{bases[0].title}</span></p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <ScoreCard label="Skills match before" value={before?.score} />
            <ScoreCard label="After" value={after?.score} />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border pt-4">
          <span className="text-sm text-fg-muted">Current proposal: <span className="font-medium text-fg">{method === "gemini" ? "Gemini rewrite" : "Rule-based reordering"}</span></span>
          <div className="ml-auto flex flex-wrap gap-2">
            {method === "gemini" && (
              <Button variant="ghost" onClick={() => { setProposal(rulesProposal); setMethod("rules"); setWarnings([]); setNotes([]); setChoices(allTailored(base)); }}>
                Back to rule-based
              </Button>
            )}
            {geminiOn ? (
              <Button onClick={runGemini} disabled={pending}>{pending ? "Gemini is rewriting… (10–30s)" : method === "gemini" ? "Regenerate with Gemini" : "✨ Tailor with Gemini"}</Button>
            ) : (
              <span className="text-xs text-fg-muted">Add GEMINI_API_KEY to enable AI rewriting.</span>
            )}
          </div>
        </div>
        {job.descriptionLength < 500 && <div className="mt-3"><Alert tone="warning">This job&apos;s description is short, so tailoring has little to work with.</Alert></div>}
        {error && <div className="mt-3"><Alert>{error}</Alert></div>}
      </Card>

      {(missing.length > 0 || before?.matched.length) && (
        <Card>
          <h3 className="font-semibold">Job keywords</h3>
          {before && before.matched.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">{before.matched.map((s) => <Badge key={s} tone="success">✓ {s}</Badge>)}</div>
          )}
          {missing.length > 0 && (
            <>
              <p className="mt-4 text-sm text-fg-muted">Not on your resume. Tick only the ones you genuinely have, and they&apos;ll be added under “Additional skills”:</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {missing.map((s) => (
                  <label key={s} className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-sm ${confirmed.includes(s) ? "border-accent bg-accent/10" : "border-border"}`}>
                    <input type="checkbox" className="sr-only" checked={confirmed.includes(s)} onChange={(e) => setConfirmed((c) => (e.target.checked ? [...c, s] : c.filter((x) => x !== s)))} />
                    {confirmed.includes(s) ? "✓ " : "+ "}{s}
                  </label>
                ))}
              </div>
            </>
          )}
        </Card>
      )}

      {(warnings.length > 0 || notes.length > 0) && (
        <Card>
          {warnings.length > 0 && (
            <>
              <h3 className="font-semibold">Please check</h3>
              <ul className="mt-2 space-y-1 text-sm">{warnings.map((w, i) => <li key={i}><span className="font-medium">{w.section}:</span> {w.message}</li>)}</ul>
            </>
          )}
          {notes.length > 0 && (
            <>
              <h3 className={`font-semibold ${warnings.length ? "mt-4" : ""}`}>Suggestions from Gemini</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-fg-muted">{notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
            </>
          )}
        </Card>
      )}

      <Block
        title="Headline & summary"
        on={choices.summary}
        setOn={(v) => setChoices((c) => ({ ...c, summary: v }))}
        same={same(base.basics, proposal.basics)}
        original={<div className="text-sm"><p className="font-medium">{base.basics.headline}</p><p className="mt-1 text-fg-muted">{base.basics.summary ?? "No summary."}</p></div>}
        tailored={<div className="text-sm"><p className="font-medium">{proposal.basics.headline}</p><p className="mt-1">{proposal.basics.summary}</p></div>}
      />

      {base.experience.map((e, i) => (
        <Block
          key={i}
          title={`${e.title} · ${e.company}`}
          on={choices.experience[i]}
          setOn={(v) => setExp(i, v)}
          same={same(e.bullets, proposal.experience[i]?.bullets)}
          original={<Bullets items={e.bullets} highlight={jobSet} />}
          tailored={<Bullets items={proposal.experience[i]?.bullets ?? []} compare={e.bullets} highlight={jobSet} />}
        />
      ))}

      {base.projects.map((p, i) => {
        const t = projByName.get(p.name);
        return (
          <Block
            key={i}
            title={`Project: ${p.name}`}
            on={choices.projects[i]}
            setOn={(v) => setProj(i, v)}
            same={same(p.bullets, t?.bullets)}
            original={<Bullets items={p.bullets} highlight={jobSet} />}
            tailored={<Bullets items={t?.bullets ?? []} compare={p.bullets} highlight={jobSet} />}
          />
        );
      })}

      <Block
        title="Skills"
        on={choices.skills}
        setOn={(v) => setChoices((c) => ({ ...c, skills: v }))}
        same={same(base.skills, proposal.skills)}
        original={<div className="space-y-1 text-sm">{base.skills.map((s, i) => <p key={i}><span className="font-medium">{s.category}:</span> {s.items.join(", ")}</p>)}</div>}
        tailored={<div className="space-y-1 text-sm">{proposal.skills.map((s, i) => <p key={i}><span className="font-medium">{s.category}:</span> {s.items.join(", ")}</p>)}</div>}
      />

      <div className="fixed inset-x-0 bottom-[calc(57px+env(safe-area-inset-bottom))] z-10 md:bottom-0 border-t border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-end gap-3 px-4 py-3 md:px-8">
          <span className="text-sm text-fg-muted">Saved as a new tailored resume; your master stays unchanged.</span>
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await saveTailored({ jobId, baseResumeId: baseId, content: final, method, scoreBefore: before?.score ?? null, scoreAfter: after?.score ?? null });
                if (r?.error) setError(r.error);
              })
            }
          >
            Save tailored resume
          </Button>
        </div>
      </div>
    </div>
  );
}

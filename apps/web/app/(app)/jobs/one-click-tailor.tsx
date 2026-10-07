"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import type { AutoTailorResult } from "@/lib/tailor/auto";
import { oneClickTailor } from "./actions";

type Existing = { resumeId: string; scoreBefore: number | null; scoreAfter: number | null } | null;

export function OneClickTailor({ jobId, existing }: { jobId: string; existing: Existing }) {
  const [result, setResult] = useState<AutoTailorResult | null>(existing ? { ok: true, reused: true, method: "rules", ...existing } : null);
  const [pending, start] = useTransition();
  const run = (force: boolean) => start(async () => setResult(await oneClickTailor(jobId, force)));

  if (pending) return <p className="text-sm text-fg-muted">⚡ Tailoring your resume… (up to ~30s with Gemini)</p>;
  if (!result) return <Button onClick={() => run(false)}>⚡ One-click tailor</Button>;
  if (!result.ok) return <p className="text-sm text-danger">{result.error}</p>;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <span className="font-medium text-success">
        ✓ Tailored{result.scoreBefore != null ? ` (${result.scoreBefore}% → ${result.scoreAfter}%)` : ""}
      </span>
      <a href={`/api/resumes/${result.resumeId}/export?format=pdf`} className="font-medium text-accent hover:underline">Download PDF</a>
      <Link href={`/resumes/${result.resumeId}`} className="text-accent hover:underline">Edit</Link>
      <button type="button" onClick={() => run(true)} className="text-fg-muted hover:text-fg">Re-tailor</button>
      {"note" in result && result.note && <span className="basis-full text-xs text-fg-muted">{result.note}</span>}
    </div>
  );
}

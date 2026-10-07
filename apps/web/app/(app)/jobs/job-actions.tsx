"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { hideJob, markApplied, saveJob, unsaveJob } from "./actions";

export function JobActions({ jobId, url, status }: { jobId: string; url: string; status: string | null }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="flex flex-wrap gap-2">
      {url && (
        <a
          href={`/go/${jobId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-accent-fg hover:opacity-90"
        >
          Open & apply ↗
        </a>
      )}
      <a href={`/jobs/${jobId}/tailor`} className="inline-flex items-center rounded-lg border border-border bg-surface px-3.5 py-2 text-sm font-medium hover:bg-muted">
        Review & tailor
      </a>
      {status === null && (
        <Button variant="secondary" disabled={pending} onClick={() => start(() => saveJob(jobId))}>Save</Button>
      )}
      {status === "saved" && (
        <Button variant="secondary" disabled={pending} onClick={() => start(() => unsaveJob(jobId))}>Unsave</Button>
      )}
      {(status === null || status === "saved") && (
        <Button variant="secondary" disabled={pending} onClick={() => start(() => markApplied(jobId))}>Mark applied</Button>
      )}
      <Button
        variant="ghost"
        disabled={pending}
        onClick={() =>
          start(async () => {
            await hideJob(jobId);
            const p = new URLSearchParams(window.location.search);
            p.delete("job");
            router.replace(`/jobs?${p}`);
          })
        }
      >
        Not interested
      </Button>
    </div>
  );
}

"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui";
import { finishQueued, moveQueued, queueJobs, removeQueued } from "./actions";

export function QueueItemControls({ id, jobId, first, last }: { id: string; jobId: string; first: boolean; last: boolean }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Button variant="ghost" disabled={pending || first} onClick={() => start(() => moveQueued(id, -1))} aria-label="Move up">↑</Button>
      <Button variant="ghost" disabled={pending || last} onClick={() => start(() => moveQueued(id, 1))} aria-label="Move down">↓</Button>
      <Button variant="secondary" disabled={pending} onClick={() => start(() => finishQueued(id, jobId, "done"))}>Mark applied</Button>
      <Button variant="ghost" disabled={pending} onClick={() => start(() => finishQueued(id, jobId, "skipped"))}>Skip</Button>
      <Button variant="danger" disabled={pending} onClick={() => start(() => removeQueued(id))}>Remove</Button>
    </div>
  );
}

export function AddToQueue({ jobIds, label = "Add to apply queue", variant = "secondary", onDone }: { jobIds: string[]; label?: string; variant?: "primary" | "secondary"; onDone?: () => void }) {
  const [pending, start] = useTransition();
  return (
    <Button variant={variant} disabled={pending || !jobIds.length} onClick={() => start(async () => { await queueJobs(jobIds); onDone?.(); })}>
      {pending ? "Adding…" : label}
    </Button>
  );
}

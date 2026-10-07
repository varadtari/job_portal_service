"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/auth";
import { markJobApplied } from "@/lib/ext/applications";
import { enqueue, moveInQueue, removeFromQueue, setQueueStatus } from "@/lib/queue";

const refresh = () => {
  revalidatePath("/queue");
  revalidatePath("/jobs");
};

export async function queueJobs(jobIds: string[]): Promise<{ added: number }> {
  const userId = await requireUserId();
  const added = await enqueue(userId, jobIds.slice(0, 200));
  refresh();
  return { added };
}

export async function removeQueued(id: string) {
  const userId = await requireUserId();
  await removeFromQueue(userId, id);
  refresh();
}

export async function moveQueued(id: string, dir: -1 | 1) {
  const userId = await requireUserId();
  await moveInQueue(userId, id, dir);
  refresh();
}

/** Manual mode (e.g. on a phone without the extension): mark an item applied or skipped. */
export async function finishQueued(id: string, jobId: string, outcome: "done" | "skipped") {
  const userId = await requireUserId();
  await setQueueStatus(userId, id, outcome);
  if (outcome === "done") await markJobApplied(userId, jobId);
  refresh();
  revalidatePath("/applications");
}

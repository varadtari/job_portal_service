import { and, asc, eq, inArray, max, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";

const q = schema.applyQueue;
const j = schema.jobs;

/** Appends jobs to the end of the queue (already queued jobs keep their place; finished ones are re-queued). */
export async function enqueue(userId: string, jobIds: string[]): Promise<number> {
  if (!jobIds.length) return 0;
  const [{ top }] = await db().select({ top: max(q.position) }).from(q).where(eq(q.userId, userId));
  let pos = (top ?? 0) + 1;
  let added = 0;
  for (const jobId of [...new Set(jobIds)]) {
    const rows = await db()
      .insert(q)
      .values({ userId, jobId, position: pos })
      .onConflictDoUpdate({ target: [q.userId, q.jobId], set: { status: "queued", position: sql`case when ${q.status} in ('done','skipped') then ${pos} else ${q.position} end` } })
      .returning({ id: q.id });
    if (rows.length) {
      added++;
      pos++;
    }
  }
  return added;
}

export async function listQueue(userId: string, statuses: ("queued" | "active" | "done" | "skipped")[] = ["queued", "active"]) {
  return db()
    .select({ id: q.id, jobId: q.jobId, position: q.position, status: q.status, title: j.title, company: j.company, location: j.location, url: j.url, updatedAt: q.updatedAt })
    .from(q)
    .innerJoin(j, eq(q.jobId, j.id))
    .where(and(eq(q.userId, userId), inArray(q.status, statuses)))
    .orderBy(asc(q.position));
}

export async function setQueueStatus(userId: string, id: string, status: "queued" | "active" | "done" | "skipped") {
  const [row] = await db().update(q).set({ status }).where(and(eq(q.id, id), eq(q.userId, userId))).returning();
  return row ?? null;
}

export async function removeFromQueue(userId: string, id: string) {
  await db().delete(q).where(and(eq(q.id, id), eq(q.userId, userId)));
}

/** Swaps an item with its neighbour (dir -1 = up, +1 = down) among pending items. */
export async function moveInQueue(userId: string, id: string, dir: -1 | 1) {
  const items = await listQueue(userId);
  const i = items.findIndex((x) => x.id === id);
  const k = i + dir;
  if (i < 0 || k < 0 || k >= items.length) return;
  await db().transaction(async (tx) => {
    await tx.update(q).set({ position: items[k].position }).where(eq(q.id, items[i].id));
    await tx.update(q).set({ position: items[i].position }).where(eq(q.id, items[k].id));
  });
}

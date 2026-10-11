// Recalculates an application's status from its timeline (used when an email is moved off it).
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { nextStatus, type EmailType, type Status } from "@/lib/gmail/classify";

type Ev = { type: string; subject: string | null; occurredAt: Date };

const STATUS_WORDS: Status[] = ["saved", "applied", "oa", "interview", "offer", "rejected", "ghosted"];

/** Folds email events in date order; a manual status change wins until a later email moves it on. */
export function statusFromEvents(events: Ev[], base: Status): Status {
  let status = base;
  for (const e of [...events].sort((x, y) => x.occurredAt.getTime() - y.occurredAt.getTime())) {
    if (e.type === "manual") {
      const set = e.subject?.match(/^Status changed to (\w+)$/)?.[1] as Status | undefined;
      if (set && STATUS_WORDS.includes(set)) status = set;
      continue;
    }
    status = nextStatus(status, e.type as EmailType);
  }
  return status;
}

export async function recomputeStatus(applicationId: string): Promise<Status | null> {
  const a = schema.applications;
  const ev = schema.applicationEvents;
  const [app] = await db().select().from(a).where(eq(a.id, applicationId));
  if (!app) return null;
  const events = await db().select({ type: ev.type, subject: ev.subject, occurredAt: ev.occurredAt }).from(ev).where(and(eq(ev.applicationId, applicationId))).orderBy(asc(ev.occurredAt));
  const status = statusFromEvents(events, app.appliedAt ? "applied" : "saved");
  const emails = events.filter((e) => e.type !== "manual");
  const lastEmailAt = emails.length ? emails[emails.length - 1].occurredAt : null;
  await db().update(a).set({ status, lastEmailAt }).where(eq(a.id, applicationId));
  return status;
}

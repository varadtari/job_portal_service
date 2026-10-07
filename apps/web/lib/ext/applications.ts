import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { parseBoardUrl } from "@/lib/jobs/sources/url";
import { storeJobsForUser } from "@/lib/jobs/sync";

/** Strips tracking params, hashes and "/apply"-style suffixes so job and application URLs compare equal. */
export function canonicalUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.hash = "";
    for (const k of [...u.searchParams.keys()]) if (/^(utm_|gh_src|source|ref|lever-|src)/i.test(k)) u.searchParams.delete(k);
    u.pathname = u.pathname.replace(/\/(apply|application|applications)\/?$/i, "").replace(/\/$/, "");
    return u.toString();
  } catch {
    return raw;
  }
}

/** Finds the user's job for a page URL: board job ids first, then canonical URL equality. */
export async function findJobForUrl(userId: string, url: string) {
  const board = parseBoardUrl(url);
  const greenhouseId = (() => {
    try {
      return new URL(url).searchParams.get("gh_jid");
    } catch {
      return null;
    }
  })();
  const rows = await db()
    .select({ id: schema.jobs.id, url: schema.jobs.url, externalId: schema.jobs.externalId, source: schema.jobs.source })
    .from(schema.userJobs)
    .innerJoin(schema.jobs, eq(schema.userJobs.jobId, schema.jobs.id))
    .where(eq(schema.userJobs.userId, userId));
  const target = canonicalUrl(url);
  return (
    rows.find((r) => board && r.source === board.ats && r.externalId === `${board.slug}:${board.jobId}`) ??
    rows.find((r) => greenhouseId && r.source === "greenhouse" && r.externalId.endsWith(`:${greenhouseId}`)) ??
    rows.find((r) => canonicalUrl(r.url) === target) ??
    null
  );
}

/** Marks the job at `url` as applied, creating a manual job if it isn't in JobPilot yet. */
export async function logApplication(userId: string, page: { url: string; title: string; company: string }) {
  let job = await findJobForUrl(userId, page.url);
  if (!job) {
    await storeJobsForUser(userId, [
      {
        source: "manual",
        externalId: canonicalUrl(page.url),
        company: page.company || new URL(page.url).hostname.replace(/^www\./, ""),
        title: page.title || "Untitled role",
        location: null,
        remote: false,
        salary: null,
        description: "",
        url: page.url,
        postedAt: null,
      },
    ]);
    job = await findJobForUrl(userId, page.url);
  }
  if (!job) return null;
  return markJobApplied(userId, job.id);
}

/** Marks a known job as applied (creates the application if needed; never moves a later stage backwards). */
export async function markJobApplied(userId: string, jobId: string) {
  const [j] = await db().select().from(schema.jobs).where(eq(schema.jobs.id, jobId));
  if (!j) return null;
  const [existing] = await db()
    .select()
    .from(schema.applications)
    .where(and(eq(schema.applications.userId, userId), eq(schema.applications.jobId, j.id)));
  if (existing && existing.status !== "saved") return { company: j.company, title: j.title, status: existing.status, isNew: false };
  if (existing) {
    await db().update(schema.applications).set({ status: "applied", appliedAt: new Date() }).where(eq(schema.applications.id, existing.id));
  } else {
    await db()
      .insert(schema.applications)
      .values({ userId, jobId: j.id, company: j.company, title: j.title, url: j.url, status: "applied", appliedAt: new Date() })
      .onConflictDoNothing();
  }
  return { company: j.company, title: j.title, status: "applied" as const, isNew: true };
}


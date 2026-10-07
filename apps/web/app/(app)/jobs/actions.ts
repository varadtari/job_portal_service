"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getUser, requireUserId } from "@/auth";
import { db, schema } from "@/lib/db";
import { importJobFromUrl, parseBoardUrl } from "@/lib/jobs/sources/url";
import { BOARD_FETCHERS, storeJobsForUser, syncUserJobs } from "@/lib/jobs/sync";
import { ATS_LABEL, type Ats, type NormalizedJob } from "@/lib/jobs/types";
import { SourceNotFoundError } from "@/lib/jobs/text";
import { LEVELS } from "@/lib/jobs/seniority";
import { autoTailor, type AutoTailorResult } from "@/lib/tailor/auto";

export type State = { ok?: string; error?: string } | undefined;

// ---------- Jobs ----------

async function upsertApplication(userId: string, jobId: string, status: "saved" | "applied") {
  const [job] = await db().select().from(schema.jobs).where(eq(schema.jobs.id, jobId));
  if (!job) return;
  const [existing] = await db()
    .select()
    .from(schema.applications)
    .where(and(eq(schema.applications.userId, userId), eq(schema.applications.jobId, jobId)));
  if (existing) {
    // Never move an application backwards (e.g. from interview to saved)
    if (existing.status === "saved" && status === "applied") {
      await db().update(schema.applications).set({ status, appliedAt: new Date() }).where(eq(schema.applications.id, existing.id));
    }
    return;
  }
  await db().insert(schema.applications).values({
    userId,
    jobId,
    company: job.company,
    title: job.title,
    url: job.url,
    status,
    appliedAt: status === "applied" ? new Date() : null,
  }).onConflictDoNothing();
}

export async function saveJob(jobId: string) {
  const userId = await requireUserId();
  await upsertApplication(userId, jobId, "saved");
  revalidatePath("/jobs");
}

export async function markApplied(jobId: string) {
  const userId = await requireUserId();
  await upsertApplication(userId, jobId, "applied");
  revalidatePath("/jobs");
}

export async function unsaveJob(jobId: string) {
  const userId = await requireUserId();
  await db()
    .delete(schema.applications)
    .where(and(eq(schema.applications.userId, userId), eq(schema.applications.jobId, jobId), eq(schema.applications.status, "saved")));
  revalidatePath("/jobs");
}

export async function hideJob(jobId: string) {
  const userId = await requireUserId();
  await db()
    .update(schema.userJobs)
    .set({ hidden: true })
    .where(and(eq(schema.userJobs.userId, userId), eq(schema.userJobs.jobId, jobId)));
  revalidatePath("/jobs");
}

export async function addJobFromUrl(_: State, form: FormData): Promise<State> {
  const userId = await requireUserId();
  const url = String(form.get("url") ?? "").trim();
  if (!/^https?:\/\//.test(url)) return { error: "Enter a full URL starting with https://" };
  let job: NormalizedJob;
  try {
    job = await importJobFromUrl(url);
  } catch (e) {
    return { error: (e as Error).message };
  }
  return addJob(userId, job);
}

export async function addJobManually(_: State, form: FormData): Promise<State> {
  const userId = await requireUserId();
  const get = (k: string) => String(form.get(k) ?? "").trim();
  const [title, company, url, description] = [get("title"), get("company"), get("url"), get("description")];
  if (!title || !company) return { error: "Title and company are required." };
  return addJob(userId, {
    source: "manual",
    externalId: url || `${company}|${title}|${Date.now()}`,
    company,
    title,
    location: get("location") || null,
    remote: form.get("remote") === "on",
    salary: null,
    description,
    url: url || "",
    postedAt: new Date(),
  });
}

async function addJob(userId: string, job: NormalizedJob): Promise<never> {
  await storeJobsForUser(userId, [job]);
  const [row] = await db()
    .select({ id: schema.jobs.id })
    .from(schema.jobs)
    .where(and(eq(schema.jobs.source, job.source), eq(schema.jobs.externalId, job.externalId)));
  // A previously hidden job becomes visible again when added explicitly
  await db().update(schema.userJobs).set({ hidden: false }).where(and(eq(schema.userJobs.userId, userId), eq(schema.userJobs.jobId, row.id)));
  revalidatePath("/jobs");
  redirect(`/jobs?job=${row.id}`);
}

// ---------- Sources ----------

export async function addSearch(_: State, form: FormData): Promise<State> {
  const userId = await requireUserId();
  const query = String(form.get("query") ?? "").trim();
  if (!query) return { error: "Enter job title keywords." };
  await db().insert(schema.savedSearches).values({
    userId,
    query,
    location: String(form.get("location") ?? "").trim() || null,
    remoteOnly: form.get("remoteOnly") === "on",
  });
  revalidatePath("/jobs/sources");
  return { ok: "Search added." };
}

export async function deleteSearch(id: string) {
  const userId = await requireUserId();
  await db().delete(schema.savedSearches).where(and(eq(schema.savedSearches.id, id), eq(schema.savedSearches.userId, userId)));
  revalidatePath("/jobs/sources");
}

function slugCandidates(input: string): { ats?: Ats; slug: string }[] {
  const board = parseBoardUrl(input.includes("://") ? input : `https://${input}`);
  if (board) return [{ ats: board.ats, slug: board.slug }];
  // Board root URLs like jobs.lever.co/cred or boards.greenhouse.io/stripe
  const m = input.match(/(greenhouse\.io|lever\.co|ashbyhq\.com)\/([^/?#]+)/);
  if (m) {
    const ats: Ats = m[1].startsWith("greenhouse") ? "greenhouse" : m[1].startsWith("lever") ? "lever" : "ashby";
    return [{ ats, slug: m[2] }];
  }
  const base = input.toLowerCase().trim();
  return [...new Set([base.replace(/[^a-z0-9]/g, ""), base.replace(/[^a-z0-9]+/g, "-"), base.replace(/[^a-z0-9]+/g, "")])]
    .filter(Boolean)
    .map((slug) => ({ slug }));
}

export type DetectState = { error?: string; found?: { ats: Ats; slug: string; company: string; count: number }[] } | undefined;

/** Looks for the company's public job board on Greenhouse, Lever and Ashby. */
export async function detectBoards(_: DetectState, form: FormData): Promise<DetectState> {
  await requireUserId();
  const input = String(form.get("company") ?? "").trim();
  if (!input) return { error: "Enter a company name or careers URL." };
  const name = input.includes(".") ? undefined : input;
  const checks = slugCandidates(input).flatMap(({ ats, slug }) =>
    (ats ? [ats] : (Object.keys(BOARD_FETCHERS) as Ats[])).map(async (a) => {
      try {
        const { company, total } = await BOARD_FETCHERS[a](slug, name, () => false);
        return { ats: a, slug, company, count: total };
      } catch (e) {
        if (!(e instanceof SourceNotFoundError)) console.error(e);
        return null;
      }
    }),
  );
  const found = (await Promise.all(checks)).filter((x) => x !== null);
  const unique = [...new Map(found.map((f) => [`${f.ats}:${f.slug}`, f])).values()];
  if (!unique.length) {
    return {
      error: `No Greenhouse, Lever or Ashby board found for “${input}”. Open the company's careers page, click a job, and paste that URL here instead.`,
    };
  }
  return { found: unique };
}

export async function addCompany(ats: Ats, slug: string, name: string): Promise<State> {
  const userId = await requireUserId();
  await db().insert(schema.trackedCompanies).values({ userId, ats, slug, name }).onConflictDoNothing();
  revalidatePath("/jobs/sources");
  return { ok: `Tracking ${name} on ${ATS_LABEL[ats]}.` };
}

export async function deleteCompany(id: string) {
  const userId = await requireUserId();
  await db().delete(schema.trackedCompanies).where(and(eq(schema.trackedCompanies.id, id), eq(schema.trackedCompanies.userId, userId)));
  revalidatePath("/jobs/sources");
}

export async function syncNow(): Promise<State> {
  const userId = await requireUserId();
  const user = await getUser(userId);
  if (user?.jobsSyncedAt && Date.now() - user.jobsSyncedAt.getTime() < 60_000) {
    return { error: "Synced less than a minute ago. Try again shortly." };
  }
  const { added, report } = await syncUserJobs(userId);
  revalidatePath("/jobs");
  revalidatePath("/jobs/sources");
  const failed = report.filter((r) => r.error).length;
  return { ok: `Sync complete: ${added} new job${added === 1 ? "" : "s"}${failed ? `, ${failed} source(s) failed` : ""}.` };
}

export async function setItOnly(itOnly: boolean) {
  const userId = await requireUserId();
  await db().update(schema.users).set({ itOnly }).where(eq(schema.users.id, userId));
  revalidatePath("/jobs/sources");
}

export async function setSourceEnabled(key: string, on: boolean) {
  const userId = await requireUserId();
  const user = await getUser(userId);
  if (!user) return;
  const disabled = new Set(user.disabledSources);
  if (on) disabled.delete(key);
  else disabled.add(key);
  await db().update(schema.users).set({ disabledSources: [...disabled] }).where(eq(schema.users.id, userId));
  revalidatePath("/jobs/sources");
}

export async function setExperienceLevel(level: string) {
  const userId = await requireUserId();
  if (!LEVELS.some((l) => l.key === level)) return;
  await db().update(schema.users).set({ experienceLevel: level }).where(eq(schema.users.id, userId));
  revalidatePath("/jobs/sources");
}

// ---------- One-click & bulk ----------

export async function oneClickTailor(jobId: string, force = false): Promise<AutoTailorResult> {
  const userId = await requireUserId();
  const r = await autoTailor(userId, jobId, { force });
  revalidatePath("/resumes");
  return r;
}

export async function saveJobs(jobIds: string[]) {
  const userId = await requireUserId();
  for (const id of jobIds.slice(0, 200)) await upsertApplication(userId, id, "saved");
  revalidatePath("/jobs");
}

export async function hideJobs(jobIds: string[]) {
  const userId = await requireUserId();
  if (!jobIds.length) return;
  await db()
    .update(schema.userJobs)
    .set({ hidden: true })
    .where(and(eq(schema.userJobs.userId, userId), inArray(schema.userJobs.jobId, jobIds.slice(0, 500))));
  revalidatePath("/jobs");
}

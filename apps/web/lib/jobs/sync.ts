import { createHash } from "node:crypto";
import { and, eq, lt, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { SyncReport } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { extractSkills } from "@/lib/match/skills";
import { DIRECTORY } from "./directory";
import { detectCountry } from "./regions";
import { keepBoardJob, matchesSearch, queryAlternatives, roleOk, type RolePrefs, type SearchSpec } from "./filter";
import type { Level } from "./seniority";
import type { BoardResult, Keep } from "./sources/board";
import { importJobAlerts } from "@/lib/gmail/alerts-sync";
import { fetchHimalayas, fetchJobicy, fetchRemotive } from "./sources/remote-boards";
import { fetchAdzuna } from "./sources/adzuna";
import { fetchAshby } from "./sources/ashby";
import { fetchGreenhouse } from "./sources/greenhouse";
import { fetchJSearch } from "./sources/jsearch";
import { fetchLever } from "./sources/lever";
import { ATS_LABEL, type Ats, type NormalizedJob } from "./types";

export const BOARD_FETCHERS: Record<Ats, (slug: string, name?: string, keep?: Keep) => Promise<BoardResult>> = {
  greenhouse: fetchGreenhouse,
  lever: fetchLever,
  ashby: fetchAshby,
};

/** Sources every search runs on. Users can switch any off on the Sources page. */
export const SEARCH_SOURCES = [
  { key: "directory", name: "Company directory", note: `${DIRECTORY.length} tech companies hiring in India, scanned directly from their career boards.`, needs: null },
  { key: "email", name: "Email job alerts", note: "Jobs from Indeed, Naukri and hirist alert emails in your Gmail (filtered by your role and level settings).", needs: null },
  { key: "remotive", name: "Remotive", note: "Remote tech jobs open worldwide or to India/APAC.", needs: null },
  { key: "himalayas", name: "Himalayas", note: "Remote tech jobs open worldwide or to India/APAC.", needs: null },
  { key: "jobicy", name: "Jobicy", note: "Remote tech jobs open worldwide or to India/APAC.", needs: null },
  { key: "jsearch", name: "JSearch", note: "LinkedIn, Naukri, Indeed, Glassdoor and more via Google for Jobs. Free tier: runs at most every 12 hours.", needs: "RAPIDAPI_KEY" },
  { key: "adzuna", name: "Adzuna", note: "Job aggregator with broad India coverage.", needs: "ADZUNA_APP_ID + ADZUNA_APP_KEY" },
] as const;

export type SearchSourceKey = (typeof SEARCH_SOURCES)[number]["key"];

export function sourceConfigured(key: SearchSourceKey): boolean {
  const e = env();
  if (key === "jsearch") return !!e.RAPIDAPI_KEY;
  if (key === "adzuna") return !!(e.ADZUNA_APP_ID && e.ADZUNA_APP_KEY);
  return true;
}

export function dedupHash(j: Pick<NormalizedJob, "company" | "title" | "location">) {
  const norm = (s: string | null) => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return createHash("sha1").update(`${norm(j.company)}|${norm(j.title)}|${norm(j.location)}`).digest("hex");
}

async function pool<T>(tasks: (() => Promise<T>)[], size: number): Promise<T[]> {
  const out: T[] = new Array(tasks.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, tasks.length) }, async () => {
      while (next < tasks.length) {
        const i = next++;
        out[i] = await tasks[i]();
      }
    }),
  );
  return out;
}

/** Upserts jobs (global) and links them to the user. Returns how many were new for this user. */
export async function storeJobsForUser(userId: string, jobs: NormalizedJob[]): Promise<number> {
  const unique = [...new Map(jobs.map((j) => [`${j.source}|${j.externalId}`, j])).values()];
  let added = 0;
  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100);
    const rows = await db()
      .insert(schema.jobs)
      .values(
        chunk.map((j) => ({
          ...j,
          description: j.description.slice(0, 50000),
          skills: extractSkills(`${j.title}\n${j.description}`),
          countryCode: detectCountry(j.location),
          dedupHash: dedupHash(j),
          lastSeenAt: new Date(),
        })),
      )
      .onConflictDoUpdate({
        target: [schema.jobs.source, schema.jobs.externalId],
        set: {
          title: sql`excluded.title`,
          company: sql`excluded.company`,
          location: sql`excluded.location`,
          countryCode: sql`excluded.country_code`,
          remote: sql`excluded.remote`,
          salary: sql`excluded.salary`,
          description: sql`excluded.description`,
          skills: sql`excluded.skills`,
          url: sql`excluded.url`,
          via: sql`excluded.via`,
          dedupHash: sql`excluded.dedup_hash`,
          lastSeenAt: sql`excluded.last_seen_at`,
        },
      })
      .returning({ id: schema.jobs.id });
    const linked = await db()
      .insert(schema.userJobs)
      .values(rows.map((r) => ({ userId, jobId: r.id })))
      .onConflictDoNothing()
      .returning({ jobId: schema.userJobs.jobId });
    added += linked.length;
  }
  return added;
}

type TaskResult = { report: SyncReport[number]; jobs: NormalizedJob[] };

const errMsg = (err: unknown) => String((err as Error)?.message ?? err);

export async function syncUserJobs(userId: string): Promise<{ report: SyncReport; added: number }> {
  const [[user], searches, companies] = await Promise.all([
    db().select().from(schema.users).where(eq(schema.users.id, userId)),
    db().select().from(schema.savedSearches).where(eq(schema.savedSearches.userId, userId)),
    db().select().from(schema.trackedCompanies).where(eq(schema.trackedCompanies.userId, userId)),
  ]);
  const specs: SearchSpec[] = searches.map((s) => ({ query: s.query, location: s.location, remoteOnly: s.remoteOnly }));
  const prefs: RolePrefs = { itOnly: user?.itOnly ?? true, level: (user?.experienceLevel ?? "any") as Level };
  const enabled = (k: SearchSourceKey) => !user?.disabledSources.includes(k) && sourceConfigured(k);
  const jsearchDue = !user?.jsearchSyncedAt || Date.now() - user.jsearchSyncedAt.getTime() > 12 * 3600 * 1000;
  const keepRole = (j: NormalizedJob) => roleOk(j.title, prefs);
  const e = env();
  const tasks: (() => Promise<TaskResult>)[] = [];

  // 1. Tracked companies: everything matching the searches (or everything, if there are none)
  const tracked = new Set(companies.map((c) => `${c.ats}:${c.slug}`));
  for (const c of companies) {
    tasks.push(async () => {
      const label = `${c.name} (${ATS_LABEL[c.ats]})`;
      try {
        const r = await BOARD_FETCHERS[c.ats](c.slug, c.name, (j) => keepBoardJob(j, specs, prefs));
        return { report: { source: c.ats, label, fetched: r.total, kept: r.jobs.length }, jobs: r.jobs };
      } catch (err) {
        return { report: { source: c.ats, label, fetched: 0, kept: 0, error: errMsg(err) }, jobs: [] };
      }
    });
  }

  // 2. Company directory: only jobs matching a search
  if (specs.length && enabled("directory")) {
    tasks.push(async () => {
      const boards = DIRECTORY.filter((d) => !tracked.has(`${d.ats}:${d.slug}`));
      const results = await pool(
        boards.map((d) => () => BOARD_FETCHERS[d.ats](d.slug, d.name, (j) => keepBoardJob(j, specs, prefs)).catch(() => null)),
        8,
      );
      const ok = results.filter((r) => r !== null);
      const failed = results.length - ok.length;
      return {
        report: {
          source: "directory",
          label: `Company directory (${ok.length}/${boards.length} boards${failed ? `, ${failed} unreachable` : ""})`,
          fetched: ok.reduce((n, r) => n + r.total, 0),
          kept: ok.reduce((n, r) => n + r.jobs.length, 0),
          ...(ok.length === 0 && boards.length ? { error: "No boards reachable" } : {}),
        },
        jobs: ok.flatMap((r) => r.jobs),
      };
    });
  }

  // 3. Query-based sources, once per search
  for (const s of specs) {
    const label = `“${s.query}”${s.location ? ` in ${s.location}` : ""}${s.remoteOnly ? " (remote)" : ""}`;
    const run = (source: SearchSourceKey, fetch: () => Promise<NormalizedJob[]>, keep: (j: NormalizedJob) => boolean) =>
      tasks.push(async () => {
        try {
          const all = await fetch();
          const jobs = all.filter((j) => keep(j) && keepRole(j));
          return { report: { source, label, fetched: all.length, kept: jobs.length }, jobs };
        } catch (err) {
          return { report: { source, label, fetched: 0, kept: 0, error: errMsg(err) }, jobs: [] };
        }
      });
    // Remote boards: one query per alternative ("backend engineer, sde" → 2 queries), then title/region filter
    const alts = queryAlternatives(s.query).slice(0, 3).map((w) => w.join(" "));
    const remoteKeep = (j: NormalizedJob) => matchesSearch(j, { ...s, location: s.location });
    const many = (f: (q: string) => Promise<NormalizedJob[]>) => async () => (await Promise.all(alts.map(f))).flat();
    if (enabled("remotive")) run("remotive", many(fetchRemotive), remoteKeep);
    if (enabled("himalayas")) run("himalayas", many(fetchHimalayas), remoteKeep);
    if (enabled("jobicy")) run("jobicy", many(fetchJobicy), remoteKeep);
    // Aggregators already search by query + location
    const aggKeep = (j: NormalizedJob) => !s.remoteOnly || j.remote;
    if (enabled("jsearch") && jsearchDue) run("jsearch", () => fetchJSearch(e.RAPIDAPI_KEY!, s), aggKeep);
    if (enabled("adzuna")) run("adzuna", () => fetchAdzuna(e.ADZUNA_APP_ID!, e.ADZUNA_APP_KEY!, s), aggKeep);
  }

  const results = await pool(tasks, 4);
  let added = await storeJobsForUser(userId, results.flatMap((r) => r.jobs));
  const report = results.map((r) => r.report);
  // Job-alert emails (Gmail); stored by importJobAlerts itself
  if (!user?.disabledSources.includes("email") && user?.googleRefreshTokenEnc) {
    const label = "Indeed / Naukri / hirist alert emails";
    try {
      const a = await importJobAlerts(userId);
      if (a) {
        report.push({ source: "email", label, fetched: a.found, kept: a.kept });
        added += a.added;
      }
    } catch (err) {
      report.push({ source: "email", label, fetched: 0, kept: 0, error: errMsg(err) });
    }
  }
  const ranJSearch = report.some((r) => r.source === "jsearch" && !r.error);
  await db()
    .update(schema.users)
    .set({ jobsSyncedAt: new Date(), jobsSyncReport: report, ...(ranJSearch ? { jsearchSyncedAt: new Date() } : {}) })
    .where(eq(schema.users.id, userId));
  return { report, added };
}

/** Deletes jobs no source has returned for 45 days, unless an application references them. */
export async function deleteStaleJobs(): Promise<number> {
  const cutoff = new Date(Date.now() - 45 * 24 * 3600 * 1000);
  const referenced = db().select({ id: schema.applications.jobId }).from(schema.applications).where(sql`${schema.applications.jobId} is not null`);
  const deleted = await db()
    .delete(schema.jobs)
    .where(and(lt(schema.jobs.lastSeenAt, cutoff), sql`${schema.jobs.id} not in ${referenced}`))
    .returning({ id: schema.jobs.id });
  return deleted.length;
}


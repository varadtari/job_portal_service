"use server";

import { and, eq } from "drizzle-orm";
import { requireUserId } from "@/auth";
import { db, schema } from "@/lib/db";
import { parseShared } from "@/lib/jobs/share";
import { importJobFromUrl } from "@/lib/jobs/sources/url";
import { storeJobsForUser } from "@/lib/jobs/sync";
import type { NormalizedJob } from "@/lib/jobs/types";

/** Adds a job shared from another app. Imports full details when the page allows, otherwise uses the share text. */
export async function addSharedJob(input: { title?: string; text?: string; url?: string }): Promise<{ jobId?: string; error?: string; imported?: boolean }> {
  const userId = await requireUserId();
  const s = parseShared(input);
  if (!s.url && !s.title) return { error: "Nothing to add: the share didn't include a link or a job title." };

  let job: NormalizedJob | null = null;
  if (s.url) job = await importJobFromUrl(s.url).catch(() => null);
  const imported = !!job;
  job ??= {
    source: "manual",
    externalId: s.url ?? `${s.company}|${s.title}|${Date.now()}`,
    company: s.company ?? (s.url ? new URL(s.url).hostname.replace(/^(www|in|m)\./, "").split(".")[0] : "Unknown company"),
    title: s.title ?? "Shared job",
    location: null,
    remote: false,
    salary: null,
    description: [input.text, "", "(Shared from your phone. Open the posting for the full description.)"].filter((x) => x !== undefined).join("\n").trim(),
    url: s.url ?? "",
    postedAt: new Date(),
  };
  await storeJobsForUser(userId, [job]);
  const [row] = await db().select({ id: schema.jobs.id }).from(schema.jobs).where(and(eq(schema.jobs.source, job.source), eq(schema.jobs.externalId, job.externalId)));
  if (!row) return { error: "Couldn't save the job." };
  await db().update(schema.userJobs).set({ hidden: false }).where(and(eq(schema.userJobs.userId, userId), eq(schema.userJobs.jobId, row.id)));
  return { jobId: row.id, imported };
}

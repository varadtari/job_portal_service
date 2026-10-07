// Live sync against real company boards using a throwaway user (cleaned up afterwards).
import { config } from "dotenv";
import { afterAll, beforeAll, expect, it } from "vitest";

config({ path: ".env.local", quiet: true });

let userId: string;
let mod: typeof import("@/lib/jobs/sync");
let dbm: typeof import("@/lib/db");

beforeAll(async () => {
  dbm = await import("@/lib/db");
  mod = await import("@/lib/jobs/sync");
  const { db, schema } = dbm;
  const [u] = await db().insert(schema.users).values({ email: `itest+${Date.now()}@jobpilot.local` }).returning();
  userId = u.id;
  await db().insert(schema.savedSearches).values({ userId, query: "software engineer, sde, backend", location: "Bengaluru", remoteOnly: false });
  await db().insert(schema.trackedCompanies).values([
    { userId, ats: "greenhouse", slug: "this-board-does-not-exist-xyz", name: "Missing" },
  ]);
});

afterAll(async () => {
  const { db, schema } = dbm;
  const { sql } = await import("drizzle-orm");
  await db().delete(schema.users).where(sql`${schema.users.id} = ${userId}`);
  // Remove jobs that no user links to any more (only those this test created)
  await db().execute(sql`delete from jobs j where not exists (select 1 from user_jobs u where u.job_id = j.id) and not exists (select 1 from applications a where a.job_id = j.id)`);
});

it("runs a search on every free source, keeps IT roles only, reports failures, and is idempotent", async () => {
  const t0 = Date.now();
  const first = await mod.syncUserJobs(userId);
  console.log(`sync took ${((Date.now() - t0) / 1000).toFixed(1)}s`, first.report);
  expect(first.report.map((r) => r.source).sort()).toEqual(["directory", "greenhouse", "himalayas", "jobicy", "remotive"]);
  expect(first.report.find((r) => r.label.startsWith("Missing"))?.error).toMatch(/not found/i);
  const dir = first.report.find((r) => r.source === "directory")!;
  expect(dir.kept).toBeGreaterThan(10);
  for (const r of first.report) expect(r.kept).toBeLessThanOrEqual(r.fetched);

  const { listUserJobs } = await import("@/lib/jobs/repo");
  const { items } = await listUserJobs(userId, {}, new Set(["Python", "Go", "Kafka", "AWS"]), 500);
  expect(items.length).toBeGreaterThan(0);
  const { isITRole } = await import("@/lib/jobs/it-roles");
  for (const j of items) {
    expect(j.title.toLowerCase()).toMatch(/software|engineer|sde|backend/);
    expect(isITRole(j.title)).toBe(true);
  }
  const bySource = items.reduce<Record<string, number>>((m, j) => ({ ...m, [j.source]: (m[j.source] ?? 0) + 1 }), {});
  console.log(items.length, "jobs", bySource);
  console.log(items.filter((j) => j.remote).slice(0, 5).map((j) => `${j.source} | ${j.company} | ${j.title} | ${j.location}`));
  console.log(items.filter((j) => !j.remote).slice(0, 5).map((j) => `${j.source} | ${j.company} | ${j.title} | ${j.location}`));

  const second = await mod.syncUserJobs(userId);
  expect(second.added).toBe(0);
}, 290000);

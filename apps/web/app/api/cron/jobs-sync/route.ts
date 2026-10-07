import { isCronAuthorized } from "@/lib/cron/auth";
import { db, schema } from "@/lib/db";
import { deleteStaleJobs, syncUserJobs } from "@/lib/jobs/sync";

export const maxDuration = 300;

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return new Response("Unauthorized", { status: 401 });
  const users = await db().select({ id: schema.users.id }).from(schema.users);
  const results = [];
  for (const u of users) {
    try {
      const { added, report } = await syncUserJobs(u.id);
      results.push({ user: u.id, added, sources: report.length, errors: report.filter((r) => r.error).length });
    } catch (e) {
      results.push({ user: u.id, error: String(e) });
    }
  }
  const deleted = await deleteStaleJobs();
  return Response.json({ ok: true, results, deleted });
}

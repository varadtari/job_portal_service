import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { preflight, unauthorized, userFromToken, withCors } from "@/lib/ext/auth";
import { getUserJob } from "@/lib/jobs/repo";

/** Job + which resume the extension will attach for it (popup display). */
async function handle(req: Request) {
  const user = await userFromToken(req);
  if (!user) return unauthorized();
  const id = new URL(req.url).pathname.split("/").pop()!;
  if (!/^[0-9a-f-]{36}$/.test(id)) return Response.json({ error: "Invalid id" }, { status: 400 });
  const row = await getUserJob(user.id, id);
  if (!row) return Response.json({ error: "Not found" }, { status: 404 });
  const [tailored] = await db()
    .select({ id: schema.resumes.id, title: schema.resumes.title, meta: schema.resumes.tailorMeta })
    .from(schema.resumes)
    .where(and(eq(schema.resumes.userId, user.id), eq(schema.resumes.jobId, id), eq(schema.resumes.kind, "tailored")))
    .orderBy(desc(schema.resumes.createdAt))
    .limit(1);
  return Response.json({
    id,
    title: row.job.title,
    company: row.job.company,
    tailored: tailored ? { id: tailored.id, title: tailored.title, scoreAfter: tailored.meta?.scoreAfter ?? null } : null,
  });
}

export const GET = withCors(handle);
export const OPTIONS = preflight;

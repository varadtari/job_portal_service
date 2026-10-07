import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { preflight, unauthorized, userFromToken, withCors } from "@/lib/ext/auth";
import { findJobForUrl } from "@/lib/ext/applications";
import { resumeToPdf } from "@/lib/export/pdf";
import { attachmentHeader } from "@/lib/export/sections";
import { ResumeContent } from "@/lib/resume/types";

/** PDF to attach on an application page: the tailored resume for that job if there is one, else the latest master. */
async function handle(req: Request) {
  const user = await userFromToken(req);
  if (!user) return unauthorized();
  const params = new URL(req.url).searchParams;
  const url = params.get("url") ?? "";
  // Apply-queue context passes the job id: URLs often redirect (Indeed tracking links)
  const job = params.get("jobId") ? { id: params.get("jobId")! } : url ? await findJobForUrl(user.id, url) : null;
  const r = schema.resumes;
  const pick = async (where: Parameters<typeof and>) =>
    (await db().select().from(r).where(and(eq(r.userId, user.id), ...where)).orderBy(desc(r.updatedAt)).limit(1))[0];
  const row = (job && (await pick([eq(r.jobId, job.id), eq(r.kind, "tailored")]))) || (await pick([eq(r.kind, "master")]));
  const parsed = ResumeContent.safeParse(row?.content);
  if (!row || !parsed.success) return Response.json({ error: "No resume yet. Upload one in JobPilot." }, { status: 404 });
  const pdf = await resumeToPdf(parsed.data);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": attachmentHeader(`${parsed.data.basics.name} Resume`, "pdf"),
      "X-Resume-Kind": row.kind,
      "X-Resume-Title": encodeURIComponent(row.title),
      "Cache-Control": "private, no-store",
    },
  });
}

export const GET = withCors(handle);
export const OPTIONS = preflight;

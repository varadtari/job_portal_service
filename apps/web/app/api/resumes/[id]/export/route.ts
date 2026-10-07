import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db, schema } from "@/lib/db";
import { resumeToDocx } from "@/lib/export/docx";
import { resumeToPdf } from "@/lib/export/pdf";
import { attachmentHeader } from "@/lib/export/sections";
import { ResumeContent } from "@/lib/resume/types";

export async function GET(req: Request, ctx: RouteContext<"/api/resumes/[id]/export">) {
  const uid = (await auth())?.user?.id;
  if (!uid) return new Response("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  const format = new URL(req.url).searchParams.get("format") === "docx" ? "docx" : "pdf";
  const [row] = await db()
    .select({ title: schema.resumes.title, content: schema.resumes.content })
    .from(schema.resumes)
    .where(and(eq(schema.resumes.id, id), eq(schema.resumes.userId, uid)));
  const parsed = ResumeContent.safeParse(row?.content);
  if (!row || !parsed.success) return new Response("Not found", { status: 404 });

  const body = format === "pdf" ? await resumeToPdf(parsed.data) : await resumeToDocx(parsed.data);
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": attachmentHeader(`${parsed.data.basics.name} – ${row.title}`, format),
      "Cache-Control": "private, no-store",
    },
  });
}

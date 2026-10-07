import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db, schema } from "@/lib/db";
import { signedUrl } from "@/lib/storage";

export async function GET(_: Request, ctx: RouteContext<"/api/resumes/[id]/file">) {
  const uid = (await auth())?.user?.id;
  if (!uid) return new Response("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  const [row] = await db()
    .select({ path: schema.resumes.storagePath })
    .from(schema.resumes)
    .where(and(eq(schema.resumes.id, id), eq(schema.resumes.userId, uid)));
  if (!row?.path) return new Response("Not found", { status: 404 });
  return Response.redirect(await signedUrl(row.path, 120), 302);
}

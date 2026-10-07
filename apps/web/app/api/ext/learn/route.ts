import { z } from "zod";
import { answersToLearn } from "@/lib/autofill/match";
import { preflight, unauthorized, userFromToken, withCors } from "@/lib/ext/auth";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { logApplication, markJobApplied } from "@/lib/ext/applications";
import { listProfileFields, upsertProfileFields } from "@/lib/profile/repo";

const Field = z.object({
  id: z.string().max(100),
  label: z.string().max(1000),
  name: z.string().max(300).optional(),
  placeholder: z.string().max(300).optional(),
  type: z.string().max(30),
  value: z.string().max(5000),
});
const Body = z.object({
  url: z.string().url().max(4000),
  page: z.object({ title: z.string().max(300), company: z.string().max(200) }),
  fields: z.array(Field).max(400),
  markApplied: z.boolean(),
  jobId: z.string().uuid().optional(), // apply-queue context: log this exact job
});

async function handle(req: Request) {
  const user = await userFromToken(req);
  if (!user) return unauthorized();
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Invalid request" }, { status: 400 });

  const profile = await listProfileFields(user.id);
  const learned = answersToLearn(body.data.fields, profile);
  const canonical = learned.filter((l) => l.label === null);
  const questions = learned.filter((l) => l.label !== null);
  await upsertProfileFields(user.id, [...canonical, ...questions], "learned");

  const application = !body.data.markApplied
    ? null
    : body.data.jobId
      ? await markJobApplied(user.id, body.data.jobId)
      : await logApplication(user.id, { url: body.data.url, ...body.data.page });
  if (application && body.data.jobId) {
    // Finishing a queued job also completes its queue item
    await db()
      .update(schema.applyQueue)
      .set({ status: "done" })
      .where(and(eq(schema.applyQueue.userId, user.id), eq(schema.applyQueue.jobId, body.data.jobId)));
  }
  return Response.json({
    learned: learned.map((l) => l.label ?? l.key),
    application,
  });
}

export const POST = withCors(handle);
export const OPTIONS = preflight;

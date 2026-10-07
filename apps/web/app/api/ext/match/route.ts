import { z } from "zod";
import { matchFields } from "@/lib/autofill/match";
import { preflight, unauthorized, userFromToken, withCors } from "@/lib/ext/auth";
import { findJobForUrl } from "@/lib/ext/applications";
import { listProfileFields } from "@/lib/profile/repo";

const Field = z.object({
  id: z.string().max(100),
  label: z.string().max(1000),
  name: z.string().max(300).optional(),
  placeholder: z.string().max(300).optional(),
  autocomplete: z.string().max(100).optional(),
  type: z.string().max(30),
  options: z.array(z.string().max(300)).max(300).optional(),
  required: z.boolean().optional(),
});
const MatchBody = z.object({ url: z.string().max(4000), fields: z.array(Field).max(400) });

async function handle(req: Request) {
  const user = await userFromToken(req);
  if (!user) return unauthorized();
  const body = MatchBody.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const [profile, job] = await Promise.all([listProfileFields(user.id), findJobForUrl(user.id, body.data.url)]);
  const matches = matchFields(body.data.fields, profile);
  return Response.json({ matches, jobId: job?.id ?? null });
}

export const POST = withCors(handle);
export const OPTIONS = preflight;

import { z } from "zod";
import { preflight, unauthorized, userFromToken, withCors } from "@/lib/ext/auth";
import { setQueueStatus } from "@/lib/queue";

const Body = z.object({ action: z.enum(["active", "done", "skip", "requeue"]) });
const STATUS = { active: "active", done: "done", skip: "skipped", requeue: "queued" } as const;

async function handle(req: Request) {
  const user = await userFromToken(req);
  if (!user) return unauthorized();
  const id = new URL(req.url).pathname.split("/").pop()!;
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success || !/^[0-9a-f-]{36}$/.test(id)) return Response.json({ error: "Invalid request" }, { status: 400 });
  const row = await setQueueStatus(user.id, id, STATUS[body.data.action]);
  return row ? Response.json({ ok: true, status: row.status }) : Response.json({ error: "Not found" }, { status: 404 });
}

export const POST = withCors(handle);
export const OPTIONS = preflight;

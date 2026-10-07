import { preflight, unauthorized, userFromToken, withCors } from "@/lib/ext/auth";
import { listQueue } from "@/lib/queue";

/** Pending apply-queue items in order (the extension works through them one by one). */
async function handle(req: Request) {
  const user = await userFromToken(req);
  if (!user) return unauthorized();
  const items = await listQueue(user.id);
  return Response.json({ items: items.map(({ id, jobId, title, company, location, url, status }) => ({ id, jobId, title, company, location, url, status })) });
}

export const GET = withCors(handle);
export const OPTIONS = preflight;

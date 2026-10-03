import { isCronAuthorized } from "@/lib/cron/auth";

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return new Response("Unauthorized", { status: 401 });
  // Implemented in phase 6.
  return Response.json({ ok: true, synced: 0 });
}

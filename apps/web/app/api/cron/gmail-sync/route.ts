import { isNotNull } from "drizzle-orm";
import { isCronAuthorized } from "@/lib/cron/auth";
import { db, schema } from "@/lib/db";
import { GmailReconnectError } from "@/lib/gmail/client";
import { syncGmail } from "@/lib/gmail/sync";
import { runDueFollowUps } from "@/lib/followup/service";

export const maxDuration = 300;

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return new Response("Unauthorized", { status: 401 });
  const users = await db().select({ id: schema.users.id }).from(schema.users).where(isNotNull(schema.users.googleRefreshTokenEnc));
  const results = [];
  for (const u of users) {
    try {
      const sync = await syncGmail(u.id);
      // After status updates: draft follow-ups that are now due (the user reviews and sends them)
      const followUpDrafts = await runDueFollowUps(u.id).catch(() => 0);
      results.push({ user: u.id, ...sync, followUpDrafts });
    } catch (e) {
      results.push({ user: u.id, error: e instanceof GmailReconnectError ? "reconnect needed" : String((e as Error).message) });
    }
  }
  return Response.json({ ok: true, results });
}

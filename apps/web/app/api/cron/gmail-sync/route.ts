import { isNotNull } from "drizzle-orm";
import { isCronAuthorized } from "@/lib/cron/auth";
import { db, schema } from "@/lib/db";
import { GmailReconnectError } from "@/lib/gmail/client";
import { syncGmail } from "@/lib/gmail/sync";
import { runDueFollowUps } from "@/lib/followup/service";
import { accessToken } from "@/lib/gmail/client";
import { harvestFromGmail } from "@/lib/outreach/harvest";
import { checkOutreachReplies } from "@/lib/outreach/service";
import { checkDueSites } from "@/lib/outreach/site";

export const maxDuration = 300;

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return new Response("Unauthorized", { status: 401 });
  const users = await db().select({ id: schema.users.id, enc: schema.users.googleRefreshTokenEnc }).from(schema.users).where(isNotNull(schema.users.googleRefreshTokenEnc));
  const results = [];
  for (const u of users) {
    try {
      const sync = await syncGmail(u.id);
      // After status updates: draft follow-ups that are now due (the user reviews and sends them)
      const followUpDrafts = await runDueFollowUps(u.id).catch(() => 0);
      // Outreach: recruiters who emailed you become contacts; replies/bounces update contacts; check company sites
      const contacts = await harvestFromGmail(u.id).catch(() => 0);
      const outreach = await accessToken(u.enc!).then((t) => checkOutreachReplies(u.id, t)).catch(() => null);
      const sites = await checkDueSites(u.id, 30, 90_000).catch(() => 0);
      results.push({ user: u.id, ...sync, followUpDrafts, contacts, outreach, sites });
    } catch (e) {
      results.push({ user: u.id, error: e instanceof GmailReconnectError ? "reconnect needed" : String((e as Error).message) });
    }
  }
  return Response.json({ ok: true, results });
}

import { eq } from "drizzle-orm";
import webpush from "web-push";
import { db, schema } from "@/lib/db";
import { env } from "@/lib/env";

export type PushPayload = { title: string; body: string; url?: string; tag?: string };

let configured = false;
function configure(): boolean {
  const e = env();
  if (!e.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !e.VAPID_PRIVATE_KEY) return false;
  if (!configured) {
    webpush.setVapidDetails("mailto:notifications@jobpilot.app", e.NEXT_PUBLIC_VAPID_PUBLIC_KEY, e.VAPID_PRIVATE_KEY);
    configured = true;
  }
  return true;
}

/** Sends to every device the user enabled; drops subscriptions the browser has revoked. */
export async function sendPush(userId: string, payload: PushPayload): Promise<number> {
  if (!configure()) return 0;
  const subs = await db().select().from(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.userId, userId));
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 86400 });
        sent++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await db().delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.id, s.id));
      }
    }),
  );
  return sent;
}

"use server";

import { and, eq } from "drizzle-orm";
import { requireUserId } from "@/auth";
import { db, schema } from "@/lib/db";
import { sendPush } from "@/lib/push";

type Sub = { endpoint: string; keys: { p256dh: string; auth: string } };

export async function savePushSubscription(sub: Sub, userAgent: string) {
  const userId = await requireUserId();
  if (!/^https:\/\//.test(sub.endpoint) || !sub.keys?.p256dh || !sub.keys?.auth) return { error: "Invalid subscription" };
  await db()
    .insert(schema.pushSubscriptions)
    .values({ userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent: userAgent.slice(0, 300) })
    .onConflictDoUpdate({ target: schema.pushSubscriptions.endpoint, set: { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth } });
  return { ok: true };
}

export async function removePushSubscription(endpoint: string) {
  const userId = await requireUserId();
  await db().delete(schema.pushSubscriptions).where(and(eq(schema.pushSubscriptions.userId, userId), eq(schema.pushSubscriptions.endpoint, endpoint)));
}

export async function sendTestPush() {
  const userId = await requireUserId();
  const sent = await sendPush(userId, { title: "JobPilot", body: "Notifications are working. You'll hear about assessments, interviews and offers here.", url: "/dashboard", tag: "test" });
  return { sent };
}

"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireUserId } from "@/auth";
import { db, schema } from "@/lib/db";
import { GmailSendPermissionError } from "@/lib/gmail/send";
import { addContacts, addSites, harvestFromGmail, harvestFromJobs } from "@/lib/outreach/harvest";
import { parseContactsText } from "@/lib/outreach/import";
import { prepareDraft, quota, sendOutreach } from "@/lib/outreach/service";
import { checkCompanySite, type SiteResult } from "@/lib/outreach/site";

const c = schema.outreachContacts;
const oe = schema.outreachEmails;
const msg = (e: unknown) => String((e as Error)?.message ?? e);

export async function writeDraft(contactId: string, regenerate = false): Promise<{ ok: true; id: string; method: string } | { ok: false; error: string }> {
  const userId = await requireUserId();
  try {
    const d = await prepareDraft(userId, contactId, { regenerate });
    return { ok: true, id: d.id, method: d.method };
  } catch (e) {
    return { ok: false, error: msg(e) };
  }
}

export async function saveDraft(id: string, subject: string, body: string) {
  const userId = await requireUserId();
  await db().update(oe).set({ subject: subject.trim(), body: body.trim() }).where(and(eq(oe.id, id), eq(oe.userId, userId), inArray(oe.status, ["draft", "failed"])));
}

export async function dismissDrafts(ids: string[]) {
  const userId = await requireUserId();
  await db().update(oe).set({ status: "dismissed" }).where(and(inArray(oe.id, ids.slice(0, 500)), eq(oe.userId, userId), inArray(oe.status, ["draft", "failed"])));
  revalidatePath("/outreach");
}

export async function sendDraft(id: string, edits?: { subject: string; body: string }): Promise<{ ok: true; left: number } | { ok: false; error: string; permission?: boolean; limit?: boolean }> {
  const userId = await requireUserId();
  try {
    const r = await sendOutreach(userId, id, edits);
    return { ok: true, left: r.left };
  } catch (e) {
    return { ok: false, error: msg(e), permission: e instanceof GmailSendPermissionError, limit: /Daily limit/.test(msg(e)) };
  }
}

export async function setContactsStatus(ids: string[], status: "do_not_contact" | "new") {
  const userId = await requireUserId();
  await db().update(c).set({ status }).where(and(inArray(c.id, ids.slice(0, 500)), eq(c.userId, userId)));
  if (status === "do_not_contact") await db().update(oe).set({ status: "dismissed" }).where(and(inArray(oe.contactId, ids.slice(0, 500)), eq(oe.userId, userId), eq(oe.status, "draft")));
  revalidatePath("/outreach");
}

export async function importContacts(text: string): Promise<{ found: number; added: number }> {
  const userId = await requireUserId();
  const rows = parseContactsText(text.slice(0, 200_000));
  const added = await addContacts(userId, rows);
  revalidatePath("/outreach");
  return { found: rows.length, added };
}

export async function findContactsNow(): Promise<{ jobs: number; gmail: number }> {
  const userId = await requireUserId();
  const [jobs, gmail] = await Promise.all([harvestFromJobs(userId), harvestFromGmail(userId).catch(() => 0)]);
  revalidatePath("/outreach");
  return { jobs, gmail };
}

export async function addWebsite(input: string, name: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const userId = await requireUserId();
  let host: string;
  try {
    host = new URL(/^https?:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return { ok: false, error: "Enter a website like acme.com" };
  }
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) return { ok: false, error: "Enter a website like acme.com" };
  await addSites(userId, [{ domain: host, name: name.trim() || null }]);
  const [row] = await db().select({ id: schema.companySites.id }).from(schema.companySites).where(and(eq(schema.companySites.userId, userId), eq(schema.companySites.domain, host)));
  revalidatePath("/outreach");
  return { ok: true, id: row.id };
}

export async function checkWebsite(id: string): Promise<SiteResult> {
  const userId = await requireUserId();
  const r = await checkCompanySite(userId, id);
  revalidatePath("/outreach");
  return r;
}

export async function removeWebsite(id: string) {
  const userId = await requireUserId();
  await db().delete(schema.companySites).where(and(eq(schema.companySites.id, id), eq(schema.companySites.userId, userId)));
  revalidatePath("/outreach");
}

export async function setDailyCap(n: number) {
  const userId = await requireUserId();
  const cap = Math.max(5, Math.min(50, Math.round(n) || 25));
  await db().update(schema.users).set({ outreachDailyCap: cap }).where(eq(schema.users.id, userId));
  revalidatePath("/outreach");
  return cap;
}

export async function quotaNow() {
  return quota(await requireUserId());
}

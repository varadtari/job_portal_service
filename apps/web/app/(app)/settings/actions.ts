"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireUserId } from "@/auth";
import { db, schema } from "@/lib/db";
import { hashToken, newToken } from "@/lib/ext/auth";

/** Creates a new extension token (replacing any old one). The token is shown once and only its hash is stored. */
export async function createExtensionToken(): Promise<{ token: string }> {
  const userId = await requireUserId();
  const token = newToken();
  await db().update(schema.users).set({ extTokenHash: hashToken(token) }).where(eq(schema.users.id, userId));
  revalidatePath("/settings");
  return { token };
}

export async function revokeExtensionToken() {
  const userId = await requireUserId();
  await db().update(schema.users).set({ extTokenHash: null }).where(eq(schema.users.id, userId));
  revalidatePath("/settings");
}

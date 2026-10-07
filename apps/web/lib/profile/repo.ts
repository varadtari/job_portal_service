import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";

const t = schema.profileFields;

export async function listProfileFields(userId: string) {
  return db().select().from(t).where(eq(t.userId, userId)).orderBy(t.key);
}

export async function upsertProfileFields(
  userId: string,
  values: { key: string; value: string; label?: string | null }[],
  source: "manual" | "resume" | "learned",
) {
  if (!values.length) return;
  for (const v of values) {
    await db()
      .insert(t)
      .values({ userId, key: v.key, value: v.value, label: v.label ?? null, source })
      .onConflictDoUpdate({
        target: [t.userId, t.key],
        set: { value: v.value, source, ...(v.label !== undefined ? { label: v.label } : {}) },
      });
  }
}

/**
 * Fills profile fields from a resume: adds missing keys and refreshes values that also came
 * from a resume. Values the user entered (manual) or the extension learned are never overwritten.
 */
export async function fillMissingProfileFields(userId: string, values: Record<string, string>) {
  const entries = Object.entries(values);
  if (!entries.length) return 0;
  const rows = entries.map(([key, value]) => ({ userId, key, value, source: "resume" as const }));
  const written = await db()
    .insert(t)
    .values(rows)
    .onConflictDoUpdate({ target: [t.userId, t.key], set: { value: sql`excluded.value` }, setWhere: eq(t.source, "resume") })
    .returning({ key: t.key });
  return written.length;
}

export async function deleteProfileFields(userId: string, keys: string[]) {
  if (!keys.length) return;
  await db().delete(t).where(and(eq(t.userId, userId), inArray(t.key, keys)));
}

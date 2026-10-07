"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/auth";
import { CANONICAL_KEYS, learnedKey } from "@/lib/profile/fields";
import { deleteProfileFields, upsertProfileFields } from "@/lib/profile/repo";

export type ProfileState = { ok?: string; error?: string } | undefined;

export async function saveProfile(_: ProfileState, form: FormData): Promise<ProfileState> {
  const userId = await requireUserId();
  const set: { key: string; value: string }[] = [];
  const cleared: string[] = [];
  for (const key of CANONICAL_KEYS) {
    if (!form.has(key)) continue;
    const value = String(form.get(key) ?? "").trim();
    if (value) set.push({ key, value });
    else cleared.push(key);
  }
  await upsertProfileFields(userId, set, "manual");
  await deleteProfileFields(userId, cleared);
  revalidatePath("/profile");
  return { ok: "Profile saved." };
}

export async function saveAnswer(question: string, answer: string, existingKey?: string): Promise<ProfileState> {
  const userId = await requireUserId();
  const q = question.trim();
  const a = answer.trim();
  if (!q || !a) return { error: "Question and answer are both required." };
  const key = existingKey ?? learnedKey(q);
  if (!key || CANONICAL_KEYS.has(key)) return { error: "That question is already covered by a profile field." };
  await upsertProfileFields(userId, [{ key, value: a, label: q }], "manual");
  revalidatePath("/profile");
  return { ok: "Saved." };
}

export async function deleteAnswer(key: string) {
  const userId = await requireUserId();
  if (CANONICAL_KEYS.has(key)) return;
  await deleteProfileFields(userId, [key]);
  revalidatePath("/profile");
}

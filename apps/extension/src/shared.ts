import { ext } from "./ext";
// Messages between popup, background and content scripts.

export const DEFAULT_SERVER = "https://jobpilot-rho-green.vercel.app";

export type Settings = { server: string; token: string };

export type FieldDescriptor = {
  id: string;
  label: string;
  name?: string;
  placeholder?: string;
  autocomplete?: string;
  type: string;
  options?: string[];
  required?: boolean;
};

export type FieldMatch = { id: string; key: string | null; value: string | null; source: "rule" | "learned" | null; confidence: number };

export type PageKind = "form" | "challenge" | "none";
export type FillReport = { frame: string; fields: number; filled: number; learned: number; missingRequired: number; resume: "attached" | "none" | "failed" | "skipped"; error?: string; page?: PageKind };

export type LearnResult = { learned: string[]; application: { company: string; title: string; status: string; isNew: boolean } | null };

export type ApiRequest = { type: "api"; method: "GET" | "POST"; path: string; body?: unknown; binary?: boolean };
export type ApiResponse = { ok: boolean; status: number; data?: unknown; base64?: string; headers?: Record<string, string>; error?: string };

export async function getSettings(): Promise<Settings> {
  const s = await ext.storage.local.get(["server", "token"]);
  return { server: (s.server as string) || DEFAULT_SERVER, token: (s.token as string) || "" };
}

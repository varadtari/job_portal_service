import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";

export const MODELS = {
  // Resume parsing/tailoring, JD parsing
  main: "claude-sonnet-5-5",
  // High-volume email classification (phase 6)
  fast: "claude-haiku-4-5",
} as const;

// Server-side refusal fallback: if a safety classifier declines, the API reruns on a recommended model.
export function withFallback() {
  return {
    betas: ["server-side-fallback-2026-07-01"] satisfies Anthropic.Beta.AnthropicBeta[],
    fallbacks: "default" as const,
  };
}

let client: Anthropic | undefined;

export function anthropic(): Anthropic {
  const key = env().ANTHROPIC_API_KEY;
  if (!key) throw new AIUnavailableError("ANTHROPIC_API_KEY is not set");
  client ??= new Anthropic({ apiKey: key });
  return client;
}

export class AIUnavailableError extends Error {}

import { env } from "@/lib/env";
import { parseResume as parseWithAI } from "@/lib/ai/parse-resume";
import { parseResumeHeuristic } from "./heuristic";
import type { ResumeContent } from "./types";

export type ParseMethod = "ai" | "rules";

/** Uses Claude when ANTHROPIC_API_KEY is set; otherwise (or on AI failure) the rule-based parser. */
export async function parseResumeText(rawText: string): Promise<{ content: ResumeContent; method: ParseMethod }> {
  if (env().ANTHROPIC_API_KEY) {
    try {
      return { content: await parseWithAI(rawText), method: "ai" };
    } catch (e) {
      console.error("AI resume parse failed; falling back to rules", e);
    }
  }
  return { content: parseResumeHeuristic(rawText), method: "rules" };
}

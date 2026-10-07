import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { ResumeContent } from "@/lib/resume/types";
import { anthropic, MODELS, withFallback } from "./client";

const SYSTEM = `You convert resume text into structured JSON.
Copy the candidate's wording faithfully: do not rephrase, summarise, embellish, or invent anything.
Keep every bullet point, in order. Use null for fields that are not present.
Group skills under the categories the resume uses; if it has none, choose sensible ones (e.g. Languages, Frameworks, Tools).
Put sections that don't fit the schema (awards, languages, publications, volunteering) in "extra".`;

export async function parseResume(rawText: string): Promise<ResumeContent> {
  const res = await anthropic().beta.messages.parse({
    model: MODELS.main,
    max_tokens: 16000,
    ...withFallback(),
    output_config: { effort: "low", format: betaZodOutputFormat(ResumeContent) },
    system: SYSTEM,
    messages: [{ role: "user", content: `<resume>\n${rawText}\n</resume>` }],
  });
  if (res.stop_reason === "refusal") throw new Error("The model declined to parse this resume.");
  if (res.stop_reason === "max_tokens") throw new Error("Resume is too long to parse in one pass.");
  if (!res.parsed_output) throw new Error("Couldn't parse the resume structure.");
  return res.parsed_output;
}

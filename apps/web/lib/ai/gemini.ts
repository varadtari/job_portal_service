import { ApiError, GoogleGenAI, ThinkingLevel } from "@google/genai";
import { z } from "zod";
import { env } from "@/lib/env";
import type { ResumeContent } from "@/lib/resume/types";
import { TailorOutput } from "@/lib/tailor/schema";

// Free-tier friendly aliases; Google points them at the current Flash / Flash-Lite models.
// Flash-Lite is the fallback when Flash is overloaded (503s are common on the free tier).
const MODELS = ["gemini-flash-latest", "gemini-flash-latest", "gemini-flash-lite-latest"] as const;
const BACKOFF_MS = [0, 3000, 2000];
const GEMINI_TIMEOUT_MS = 35000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class GeminiUnavailableError extends Error {}

let client: GoogleGenAI | undefined;
function gemini() {
  const key = env().GEMINI_API_KEY;
  if (!key) throw new GeminiUnavailableError("GEMINI_API_KEY is not set");
  client ??= new GoogleGenAI({ apiKey: key });
  return client;
}

export function geminiConfigured() {
  return !!env().GEMINI_API_KEY;
}

const SYSTEM = `You tailor a candidate's resume to a specific job. You are editing a real person's resume, so honesty matters more than keyword stuffing.

Rules:
- Never invent employers, titles, dates, degrees, projects, tools, metrics or responsibilities. Every bullet you write must be supported by the original bullet(s) for that same entry.
- You may reword bullets to use the job's terminology where it truthfully describes the same work, lead with impact and technologies, merge or split bullets, and reorder them so the most relevant come first.
- Keep numbers exactly as in the original. Do not add new numbers.
- Do not add qualifiers or claims the original doesn't state (e.g. "major", "large-scale", "high reliability", "production-grade", "led a team"). Plain and accurate beats impressive.
- Return one entry per original experience (same company names) and per original project (same names), in the original order.
- Keep bullets concise: one line, at most about 25 words, starting with a strong past-tense verb (present tense for a current role is fine).
- Summary: 2–3 sentences aimed at this job, using only facts from the resume. Headline: a short title matching the target role that the candidate's experience supports.
- Skills: regroup and order so the job's skills come first. Only include skills that appear in the original resume.
- notes: up to 4 short, practical suggestions, e.g. job requirements the resume doesn't show evidence for.`;

/** One structured-JSON Gemini call with retries, Flash-Lite fallback and a timeout. */
async function callGemini<T>(schema: z.ZodType<T>, system: string, payload: unknown, temperature: number): Promise<T> {
  let lastStatus = 0;
  for (const [i, model] of MODELS.entries()) {
    await sleep(BACKOFF_MS[i]);
    try {
      const res = await gemini().models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: JSON.stringify(payload) }] }],
        config: {
          systemInstruction: system,
          responseMimeType: "application/json",
          responseJsonSchema: z.toJSONSchema(schema),
          temperature,
          // These are writing tasks, not reasoning ones; LOW keeps calls fast on the free tier
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          // A slow free-tier call must not stall the UI; callers fall back to rules/templates
          abortSignal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
        },
      });
      const parsed = schema.safeParse(JSON.parse(res.text ?? "null"));
      if (!parsed.success) throw new Error("Gemini returned an unexpected format. Try again.");
      return parsed.data;
    } catch (e) {
      if (e instanceof Error && (e.name === "AbortError" || e.name === "TimeoutError")) {
        throw new Error(`Gemini took longer than ${GEMINI_TIMEOUT_MS / 1000}s`);
      }
      if (!(e instanceof ApiError)) throw e;
      lastStatus = e.status;
      if (e.status === 429) throw new Error("Gemini free-tier limit reached. Wait a minute (or until tomorrow for the daily limit) and try again.");
      if (e.status === 400 || e.status === 403) throw new Error(`Gemini rejected the request (${e.status}). Check that GEMINI_API_KEY is valid.`);
      // 5xx: overloaded/unavailable, so retry, then fall back to Flash-Lite
    }
  }
  throw new Error(`Gemini is busy right now (error ${lastStatus}). Try again in a minute.`);
}

export async function tailorWithGemini(
  resume: ResumeContent,
  job: { title: string; company: string; description: string },
  jobSkills: string[],
): Promise<TailorOutput> {
  const input = {
    job: { title: job.title, company: job.company, keySkills: jobSkills, description: job.description.slice(0, 15000) },
    resume,
  };
  return callGemini(TailorOutput, SYSTEM, input, 0.4);
}

const FollowUpEmail = z.object({ subject: z.string(), body: z.string() });

const FOLLOW_UP_SYSTEM = `You write short, polite follow-up emails from a job candidate to a recruiter or hiring team.

Rules:
- 60–120 words in the body for a first follow-up; 40–70 words for a second or later one. Plain text, no markdown.
- Mention the role and company, and when they applied if a date is given.
- Use at most one concrete strength, taken only from "highlight" or "skills". Never invent experience, numbers or achievements.
- Warm and professional, not pushy or desperate. No "I hope this email finds you well". One clear, easy question about next steps.
- Greet the contact by first name if given, otherwise "Hello,". Sign off with the candidate's full name only.
- If replyToSubject is given, the subject must be exactly "Re: " + that subject (unless it already starts with "Re:"). Otherwise write a short, specific subject.`;

export async function writeFollowUpWithGemini(input: {
  candidateName: string;
  company: string;
  role: string;
  appliedOn: string | null;
  followUpNumber: number;
  contactName: string | null;
  highlight: string | null;
  skills: string[];
  replyToSubject: string | null;
}): Promise<{ subject: string; body: string }> {
  return callGemini(FollowUpEmail, FOLLOW_UP_SYSTEM, input, 0.6);
}

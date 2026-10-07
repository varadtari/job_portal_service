import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().url(),
  AUTH_SECRET: z.string().min(16),
  AUTH_GOOGLE_ID: z.string().min(1),
  AUTH_GOOGLE_SECRET: z.string().min(1),
  // Comma-separated bootstrap allowlist; merged with the allowed_emails table.
  ALLOWED_EMAILS: z.string().default(""),
  // 32 bytes, base64. Generate: openssl rand -base64 32
  TOKEN_ENC_KEY: z.string().min(40),
  CRON_SECRET: z.string().min(16),
  ANTHROPIC_API_KEY: z.string().optional(),
  // Google AI Studio key (free tier) used for resume tailoring
  GEMINI_API_KEY: z.string().optional(),
  // Web push (npx web-push generate-vapid-keys)
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  RAPIDAPI_KEY: z.string().optional(),
  ADZUNA_APP_ID: z.string().optional(),
  ADZUNA_APP_KEY: z.string().optional(),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

// Lazy so `next build` doesn't fail when env vars are only present at runtime.
export function env(): Env {
  cached ??= schema.parse(process.env);
  return cached;
}

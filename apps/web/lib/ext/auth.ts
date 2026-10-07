import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

// Personal access token for the Chrome extension. Only the SHA-256 hash is stored.

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export function newToken(): string {
  return `jp_${randomBytes(32).toString("base64url")}`;
}

export async function userFromToken(req: Request) {
  const m = req.headers.get("authorization")?.match(/^Bearer (jp_[A-Za-z0-9_-]{20,})$/);
  if (!m) return null;
  const [user] = await db().select().from(schema.users).where(eq(schema.users.extTokenHash, hashToken(m[1])));
  return user ?? null;
}

export const unauthorized = () =>
  Response.json({ error: "Invalid or missing token. Create one in JobPilot → Settings." }, { status: 401 });

// Firefox treats extension host permissions as opt-in, so its background requests can be CORS requests.
// Token auth (no cookies) makes allowing extension origins safe.
const EXT_ORIGIN = /^(moz-extension|chrome-extension|safari-web-extension):\/\/[a-z0-9-]+$/i;

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  if (!origin || !EXT_ORIGIN.test(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Expose-Headers": "Content-Disposition, X-Resume-Kind, X-Resume-Title",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

/** Wraps an extension route handler with CORS headers and an OPTIONS preflight. */
export function withCors(handler: (req: Request) => Promise<Response>) {
  return async (req: Request) => {
    const res = await handler(req);
    for (const [k, v] of Object.entries(corsHeaders(req))) res.headers.set(k, v);
    return res;
  };
}

export function preflight(req: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}

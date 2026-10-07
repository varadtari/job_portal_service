import { decrypt } from "@/lib/crypto";
import { env } from "@/lib/env";
import { htmlToPlain } from "@/lib/jobs/text";

// Minimal Gmail REST client (read-only scope). No googleapis dependency: two endpoints are all we need.

export class GmailReconnectError extends Error {}

export async function accessToken(refreshTokenEnc: string): Promise<string> {
  const e = env();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: decrypt(refreshTokenEnc, e.TOKEN_ENC_KEY),
      client_id: e.AUTH_GOOGLE_ID,
      client_secret: e.AUTH_GOOGLE_SECRET,
    }),
  });
  const data = (await res.json()) as { access_token?: string; error?: string };
  // Testing-mode OAuth apps get refresh tokens that expire after 7 days → user must sign in again
  if (data.error === "invalid_grant") throw new GmailReconnectError("Gmail access expired");
  if (!data.access_token) throw new Error(`Google token error: ${data.error ?? res.status}`);
  return data.access_token;
}

async function gmail<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20000),
  });
  if (res.status === 401) throw new GmailReconnectError("Gmail access revoked");
  if (!res.ok) throw new Error(`Gmail API ${res.status}`);
  return (await res.json()) as T;
}

// Job-related mail only: application keywords in subjects, or senders that are ATS / assessment platforms.
export const JOB_QUERY =
  '-category:promotions -category:social -in:chats (subject:(application OR applying OR applied OR interview OR assessment OR "next steps" OR offer OR candidacy OR "thank you for your interest" OR "your profile" OR shortlisted) OR from:(greenhouse.io OR lever.co OR ashbyhq.com OR myworkday.com OR workday.com OR smartrecruiters.com OR icims.com OR hackerrank.com OR codility.com OR hackerearth.com OR codesignal.com OR naukri.com OR instahyre.com OR wellfound.com OR darwinbox.in OR keka.com OR zohorecruit.com OR freshteam.com))';

export async function listMessageIds(token: string, query: string, max = 500): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({ q: query, maxResults: "100", ...(pageToken ? { pageToken } : {}) });
    const page = await gmail<{ messages?: { id: string }[]; nextPageToken?: string }>(token, `messages?${params}`);
    ids.push(...(page.messages ?? []).map((m) => m.id));
    pageToken = page.nextPageToken;
  } while (pageToken && ids.length < max);
  return ids.slice(0, max);
}

type Part = { mimeType?: string; body?: { data?: string }; parts?: Part[] };
type RawMessage = { id: string; internalDate: string; snippet: string; payload: Part & { headers?: { name: string; value: string }[] } };

const b64 = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");

function bodyHtml(p: Part): string {
  const html: string[] = [];
  const walk = (x: Part) => {
    if (x.mimeType === "text/html" && x.body?.data) html.push(b64(x.body.data));
    x.parts?.forEach(walk);
  };
  walk(p);
  return html.join("\n");
}

function bodyText(p: Part): string {
  const plain: string[] = [];
  const html: string[] = [];
  const walk = (x: Part) => {
    if (x.mimeType === "text/plain" && x.body?.data) plain.push(b64(x.body.data));
    else if (x.mimeType === "text/html" && x.body?.data) html.push(b64(x.body.data));
    x.parts?.forEach(walk);
  };
  walk(p);
  const text = plain.length ? plain.join("\n") : htmlToPlain(html.join("\n"));
  return text.replace(/\n{3,}/g, "\n\n").slice(0, 10000);
}

export type GmailMessage = { id: string; date: Date; from: string; subject: string; snippet: string; text: string; html: string };

export async function getMessage(token: string, id: string): Promise<GmailMessage> {
  const m = await gmail<RawMessage>(token, `messages/${id}?format=full`);
  const h = (name: string) => m.payload.headers?.find((x) => x.name.toLowerCase() === name)?.value ?? "";
  return { id: m.id, date: new Date(Number(m.internalDate)), from: h("from"), subject: h("subject"), snippet: m.snippet ?? "", text: bodyText(m.payload), html: bodyHtml(m.payload) };
}

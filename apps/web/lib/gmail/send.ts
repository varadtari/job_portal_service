import { buildMime } from "./mime";

export class GmailSendPermissionError extends Error {
  constructor() {
    super("JobPilot doesn't have permission to send email yet. Sign out and sign in again to grant it.");
  }
}

type Meta = { threadId: string; messageIdHeader: string | null; references: string | null; subject: string | null };

/** Thread + RFC Message-ID of an email we're replying to (metadata only, no body). */
export async function messageMeta(token: string, gmailId: string): Promise<Meta | null> {
  const params = new URLSearchParams({ format: "metadata" });
  for (const h of ["Message-ID", "References", "Subject"]) params.append("metadataHeaders", h);
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${gmailId}?${params}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  const m = (await res.json()) as { threadId: string; payload?: { headers?: { name: string; value: string }[] } };
  const h = (n: string) => m.payload?.headers?.find((x) => x.name.toLowerCase() === n.toLowerCase())?.value ?? null;
  return { threadId: m.threadId, messageIdHeader: h("Message-ID"), references: h("References"), subject: h("Subject") };
}

/** Sends a plain-text email from the user's Gmail, threaded under `replyTo` when given. */
export async function sendEmail(
  token: string,
  m: { from: string; to: string; subject: string; body: string; replyTo?: Meta | null },
): Promise<{ id: string; threadId: string }> {
  const raw = buildMime({
    from: m.from,
    to: m.to,
    subject: m.subject,
    body: m.body,
    inReplyTo: m.replyTo?.messageIdHeader,
    references: m.replyTo ? [m.replyTo.references, m.replyTo.messageIdHeader].filter(Boolean).join(" ") : null,
  });
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw, ...(m.replyTo?.threadId ? { threadId: m.replyTo.threadId } : {}) }),
  });
  if (res.status === 403 || res.status === 401) throw new GmailSendPermissionError();
  if (!res.ok) throw new Error(`Gmail send failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as { id: string; threadId: string };
}

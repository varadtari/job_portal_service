// Builds an RFC 2822 message for Gmail's users.messages.send (base64url "raw").

const encodeHeader = (v: string) => (/^[\x20-\x7e]*$/.test(v) ? v : `=?UTF-8?B?${Buffer.from(v, "utf8").toString("base64")}?=`);
const clean = (v: string) => v.replace(/[\r\n]+/g, " ").trim(); // no header injection

export function buildMime(m: { from: string; to: string; subject: string; body: string; inReplyTo?: string | null; references?: string | null }): string {
  const headers = [
    `From: ${clean(m.from)}`,
    `To: ${clean(m.to)}`,
    `Subject: ${encodeHeader(clean(m.subject))}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    ...(m.inReplyTo ? [`In-Reply-To: ${clean(m.inReplyTo)}`, `References: ${clean(m.references || m.inReplyTo)}`] : []),
  ];
  const body = Buffer.from(m.body.replace(/\r?\n/g, "\r\n"), "utf8").toString("base64").replace(/.{76}/g, "$&\r\n");
  return Buffer.from(`${headers.join("\r\n")}\r\n\r\n${body}`, "utf8").toString("base64url");
}

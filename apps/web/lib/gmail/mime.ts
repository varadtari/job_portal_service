// Builds an RFC 2822 message for Gmail's users.messages.send (base64url "raw").

const encodeHeader = (v: string) => (/^[\x20-\x7e]*$/.test(v) ? v : `=?UTF-8?B?${Buffer.from(v, "utf8").toString("base64")}?=`);
const clean = (v: string) => v.replace(/[\r\n]+/g, " ").trim(); // no header injection

export type Attachment = { filename: string; contentType: string; data: Uint8Array };

const b64lines = (b: Buffer) => b.toString("base64").replace(/.{76}/g, "$&\r\n");

export function buildMime(m: {
  from: string;
  to: string;
  subject: string;
  body: string;
  inReplyTo?: string | null;
  references?: string | null;
  attachments?: Attachment[];
}): string {
  const headers = [
    `From: ${clean(m.from)}`,
    `To: ${clean(m.to)}`,
    `Subject: ${encodeHeader(clean(m.subject))}`,
    "MIME-Version: 1.0",
    ...(m.inReplyTo ? [`In-Reply-To: ${clean(m.inReplyTo)}`, `References: ${clean(m.references || m.inReplyTo)}`] : []),
  ];
  const text = b64lines(Buffer.from(m.body.replace(/\r?\n/g, "\r\n"), "utf8"));
  if (!m.attachments?.length) {
    headers.push('Content-Type: text/plain; charset="UTF-8"', "Content-Transfer-Encoding: base64");
    return Buffer.from(`${headers.join("\r\n")}\r\n\r\n${text}`, "utf8").toString("base64url");
  }
  // multipart/mixed: the text part, then each file
  const boundary = `jp_${crypto.randomUUID().replace(/-/g, "")}`;
  headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
  const parts = [
    ['Content-Type: text/plain; charset="UTF-8"', "Content-Transfer-Encoding: base64", "", text].join("\r\n"),
    ...m.attachments.map((a) => {
      const name = clean(a.filename).replace(/["\\]/g, "");
      return [
        `Content-Type: ${clean(a.contentType)}; name="${encodeHeader(name)}"`,
        `Content-Disposition: attachment; filename="${encodeHeader(name)}"`,
        "Content-Transfer-Encoding: base64",
        "",
        b64lines(Buffer.from(a.data)),
      ].join("\r\n");
    }),
  ];
  const body = `${parts.map((p) => `--${boundary}\r\n${p}`).join("\r\n")}\r\n--${boundary}--`;
  return Buffer.from(`${headers.join("\r\n")}\r\n\r\n${body}`, "utf8").toString("base64url");
}

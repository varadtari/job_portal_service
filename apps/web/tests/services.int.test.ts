// Integration check against real services (needs .env.local + sample files): SAMPLE_DIR=... npm run test:int
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { expect, it } from "vitest";

config({ path: ".env.local", quiet: true });

const dir = process.env.SAMPLE_DIR!;

it("extracts PDF and DOCX text", async () => {
  const { extractResumeText } = await import("@/lib/resume/extract");
  const { RESUME_MIME } = await import("@/lib/resume/types");
  const pdf = await extractResumeText(new Uint8Array(readFileSync(`${dir}/resume.pdf`)), RESUME_MIME.pdf);
  const docx = await extractResumeText(new Uint8Array(readFileSync(`${dir}/resume.docx`)), RESUME_MIME.docx);
  for (const t of [pdf, docx]) {
    expect(t).toContain("Razorpay");
    expect(t).toContain("idempotent payout APIs");
  }
});

it("round-trips Supabase Storage", async () => {
  const { putObject, signedUrl, removeObject } = await import("@/lib/storage");
  const path = `itest/${Date.now()}.txt`;
  await putObject(path, new TextEncoder().encode("hello"), "text/plain");
  const url = await signedUrl(path, 60);
  expect(await (await fetch(url)).text()).toBe("hello");
  await removeObject(path);
  expect((await fetch(url)).ok).toBe(false);
}, 30000);

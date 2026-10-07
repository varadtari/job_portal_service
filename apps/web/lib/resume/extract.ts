import { extractText, getDocumentProxy } from "unpdf";
import mammoth from "mammoth";
import { RESUME_MIME } from "./types";

export async function extractResumeText(bytes: Uint8Array, mime: string): Promise<string> {
  let text: string;
  if (mime === RESUME_MIME.pdf) {
    const pdf = await getDocumentProxy(bytes);
    text = (await extractText(pdf, { mergePages: true })).text;
  } else if (mime === RESUME_MIME.docx) {
    text = (await mammoth.extractRawText({ buffer: Buffer.from(bytes) })).value;
  } else {
    throw new Error("Unsupported file type. Upload a PDF or DOCX.");
  }
  text = text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (text.length < 50) {
    throw new Error("Couldn't read any text from this file. If it's a scanned PDF, export a text-based PDF instead.");
  }
  return text;
}

export function detectMime(name: string, type: string): string | null {
  if (type === RESUME_MIME.pdf || name.toLowerCase().endsWith(".pdf")) return RESUME_MIME.pdf;
  if (type === RESUME_MIME.docx || name.toLowerCase().endsWith(".docx")) return RESUME_MIME.docx;
  return null;
}

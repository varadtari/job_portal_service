import type { AppStatus } from "./repo";

export const COLUMNS: { status: AppStatus; label: string; tone: "neutral" | "accent" | "success" | "warning" | "danger" }[] = [
  { status: "saved", label: "Saved", tone: "neutral" },
  { status: "applied", label: "Applied", tone: "accent" },
  { status: "oa", label: "Assessment", tone: "warning" },
  { status: "interview", label: "Interview", tone: "warning" },
  { status: "offer", label: "Offer", tone: "success" },
  { status: "rejected", label: "Rejected", tone: "danger" },
  { status: "ghosted", label: "No response", tone: "neutral" },
];

export const EVENT_LABEL: Record<string, string> = {
  applied_confirm: "Application confirmed",
  oa: "Assessment",
  interview: "Interview",
  rejection: "Rejection",
  offer: "Offer",
  manual: "Note",
  other: "Other",
};

/** Opens one message in Gmail's web UI, in the right account when several are signed in. */
export function gmailLink(messageId: string, account?: string | null): string {
  const auth = account ? `?authuser=${encodeURIComponent(account)}` : "";
  return `https://mail.google.com/mail/u/0/${auth}#all/${encodeURIComponent(messageId)}`;
}

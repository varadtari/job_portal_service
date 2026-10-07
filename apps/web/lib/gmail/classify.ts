// Rule-based classification of job-application emails (no AI).

export type EmailType = "applied_confirm" | "oa" | "interview" | "rejection" | "offer" | "other";

export type Email = { from: string; subject: string; text: string };

const P = (parts: string[]) => new RegExp(parts.join("|"), "i");

const NOISE = P([
  "job alert", "jobs? you may be interested", "recommended (jobs|for you)", "new jobs? (matching|for you|posted)", "jobs? matching your",
  "similar jobs", "is hiring", "are hiring", "apply now to", "top (jobs|openings)", "weekly digest", "newsletter", "your profile (was|has been) viewed",
  "people viewed your", "complete your profile", "webinar", "verify your email", "confirm your email address", "password reset",
  "\\d+ more .{0,40}jobs?", "handpicked", "urgent(ly)? (requirement|hiring)", "immediate requirement", "new job opportunities",
  "better matches", "career preferences", "interview prep", "\\bcourses?\\b", "bootcamp", "masterclass", "\\bsale\\b", "% off", "download",
  "work anniversary", "^✉?\\s*job \\|", "follow your application",
  // Non-job "applications"
  "certificate", "leave application", "receipt", "invoice", "payment", "loan", "passport", "admission", "oauth application",
]);

// Mail from these is marketing/alerts even when it mentions applications or interviews
const NOISE_SENDER = /jobalert|alerts?@|newsletter|marketing|promo|udemymail|ambitionbox|@e\.|news@/i;

const OFFER = P([
  "pleased to (offer|extend)", "extend(ing)? (you )?an offer", "offer letter", "offer of employment", "job offer", "formal offer",
  "congratulations[^.]{0,80}offer", "accept(ance of)? (the|this|our) offer", "offer details",
]);

const REJECTION = P([
  "unfortunately", "regret to inform", "not (be )?moving forward", "won.?t be moving forward", "will not be moving forward",
  "decided to (move|proceed|go) forward with other", "pursue other candidates", "other candidates (whose|who)", "not been selected",
  "not selected", "position has been filled", "role has been filled", "not (a|the right) (match|fit) at this time", "no longer (being )?considered",
  "decided not to proceed", "not to progress", "won.?t be progressing", "will not be progressing", "not be progressing", "unable to offer you",
  "not able to move forward", "we have decided to close", "keep your (resume|profile|details) on file",
]);

const OA = P([
  "hackerrank", "codility", "hackerearth", "codesignal", "testgorilla", "mettl", "imocha", "karat", "coderbyte", "glider",
  "online (assessment|test|coding)", "coding (assessment|challenge|test|round)", "technical assessment", "take[- ]home",
  "assessment (link|invitation|invite)", "complete (the|this|an|your) assessment", "take an assessment", "aptitude test", "skills? (assessment|test)",
]);

// Subject: the word is enough. Body: needs an actual invitation / scheduling signal.
const INTERVIEW_SUBJECT = P(["interview", "phone screen", "screening call", "next round", "let.?s (chat|talk|connect)"]);
const INTERVIEW_BODY = P([
  "schedule (a|an|your) (call|chat|conversation|meeting|interview|time)", "invite you (to|for) (an? )?(interview|call|chat)",
  "interview (invitation|invite|slot|is scheduled|has been scheduled|round)", "calendly", "share your availability", "your availability",
  "available (times|slots)", "time slots", "would (like|love) to (speak|chat|talk|meet) with you", "phone screen", "screening call",
  "google meet", "zoom (link|meeting)", "teams meeting",
]);

const APPLIED = P([
  "thank(s| you) for (applying|your application|your interest)", "(we|we've|we have) received your application", "application (has been )?received",
  "application (was )?(successfully )?submitted", "application successful", "received your (application|resume|cv)", "your application (for|to)",
  "successfully applied", "applied (for|to) the", "application confirmation", "you applied", "thanks for applying", "^indeed application:",
  "next steps for your application",
]);

const NOT_A_JOB = /certificate|leave application|receipt|payment|oauth/i;

export function classifyEmail(e: Email): { type: EmailType; confidence: number } {
  const subject = (e.subject ?? "").trim();
  const body = (e.text ?? "").slice(0, 6000);
  const all = `${subject}\n${body}`;
  const hit = (re: RegExp) => (re.test(subject) ? 2 : 0) + (re.test(body) ? 1 : 0);
  const confirmSubject = APPLIED.test(subject) && !NOT_A_JOB.test(subject);

  if (NOISE_SENDER.test(e.from ?? "") && !confirmSubject) return { type: "other", confidence: 0.8 };
  if (NOISE.test(subject) && !confirmSubject) return { type: "other", confidence: 0.8 };

  const interview = (INTERVIEW_SUBJECT.test(subject) ? 2 : 0) + (INTERVIEW_BODY.test(body) ? 1 : 0);
  const scores: [EmailType, number][] = [
    ["offer", hit(OFFER)],
    ["rejection", hit(REJECTION)],
    ["oa", hit(OA)],
    ["interview", interview],
    ["applied_confirm", hit(APPLIED)],
  ];
  // Precedence: offer > rejection > assessment > interview > confirmation.
  // Rejections often mention interviews or thank you "for applying", so they win over both.
  for (const [type, score] of scores) {
    if (score === 0) continue;
    if (type === "interview" && interview < 2 && /thank(s| you) for (applying|your application)/i.test(all)) continue;
    return { type, confidence: score >= 2 ? 0.9 : 0.65 };
  }
  return { type: "other", confidence: 0.5 };
}

// ---- status machine ----

export type Status = "saved" | "applied" | "oa" | "interview" | "offer" | "rejected" | "ghosted";

const RANK: Record<Status, number> = { saved: 0, applied: 1, ghosted: 1, oa: 2, interview: 3, offer: 4, rejected: 5 };

const FROM_EVENT: Partial<Record<EmailType, Status>> = {
  applied_confirm: "applied",
  oa: "oa",
  interview: "interview",
  offer: "offer",
  rejection: "rejected",
};

/** Applications only move forward; a rejection can end any stage; an offer can't be undone by a later email. */
export function nextStatus(current: Status, event: EmailType): Status {
  const target = FROM_EVENT[event];
  if (!target) return current;
  if (current === "offer" && target === "rejected") return current;
  if (target === "rejected") return "rejected";
  if (current === "rejected") return current;
  return RANK[target] > RANK[current] || current === "ghosted" ? target : current;
}

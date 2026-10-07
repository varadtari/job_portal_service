// Fallback follow-up text (used when Gemini is unavailable). Short, polite, factual.

export type FollowUpInput = {
  candidateName: string;
  company: string;
  role: string;
  appliedAt: Date | null;
  followUpNumber: number; // 1 = first nudge
  contactName: string | null;
  highlight: string | null; // one factual line from the resume, e.g. "3 years building payment APIs in Go"
  replyToSubject: string | null;
};

const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "long" });

export function templateFollowUp(i: FollowUpInput): { subject: string; body: string } {
  const greeting = i.contactName ? `Hi ${i.contactName.split(" ")[0]},` : "Hello,";
  const when = i.appliedAt ? ` on ${fmt(i.appliedAt)}` : "";
  const subject = i.replyToSubject ? (/^re:/i.test(i.replyToSubject) ? i.replyToSubject : `Re: ${i.replyToSubject}`) : `Following up on my application: ${i.role}`;
  const body =
    i.followUpNumber <= 1
      ? [
          greeting,
          "",
          `I applied for the ${i.role} position at ${i.company}${when} and wanted to follow up on my application.`,
          i.highlight ? `I'm particularly excited about the role given my experience ${i.highlight.replace(/^[A-Z]/, (c) => c.toLowerCase())}.` : `I'm still very interested in the role and would welcome the chance to discuss how I can contribute to the team.`,
          "",
          "Is there any update you can share on the next steps? I'm happy to provide anything else you need.",
          "",
          "Thank you for your time,",
          i.candidateName,
        ]
      : [
          greeting,
          "",
          `I wanted to check in once more about the ${i.role} role at ${i.company}. I remain very interested and would be glad to share more about my background if helpful.`,
          "",
          "Thanks again for considering my application,",
          i.candidateName,
        ];
  return { subject, body: body.join("\n") };
}

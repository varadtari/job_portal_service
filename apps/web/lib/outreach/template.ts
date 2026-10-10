// Fallback outreach email (when Gemini is unavailable). Several wordings so a batch isn't identical.

export type OutreachInput = {
  candidateName: string;
  headline: string | null; // e.g. "Backend Developer"
  company: string;
  role: string | null; // matching open role, if known
  targetRole: string; // what the candidate is looking for, e.g. "backend developer"
  contactName: string | null; // only for named people
  skills: string[]; // strongest relevant skills, from the resume
  location: string | null; // candidate's city
};

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

export function templateOutreach(i: OutreachInput, seed = ""): { subject: string; body: string } {
  const v = hash(`${seed}|${i.company}`) % 3;
  const greet = i.contactName ? `Hi ${i.contactName.split(" ")[0]},` : ["Hello,", "Hi there,", "Hello Hiring Team,"][v];
  const role = i.role ?? i.targetRole;
  const me = i.headline ? `a ${i.headline.split("|")[0].trim()}` : `a ${i.targetRole}`;
  const skills = i.skills.slice(0, 3);
  const skillLine = skills.length ? ` I work mainly with ${list(skills)}.` : "";
  const where = i.location ? ` based in ${i.location}` : "";
  const subject = [
    `${i.role ? `Application: ${i.role}` : `${cap(i.targetRole)} – interested in ${i.company}`}`,
    `${cap(role)} role at ${i.company}`,
    `${i.candidateName} – ${cap(role)}`,
  ][v];
  const opener = [
    `I'm ${me}${where}, and I'd love to be considered for ${i.role ? `the ${i.role} role` : `${i.targetRole} opportunities`} at ${i.company}.`,
    `I came across ${i.company} and wanted to reach out about ${i.role ? `the ${i.role} opening` : `${i.targetRole} roles on your team`}. I'm ${me}${where}.`,
    `I'm writing to express my interest in ${i.role ? `the ${i.role} position` : `${i.targetRole} positions`} at ${i.company}. I'm ${me}${where}.`,
  ][v];
  const ask = [
    "I've attached my resume. Would you be open to a short conversation, or could you point me to the right person?",
    "My resume is attached. If there's a fit, I'd be glad to talk about how I could help the team.",
    "Please find my resume attached. I'd appreciate it if you could consider me or forward it to the hiring manager.",
  ][v];
  const body = [greet, "", `${opener}${skillLine}`, "", ask, "", "Thank you for your time,", i.candidateName].join("\n");
  return { subject, body };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

import { describe, expect, it } from "vitest";
import { parseResumeHeuristic } from "@/lib/resume/heuristic";
import { ResumeContent } from "@/lib/resume/types";

// Exactly what unpdf produced from a LibreOffice-exported PDF (note the wrapped lines).
const PDF_TEXT = `Asha Kulkarni
Senior Software Engineer | asha.k@example.com | +91 98200 11111 | Pune,
Maharashtra, India
linkedin.com/in/ashak | github.com/ashak
SUMMARY
Backend engineer with 6 years building payment systems in Go and Python.
EXPERIENCE
Razorpay — Senior Software Engineer, Bengaluru (Mar 2022 – Present)
- Led migration of settlement service to Go, cutting p99 latency by 40%.
- Designed idempotent payout APIs handling 2M requests/day.
Infosys — Software Engineer (Jul 2019 – Feb 2022)
- Built REST services in Python/Django for a banking client.
EDUCATION
College of Engineering Pune — B.Tech, Computer Engineering (2015 – 2019), CGPA
8.6
SKILLS
Languages: Go, Python, SQL
Tools: Kafka, PostgreSQL, Docker, Kubernetes`;

describe("parseResumeHeuristic: dash-separated resume", () => {
  const r = parseResumeHeuristic(PDF_TEXT);

  it("produces schema-valid output", () => {
    expect(ResumeContent.safeParse(r).success).toBe(true);
  });

  it("parses basics and re-joins wrapped lines", () => {
    expect(r.basics).toMatchObject({
      name: "Asha Kulkarni",
      email: "asha.k@example.com",
      phone: "+91 98200 11111",
      headline: "Senior Software Engineer",
      location: "Pune, Maharashtra, India",
      summary: "Backend engineer with 6 years building payment systems in Go and Python.",
    });
    expect(r.basics.links.map((l) => l.label)).toEqual(["LinkedIn", "GitHub"]);
  });

  it("parses experience entries with dates and bullets", () => {
    expect(r.experience).toHaveLength(2);
    expect(r.experience[0]).toMatchObject({
      company: "Razorpay",
      title: "Senior Software Engineer",
      location: "Bengaluru",
      start: "Mar 2022",
      end: null,
      current: true,
    });
    expect(r.experience[0].bullets).toHaveLength(2);
    expect(r.experience[1]).toMatchObject({ company: "Infosys", title: "Software Engineer", start: "Jul 2019", end: "Feb 2022", current: false });
  });

  it("parses education with degree, field and grade", () => {
    expect(r.education[0]).toMatchObject({
      institution: "College of Engineering Pune",
      degree: "B.Tech",
      field: "Computer Engineering",
      start: "2015",
      end: "2019",
      grade: "CGPA 8.6",
    });
  });

  it("parses categorised skills", () => {
    expect(r.skills).toEqual([
      { category: "Languages", items: ["Go", "Python", "SQL"] },
      { category: "Tools", items: ["Kafka", "PostgreSQL", "Docker", "Kubernetes"] },
    ]);
  });
});

const FRESHER = `RAHUL SHARMA
rahul.sharma@gmail.com • 9876543210 • Bengaluru, Karnataka • https://github.com/rahuls

Objective
Seeking an entry-level software role.

Work Experience
Software Engineering Intern at Flipkart | 06/2023 - 08/2023
• Built a dashboard in React that reduced manual reporting by
  hours every week.

Projects
Expense Tracker (React, Node.js, MongoDB) | github.com/rahuls/expense
• Tracks expenses with charts.
Chat App | Tech: Socket.io, Express
• Real-time messaging.

Education
B.Tech in Computer Science | VIT University | 2020 - 2024 | CGPA: 8.9/10
Class XII | Delhi Public School | 2020 | 92%

Technical Skills
Java, Python, JavaScript, React

Certifications
AWS Certified Cloud Practitioner — Amazon Web Services (2023)

Achievements
• Winner, Smart India Hackathon 2022`;

describe("parseResumeHeuristic: fresher resume", () => {
  const r = parseResumeHeuristic(FRESHER);

  it("is schema-valid", () => expect(ResumeContent.safeParse(r).success).toBe(true));

  it("parses basics with bullet separators", () => {
    expect(r.basics).toMatchObject({ name: "RAHUL SHARMA", email: "rahul.sharma@gmail.com", phone: "9876543210", location: "Bengaluru, Karnataka" });
    expect(r.basics.links[0]).toMatchObject({ label: "GitHub" });
    expect(r.basics.summary).toBe("Seeking an entry-level software role.");
  });

  it("handles 'Title at Company' and numeric dates, and joins wrapped bullets", () => {
    expect(r.experience[0]).toMatchObject({ title: "Software Engineering Intern", company: "Flipkart", start: "06/2023", end: "08/2023" });
    expect(r.experience[0].bullets).toEqual(["Built a dashboard in React that reduced manual reporting by hours every week."]);
  });

  it("parses projects with tech lists and urls", () => {
    expect(r.projects[0]).toMatchObject({ name: "Expense Tracker", tech: ["React", "Node.js", "MongoDB"], url: "github.com/rahuls/expense" });
    expect(r.projects[1]).toMatchObject({ name: "Chat App", tech: ["Socket.io", "Express"] });
  });

  it("parses 'Degree in Field' and multiple education rows", () => {
    expect(r.education[0]).toMatchObject({ institution: "VIT University", degree: "B.Tech", field: "Computer Science", start: "2020", end: "2024", grade: "CGPA: 8.9/10" });
    expect(r.education[1]).toMatchObject({ institution: "Delhi Public School", degree: "Class XII", end: "2020", grade: "92%" });
  });

  it("parses skills, certifications and extra sections", () => {
    expect(r.skills).toEqual([{ category: "Skills", items: ["Java", "Python", "JavaScript", "React"] }]);
    expect(r.certifications[0]).toMatchObject({ name: "AWS Certified Cloud Practitioner", issuer: "Amazon Web Services", date: "2023" });
    expect(r.extra).toEqual([{ heading: "Achievements", items: ["Winner, Smart India Hackathon 2022"] }]);
  });
});

// Title-first format with a specialisation line (reconstructed from a real misparse)
const TITLE_FIRST = `VARAD TARI
Software Engineer | Backend, Full-Stack & Integration Engineering
+91 9146370904 | varadtari@gmail.com | linkedin.com/in/varad-tari-76aa9223
PROFESSIONAL SUMMARY
Software Engineer with 2+ years of experience building backend services.
EXPERIENCE
Software Developer — RMJ V Innovations Pvt Ltd | Jan 2023 – Present
- Built REST APIs in Golang and Python.
Intern | Acme Technologies | Jun 2022 – Dec 2022
- Wrote integration tests.
Razorpay — Senior Software Engineer (Mar 2022 – Present)
- Kept company-first order working.
EDUCATION
Padre Conceicao College of Engineering — Bachelor's Degree, Information Technology (2019 – 2023)`;

describe("parseResumeHeuristic: title-first resume", () => {
  const r = parseResumeHeuristic(TITLE_FIRST);
  it("doesn't mistake a specialisation line for a location", () => {
    expect(r.basics.location).toBeNull();
    expect(r.basics.headline).toBe("Software Engineer | Backend, Full-Stack & Integration Engineering");
    expect(r.basics).toMatchObject({ name: "VARAD TARI", email: "varadtari@gmail.com", phone: "+91 9146370904" });
  });
  it("detects Title — Company order", () => {
    expect(r.experience[0]).toMatchObject({ title: "Software Developer", company: "RMJ V Innovations Pvt Ltd", start: "Jan 2023", current: true });
    expect(r.experience[1]).toMatchObject({ title: "Intern", company: "Acme Technologies" });
    expect(r.experience[2]).toMatchObject({ title: "Senior Software Engineer", company: "Razorpay" });
  });
  it("still parses education", () => {
    expect(r.education[0]).toMatchObject({ institution: "Padre Conceicao College of Engineering", field: "Information Technology", end: "2023" });
  });
});

describe("experience heading variants", () => {
  it("treats EARLIER EXPERIENCE and INTERNSHIPS as experience", () => {
    const r = parseResumeHeuristic(`Name Person
a@b.co
EXPERIENCE
Software Developer — Acme Pvt Ltd | Feb 2025 – Present
- Did things.
PROJECTS
Log Service | Go
- Built it.
EARLIER EXPERIENCE
Web Developer Intern — Beta Technologies | Jan 2022 – Mar 2022
- Built pages.
INTERNSHIPS
Intern | Gamma Labs | 2021
- Helped.`);
    expect(r.experience.map((e) => `${e.title}@${e.company}`)).toEqual([
      "Software Developer@Acme Pvt Ltd",
      "Web Developer Intern@Beta Technologies",
      "Intern@Gamma Labs",
    ]);
    expect(r.projects.map((p) => p.name)).toEqual(["Log Service"]);
  });
});

import { describe, expect, it } from "vitest";
import { learnedKey } from "@/lib/profile/fields";
import { profileFromResume } from "@/lib/profile/from-resume";
import type { ResumeContent } from "@/lib/resume/types";

const resume: ResumeContent = {
  basics: {
    name: "Varad Tari",
    email: "v@example.com",
    phone: "+91 90000 00000",
    location: "Pune, Maharashtra, India",
    headline: null,
    summary: "Backend engineer.",
    links: [
      { label: "LinkedIn", url: "linkedin.com/in/varad" },
      { label: "GitHub", url: "https://github.com/varad" },
      { label: "Site", url: "https://varad.dev" },
    ],
  },
  experience: [
    { company: "Old Co", title: "Intern", location: null, start: "2020", end: "2021", current: false, bullets: [] },
    { company: "Acme", title: "SDE II", location: null, start: "2022", end: null, current: true, bullets: [] },
  ],
  education: [{ institution: "COEP", degree: "B.Tech", field: "CS", start: "2016", end: "May 2020", grade: null, details: [] }],
  skills: [],
  projects: [],
  certifications: [],
  extra: [],
};

describe("profileFromResume", () => {
  const p = profileFromResume(resume);
  it("splits name and location", () => {
    expect(p).toMatchObject({ first_name: "Varad", last_name: "Tari", city: "Pune", state: "Maharashtra", country: "India" });
  });
  it("classifies links and adds a scheme", () => {
    expect(p.linkedin_url).toBe("https://linkedin.com/in/varad");
    expect(p.github_url).toBe("https://github.com/varad");
    expect(p.portfolio_url).toBe("https://varad.dev");
  });
  it("prefers the current job and extracts graduation year", () => {
    expect(p).toMatchObject({ current_title: "SDE II", current_company: "Acme", graduation_year: "2020", university: "COEP" });
  });
});

describe("learnedKey", () => {
  it("normalises question text", () => {
    expect(learnedKey("Why do you want to work at Stripe?*")).toBe("why do you want to work at stripe");
    expect(learnedKey("  Desired Salary (INR):  ")).toBe("desired salary inr");
  });
});

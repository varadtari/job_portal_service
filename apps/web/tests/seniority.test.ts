import { describe, expect, it } from "vitest";
import { levelMatches } from "@/lib/jobs/seniority";

describe("levelMatches: junior", () => {
  it.each(["Software Engineer", "SDE II", "SDE-1", "Associate Software Engineer", "Backend Developer", "Data Engineer I", "Software Engineer 2", "Full Stack Developer"])(
    "keeps %s",
    (t) => expect(levelMatches(t, "junior")).toBe(true),
  );
  it.each(["Senior Software Engineer", "Sr. Backend Developer", "Staff Engineer", "Principal Data Scientist", "Engineering Manager", "Tech Lead - Platform",
    "Software Engineer III", "SDE 3", "Solutions Architect", "Software Engineering Intern", "Head of Data", "Director, Engineering"])(
    "drops %s",
    (t) => expect(levelMatches(t, "junior")).toBe(false),
  );
});

describe("levelMatches: other levels", () => {
  it("fresher keeps interns and entry roles", () => {
    expect(levelMatches("Software Engineering Intern", "fresher")).toBe(true);
    expect(levelMatches("Graduate Engineer Trainee", "fresher")).toBe(true);
    expect(levelMatches("Senior Engineer", "fresher")).toBe(false);
  });
  it("senior keeps senior/staff/lead, drops junior", () => {
    expect(levelMatches("Staff Software Engineer", "senior")).toBe(true);
    expect(levelMatches("Junior Developer", "senior")).toBe(false);
  });
  it("any keeps everything", () => expect(levelMatches("VP Engineering", "any")).toBe(true));
});

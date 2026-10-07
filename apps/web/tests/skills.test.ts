import { describe, expect, it } from "vitest";
import { extractSkills, matchSkills } from "@/lib/match/skills";

describe("extractSkills", () => {
  it("finds skills via aliases and word boundaries", () => {
    const s = extractSkills("We use Golang, Node.js and Postgres on k8s. Experience with RESTful APIs and CI/CD.");
    expect(s).toEqual(expect.arrayContaining(["Go", "Node.js", "PostgreSQL", "Kubernetes", "REST APIs", "CI/CD"]));
  });
  it("avoids false positives for short words", () => {
    const s = extractSkills("Let's go to the next stage. We rest on weekends. Java is not JavaScript-only.");
    expect(s).not.toContain("Go");
    expect(s).not.toContain("REST APIs");
    expect(s).toEqual(expect.arrayContaining(["Java", "JavaScript"]));
  });
  it("handles symbols", () => {
    expect(extractSkills("C++ and C# with .NET")).toEqual(expect.arrayContaining(["C++", "C#", ".NET"]));
  });
});

describe("matchSkills", () => {
  it("scores overlap and lists gaps", () => {
    expect(matchSkills(["Go", "Kafka", "AWS", "Docker"], new Set(["Go", "Docker"]))).toEqual({ score: 50, matched: ["Go", "Docker"], missing: ["Kafka", "AWS"] });
  });
  it("returns null for vague descriptions", () => {
    expect(matchSkills(["Go"], new Set(["Go"]))).toBeNull();
  });
});

import { matchRank } from "@/lib/match/skills";

describe("matchRank", () => {
  const m = (matched: number, missing: number) => ({ score: 0, matched: Array(matched).fill("x"), missing: Array(missing).fill("y") });
  it("prefers many matched skills over a high % on a thin description", () => {
    expect(matchRank(m(8, 2))).toBeGreaterThan(matchRank(m(3, 1)));
    expect(matchRank(m(6, 4))).toBeGreaterThan(matchRank(m(3, 1)));
    expect(matchRank(null)).toBe(-1);
  });
});

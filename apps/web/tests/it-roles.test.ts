import { describe, expect, it } from "vitest";
import { isITRole } from "@/lib/jobs/it-roles";

describe("isITRole", () => {
  it.each([
    "Senior Software Engineer", "SDE II", "Backend Developer (Go)", "Full Stack Engineer", "Data Engineer", "Data Scientist",
    "Machine Learning Engineer", "DevOps Engineer", "Site Reliability Engineer", "QA Automation Engineer", "SDET",
    "Security Engineer, Cloud", "Network Engineer", "IT Support Specialist", "Solutions Architect", "Engineering Manager - Backend",
    "Android Developer", "Product Designer", "Technical Program Manager", "Product Manager, Platform", "Database Administrator",
  ])("IT: %s", (t) => expect(isITRole(t)).toBe(true));

  it.each([
    "Account Executive - Enterprise", "Sales Engineer", "Marketing Manager", "Technical Recruiter", "HR Business Partner",
    "Finance Analyst", "Mechanical Engineer", "Civil Site Engineer", "Customer Success Manager", "Legal Counsel",
    "Office Manager", "Payroll Specialist", "Sales Development Representative",
  ])("not IT: %s", (t) => expect(isITRole(t)).toBe(false));
});

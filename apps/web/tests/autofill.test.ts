import { describe, expect, it } from "vitest";
import { answersToLearn, matchFields, pickOption, ruleKey, type FieldDescriptor } from "@/lib/autofill/match";

const f = (label: string, extra: Partial<FieldDescriptor> = {}): FieldDescriptor => ({ id: label, label, type: "text", ...extra });

describe("ruleKey", () => {
  it.each([
    ["First Name*", "first_name"], ["Last Name", "last_name"], ["Full name", "full_name"], ["Email", "email"],
    ["Phone", "phone"], ["Mobile Number", "phone"], ["LinkedIn Profile", "linkedin_url"], ["GitHub URL", "github_url"],
    ["Website", "portfolio_url"], ["Current Company", "current_company"], ["Current CTC (in LPA)", "current_salary"],
    ["Expected CTC", "expected_salary"], ["What are your salary expectations?", "expected_salary"],
    ["Notice Period (days)", "notice_period"], ["Total years of experience", "years_experience"],
    ["Will you now or in the future require sponsorship for employment visa status?", "requires_sponsorship"],
    ["Are you legally authorized to work in the country in which this job is located?", "work_authorization"],
    ["Are you willing to relocate?", "willing_to_relocate"], ["How did you hear about this job?", "how_did_you_hear"],
    ["Location (City)", "city"], ["Country", "country"], ["Pin Code", "postal_code"], ["College / University", "university"],
    ["Year of passing", "graduation_year"], ["Gender", "gender"], ["Veteran Status", "veteran_status"],
    ["Disability Status", "disability_status"], ["Earliest start date", "earliest_start_date"], ["Cover Letter", "cover_letter"],
  ])("%s → %s", (label, key) => expect(ruleKey(f(label))).toBe(key));

  it("uses autocomplete and name attributes", () => {
    expect(ruleKey(f("", { autocomplete: "given-name" }))).toBe("first_name");
    expect(ruleKey(f("", { name: "job_application[email]" }))).toBe("email");
  });
  it("skips sensitive and upload fields", () => {
    for (const l of ["Resume/CV", "Password", "Enter OTP", "I agree to the privacy policy"]) expect(ruleKey(f(l))).toBeNull();
  });
});

describe("pickOption", () => {
  it("handles yes/no wording", () => {
    expect(pickOption("No", ["Select...", "Yes", "No"])).toBe("No");
    expect(pickOption("Yes", ["Yes, I am authorized", "No, I am not authorized"])).toBe("Yes, I am authorized");
    expect(pickOption("No", ["Yes, I will require sponsorship", "No, I will not require sponsorship"])).toBe("No, I will not require sponsorship");
  });
  it("puts numbers into ranges", () => {
    expect(pickOption("2", ["0-1 years", "1-3 years", "3-5 years", "5+ years"])).toBe("1-3 years");
    expect(pickOption("7", ["Less than 2", "2 - 5", "5+"])).toBe("5+");
    expect(pickOption("1", ["Less than 2 years", "2-5 years"])).toBe("Less than 2 years");
  });
  it("matches names and prefixes", () => {
    expect(pickOption("India", ["United States", "India", "Indonesia"])).toBe("India");
    expect(pickOption("Male", ["Female", "Male", "Decline to self-identify"])).toBe("Male");
    expect(pickOption("LinkedIn", ["Company website", "LinkedIn Job Post", "Referral"])).toBe("LinkedIn Job Post");
    expect(pickOption("Mars", ["Earth", "Venus"])).toBeNull();
  });
});

describe("matchFields", () => {
  const profile = [
    { key: "first_name", label: null, value: "Varad", source: "resume" },
    { key: "last_name", label: null, value: "Tari", source: "resume" },
    { key: "city", label: null, value: "Goa", source: "resume" },
    { key: "country", label: null, value: "India", source: "resume" },
    { key: "years_experience", label: null, value: "2", source: "manual" },
    { key: "requires_sponsorship", label: null, value: "No", source: "manual" },
    { key: "why do you want to work at our company", label: "Why do you want to work at our company?", value: "Because …", source: "learned" },
  ];
  it("fills rules, derived values, selects and learned answers", () => {
    const out = matchFields(
      [
        f("Full Name"),
        f("Location"),
        f("Years of experience", { type: "select", options: ["Select", "0-1", "1-3", "3-5"] }),
        f("Do you require visa sponsorship?", { type: "radio", options: ["Yes", "No"] }),
        f("Why do you want to work at Stripe?", { type: "textarea" }),
        f("Favourite colour"),
        f("Upload resume", { type: "file" }),
      ],
      profile,
    );
    expect(out.map((m) => m.value)).toEqual(["Varad Tari", "Goa, India", "1-3", "No", "Because …", null, null]);
    expect(out[4].source).toBe("learned");
  });
});

describe("answersToLearn", () => {
  it("learns new questions and fills only missing canonical fields", () => {
    const profile = [{ key: "phone", label: null, value: "+91 1", source: "manual" }];
    const learned = answersToLearn(
      [
        { ...f("Phone"), value: "+91 2" }, // existing → not overwritten
        { ...f("Notice period"), value: "30 days" }, // missing canonical → saved
        { ...f("What excites you about this role?", { type: "textarea" }), value: "The scale." },
        { ...f("Password"), value: "secret" },
        { ...f("Full name"), value: "Varad Tari" }, // derived key → ignored
      ],
      profile,
    );
    expect(learned).toEqual([
      { key: "notice_period", label: null, value: "30 days" },
      { key: "what excites you about this role", label: "What excites you about this role?", value: "The scale." },
    ]);
  });
});

import { similarity } from "@/lib/autofill/match";

describe("similarity", () => {
  it("matches company-specific rewordings but not different questions", () => {
    expect(similarity("why do you want to work at stripe", "why do you want to work at our company")).toBeGreaterThanOrEqual(0.6);
    expect(similarity("why do you want to leave your current job", "why do you want to work at our company")).toBeLessThan(0.6);
  });
});

describe("answersToLearn: autofilled saved answers", () => {
  it("doesn't save an unchanged saved answer again under a company-specific question", () => {
    const profile = [{ key: "why do you want to work at our company", label: "Why…?", value: "I like payments.", source: "learned" }];
    expect(answersToLearn([{ ...f("Why do you want to work at Acme?", { type: "textarea" }), value: "I like payments." }], profile)).toEqual([]);
    // …but an edited answer is learned
    expect(answersToLearn([{ ...f("Why do you want to work at Acme?", { type: "textarea" }), value: "Acme's API work." }], profile)).toHaveLength(1);
  });
});

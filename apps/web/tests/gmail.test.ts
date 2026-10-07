import { describe, expect, it } from "vitest";
import { classifyEmail, nextStatus } from "@/lib/gmail/classify";
import { guessCompany, matchApplication } from "@/lib/gmail/match";

const e = (subject: string, text = "", from = "Acme <no-reply@greenhouse.io>") => ({ subject, text, from });

describe("classifyEmail", () => {
  it.each([
    [e("Thank you for applying to Razorpay!", "We have received your application for Backend Engineer."), "applied_confirm"],
    [e("Your application for SDE II at Meesho", "Thanks for your interest. Our team will review your profile."), "applied_confirm"],
    [e("Update on your application", "Thank you for your interest in Acme. Unfortunately, we have decided to move forward with other candidates."), "rejection"],
    [e("Your candidacy at Okta", "After careful consideration we will not be moving forward with your application at this time."), "rejection"],
    [e("Thank you for interviewing with us", "We enjoyed the interview but regret to inform you that we will not be progressing."), "rejection"],
    [e("Invitation: Online Assessment for Backend Engineer", "Please complete the HackerRank test within 72 hours."), "oa"],
    [e("Next steps: coding challenge", "Your Codility link is below."), "oa"],
    [e("Interview invitation - Software Engineer", "We'd like to schedule an interview. Please share your availability."), "interview"],
    [e("Let's chat!", "The hiring manager would like to speak with you. Book a time on Calendly."), "interview"],
    [e("Offer Letter - Software Engineer", "We are pleased to offer you the position."), "offer"],
    [e("Congratulations!", "Congratulations, we'd like to extend an offer to you for the role."), "offer"],
    [e("10 new jobs matching Backend Developer", "Apply now to these jobs"), "other"],
    [e("Your weekly digest", "People viewed your profile"), "other"],
    [e("Lunch on Friday?", "Want to grab food?"), "other"],
  ])("%#: %o → %s", (email, type) => expect(classifyEmail(email).type).toBe(type));

  it("doesn't treat a confirmation that mentions interviews as an interview", () => {
    expect(classifyEmail(e("Thank you for applying!", "If your profile matches, our recruiters will reach out to schedule an interview.")).type).toBe("applied_confirm");
  });
});

describe("nextStatus", () => {
  it("only moves forward, rejection ends any stage, offer is sticky", () => {
    expect(nextStatus("saved", "applied_confirm")).toBe("applied");
    expect(nextStatus("interview", "applied_confirm")).toBe("interview");
    expect(nextStatus("applied", "oa")).toBe("oa");
    expect(nextStatus("oa", "interview")).toBe("interview");
    expect(nextStatus("interview", "rejection")).toBe("rejected");
    expect(nextStatus("rejected", "interview")).toBe("rejected");
    expect(nextStatus("offer", "rejection")).toBe("offer");
    expect(nextStatus("ghosted", "interview")).toBe("interview");
    expect(nextStatus("applied", "other")).toBe("applied");
  });
});

describe("matching", () => {
  const apps = [
    { id: "1", company: "Razorpay Software Private Limited", title: "Backend Engineer" },
    { id: "2", company: "Meesho", title: "SDE II" },
    { id: "3", company: "Toast", title: "Software Engineer II" },
    { id: "4", company: "Toast", title: "Senior Software Engineer" },
  ];
  it("matches by subject / body / sender domain", () => {
    expect(matchApplication(e("Thank you for applying to Razorpay!"), apps).app?.id).toBe("1");
    expect(matchApplication(e("Application update", "Hi, thanks for applying to Meesho.", "Meesho Careers <careers@meesho.com>"), apps).app?.id).toBe("2");
    expect(matchApplication(e("Hello", "body", "Talent <talent@razorpay.com>"), apps).app?.id).toBe("1");
  });
  it("uses the job title to choose between two applications at one company", () => {
    expect(matchApplication(e("Your application: Software Engineer II at Toast"), apps).app?.id).toBe("3");
  });
  it("reports ambiguity instead of guessing", () => {
    const r = matchApplication(e("Update from Toast"), apps);
    expect(r.app).toBeNull();
    expect(r.ambiguous).toBe(true);
  });
  it("ignores ATS platform domains as employer evidence", () => {
    expect(matchApplication(e("Hello", "nothing here", "no-reply@greenhouse.io"), apps).app).toBeNull();
  });
  it("guesses the company for applications made outside JobPilot", () => {
    expect(guessCompany(e("Thank you for applying to Zepto!"))).toBe("Zepto");
    expect(guessCompany(e("We received your application", "", "Hiring Team <jobs@swiggy.in>"))).toBe("Swiggy");
    expect(guessCompany(e("Application received", "", "PhonePe Careers <no-reply@greenhouse.io>"))).toBe("PhonePe");
  });
});

describe("classifyEmail: regressions from a real inbox", () => {
  it.each([
    [e("Goa Online Services - Residence Certificate Application Receipt Acknowledgement", "", "noreply@goa.gov.in"), "other"],
    [e("Leave Application Status", "Your leave application was approved", "hr@company.com"), "other"],
    [e("Your SQL Interview Prep — 1,000+ Q&A is ready — instant download inside", "", "news@learnandexcel.in"), "other"],
    [e("More roles. Better matches. Instahyre 2.0 is ready for you.", "Get interview calls faster", "team@instahyre.com"), "other"],
    [e("Application Developer, Data & Analytics at CommScope. 11 more IT jobs", "", "alert@jobalert.indeed.com"), "other"],
    [e("✉️ Job | Data Science Lead in Sawantwadi", "Recruiter wants to interview you", "info@naukri.com"), "other"],
    [e("[GitHub] A third-party OAuth application has been added to your account", "", "noreply@github.com"), "other"],
    [e("Follow your application status, Varad", "Track your application. Our interview process has several stages.", "jobs@siemens.com"), "other"],
    [e("Indeed Application: Software Engineer II", "Your application has been submitted", "indeedapply@indeed.com"), "applied_confirm"],
    [e("Application Successful: Numino Labs - Senior Backend Engineer - Python", "", "noreply@hirist.tech"), "applied_confirm"],
    [e("Your Cisco Journey Begins Here – Next Steps for Your Application", "", "noreply@cisco.com"), "applied_confirm"],
    [e("Urban Ground GmbH invites you to take an assessment", "", "noreply@coderbyte.com"), "oa"],
    [e("Interview Schedule for the Post of Software Engineer (Contractual)", "", "hr.office@gmail.com"), "interview"],
    [e("An update on your application to Canonical - Golang Engineer", "Unfortunately we will not be progressing your application.", "no-reply@us.greenhouse-mail.io"), "rejection"],
  ])("%#: %o → %s", (email, type) => expect(classifyEmail(email).type).toBe(type));

  it("guesses companies from assessment and portal subjects", () => {
    expect(guessCompany(e("Urban Ground GmbH invites you to take an assessment", "", "noreply@coderbyte.com"))).toBe("Urban Ground GmbH");
    expect(guessCompany(e("Application Successful: Numino Labs - Senior Backend Engineer", "", "noreply@hirist.tech"))).toBe("Numino Labs");
    expect(guessCompany(e("Thank you for applying to Canonical", "", "no-reply@us.greenhouse-mail.io"))).toBe("Canonical");
  });
});

describe("guessCompany: sender handling", () => {
  it("uses the registrable domain and ignores job-board names", () => {
    expect(guessCompany(e("Next Steps for Your Application", "", "Cisco <noreply@jobalerts.cisco.com>"))).toBe("Cisco");
    expect(guessCompany(e("Thanks", "", "HR <hr@careers.tcs.co.in>"))).toBe("Tcs");
    expect(guessCompany(e("Indeed Application: Software Engineer II", "Your application has been submitted.", "Indeed Apply <indeedapply@indeed.com>"))).toBeNull();
  });
});

import { funnel } from "@/lib/applications/funnel";

describe("funnel", () => {
  it("counts the furthest stage reached, including rejected-after-interview", () => {
    const f = funnel([
      { status: "saved", appliedAt: null, eventTypes: [] },
      { status: "applied", appliedAt: new Date(), eventTypes: ["applied_confirm"] },
      { status: "rejected", appliedAt: new Date(), eventTypes: ["applied_confirm", "interview", "rejection"] },
      { status: "oa", appliedAt: new Date(), eventTypes: ["oa"] },
      { status: "offer", appliedAt: new Date(), eventTypes: [] },
    ]);
    expect(f.steps.map((s) => s.n)).toEqual([4, 3, 2, 1]);
    expect(f.responseRate).toBe(75);
  });
});

import { guessTitle } from "@/lib/gmail/match";

describe("guessTitle", () => {
  it.each([
    [e("Application Successful: Numino Labs - Senior Backend Engineer - Python (10-12 yrs)"), "Senior Backend Engineer - Python"],
    [e("Indeed Application: Software Engineer II"), "Software Engineer II"],
    [e("An update on your application to Canonical - Golang Engineer"), "Golang Engineer"],
    [e("Thank you for applying to Canonical", "Thanks for applying to the Golang Engineer role at Canonical."), "Golang Engineer"],
    [e("Thanks for your application, Varad", "Thank you for applying for our Senior Backend Developer - IoT and Digitalization (502927). We will review."), "Senior Backend Developer - IoT and Digitalization"],
    [e("Employment Verification for Your Application for Post of Software Engineer"), "Software Engineer"],
    [e("Your Cisco Journey Begins Here", "Thank you for taking&nbsp;the&nbsp;first step towards&nbsp;a&nbsp;career at&nbsp;Cisco&nbsp;by applying!"), null],
    [e("Urban Ground GmbH invites you to take an assessment"), null],
  ])("%#", (email, title) => expect(guessTitle(email)).toBe(title));
});

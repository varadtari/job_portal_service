import { describe, expect, it } from "vitest";
import { parseShared } from "@/lib/jobs/share";

describe("parseShared", () => {
  it("LinkedIn app share", () => {
    expect(parseShared({ text: "Check out this job at Acme Corp: Software Engineer\nhttps://www.linkedin.com/jobs/view/4012345678" })).toEqual({
      url: "https://www.linkedin.com/jobs/view/4012345678", title: "Software Engineer", company: "Acme Corp",
    });
  });
  it("Naukri / generic 'Title at Company' share", () => {
    expect(parseShared({ text: "I found this job on Naukri: Backend Developer at Zeta - Bengaluru https://www.naukri.com/job-listings-backend-developer-zeta-1" })).toMatchObject({
      title: "Backend Developer", company: "Zeta", url: "https://www.naukri.com/job-listings-backend-developer-zeta-1",
    });
  });
  it("url field + page title from Chrome", () => {
    expect(parseShared({ title: "Golang Developer @ Rupeezy", url: "https://in.indeed.com/viewjob?jk=abc" })).toMatchObject({ title: "Golang Developer", company: "Rupeezy", url: "https://in.indeed.com/viewjob?jk=abc" });
  });
  it("hiring phrasing and trailing punctuation", () => {
    expect(parseShared({ text: "Stripe is hiring a Software Engineer, Payments (https://stripe.com/jobs/123)." })).toMatchObject({ title: "Software Engineer, Payments", company: "Stripe", url: "https://stripe.com/jobs/123" });
  });
});

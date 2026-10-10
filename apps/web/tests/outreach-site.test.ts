import { describe, expect, it } from "vitest";
import { parseSitePage, robotsDisallow } from "@/lib/outreach/site";

const home = `<html><body>
<a href="/careers">Careers</a> <a href="/blog/post">Blog</a> <a href="https://other.com/jobs">x</a>
<a href="/company/join-us">We're hiring</a>
<a href="mailto:talent@acme.dev?subject=Hi">Email us</a>
<p>Privacy: privacy@acme.dev · Write to hr [at] acme [dot] dev</p>
<script>var x = "tracking@acme.dev"</script>
<iframe src="https://boards.greenhouse.io/embed/job_board?for=acmeinc"></iframe>
<a href="https://jobs.lever.co/acme-labs/123">Role</a>
</body></html>`;

const jobPage = `<html><head><script type="application/ld+json">{"@context":"https://schema.org","@type":"JobPosting","title":"Backend Engineer","description":"<p>Build APIs in Go.</p>","hiringOrganization":{"name":"Acme"},"jobLocation":{"address":{"addressLocality":"Pune","addressCountry":"IN"}}}</script></head><body></body></html>`;

describe("parseSitePage", () => {
  it("finds ATS boards, same-site career links and hiring emails", () => {
    const f = parseSitePage(home, "https://acme.dev/");
    expect(f.boards).toEqual([{ ats: "greenhouse", slug: "acmeinc" }, { ats: "lever", slug: "acme-labs" }]);
    expect(f.links).toEqual(["https://acme.dev/careers", "https://acme.dev/company/join-us"]);
    expect(f.emails.map((e) => e.email).sort()).toEqual(["hr@acme.dev", "talent@acme.dev"]);
  });
  it("reads schema.org JobPosting", () => {
    const f = parseSitePage(jobPage, "https://acme.dev/careers/backend");
    expect(f.jobs).toHaveLength(1);
    expect(f.jobs[0]).toMatchObject({ source: "website", title: "Backend Engineer", company: "Acme", location: "Pune, IN" });
  });
});

describe("robotsDisallow", () => {
  it("collects rules for all agents only", () => {
    expect(robotsDisallow("User-agent: Googlebot\nDisallow: /g\n\nUser-agent: *\nDisallow: /private\nDisallow:\n")).toEqual(["/private"]);
  });
});

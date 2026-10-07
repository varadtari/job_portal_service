import { describe, expect, it } from "vitest";
import { filterBoardJobs, locationMatches, queryAlternatives, titleMatches } from "@/lib/jobs/filter";
import { parseBoardUrl } from "@/lib/jobs/sources/url";
import { countryFor } from "@/lib/jobs/sources/region";
import type { NormalizedJob } from "@/lib/jobs/types";

const job = (title: string, location: string | null, remote = false): NormalizedJob => ({
  source: "greenhouse", externalId: title, company: "X", title, location, remote, salary: null, description: "", url: "", postedAt: null,
});

describe("title matching", () => {
  it("splits alternatives", () => {
    expect(queryAlternatives("Backend Engineer, SDE | platform eng")).toEqual([["backend", "engineer"], ["sde"], ["platform", "eng"]]);
  });
  it("requires every word of an alternative, as word prefixes", () => {
    expect(titleMatches("Senior Backend Software Engineer", "backend engineer")).toBe(true);
    expect(titleMatches("Backend Engineering Manager", "backend engineer")).toBe(true);
    expect(titleMatches("Frontend Engineer", "backend engineer")).toBe(false);
    expect(titleMatches("SDE II", "backend engineer, sde")).toBe(true);
  });
});

describe("location matching", () => {
  it("treats Bengaluru and Bangalore as the same", () => {
    expect(locationMatches(job("a", "Bangalore, India"), "Bengaluru")).toBe(true);
  });
  it("matches any Indian city for 'India'", () => {
    expect(locationMatches(job("a", "Pune"), "India")).toBe(true);
    expect(locationMatches(job("a", "London"), "India")).toBe(false);
  });
  it("keeps remote roles open to the region but not US-only remote", () => {
    expect(locationMatches(job("a", "Remote - APAC", true), "Bengaluru")).toBe(true);
    expect(locationMatches(job("a", "Remote (India)", true), "Pune")).toBe(true);
    expect(locationMatches(job("a", "Remote - US", true), "Bengaluru")).toBe(false);
    expect(locationMatches(job("a", "Toronto, Vancouver, Canada-Remote", true), "India")).toBe(false);
    expect(locationMatches(job("a", "Remote", true), "India")).toBe(true);
  });
  it("'remote' means remote only", () => {
    expect(locationMatches(job("a", "Pune"), "remote")).toBe(false);
    expect(locationMatches(job("a", "Anywhere", true), "remote")).toBe(true);
  });
});

describe("filterBoardJobs", () => {
  const jobs = [job("Software Engineer", "Bengaluru"), job("Software Engineer", "Seattle"), job("Designer", "Bengaluru")];
  it("keeps everything without searches", () => expect(filterBoardJobs(jobs, [])).toHaveLength(3));
  it("applies title + location", () => {
    expect(filterBoardJobs(jobs, [{ query: "software engineer", location: "Bangalore", remoteOnly: false }]).map((j) => j.location)).toEqual(["Bengaluru"]);
  });
});

describe("board URL parsing", () => {
  it("recognises board job URLs", () => {
    expect(parseBoardUrl("https://boards.greenhouse.io/stripe/jobs/123")).toEqual({ ats: "greenhouse", slug: "stripe", jobId: "123" });
    expect(parseBoardUrl("https://job-boards.greenhouse.io/acme/jobs/9?gh_src=x")).toEqual({ ats: "greenhouse", slug: "acme", jobId: "9" });
    expect(parseBoardUrl("https://jobs.lever.co/cred/aa-bb")).toEqual({ ats: "lever", slug: "cred", jobId: "aa-bb" });
    expect(parseBoardUrl("https://jobs.ashbyhq.com/notion/1f/application")).toEqual({ ats: "ashby", slug: "notion", jobId: "1f" });
    expect(parseBoardUrl("https://www.linkedin.com/jobs/view/1")).toBeNull();
  });
  it("guesses aggregator country", () => {
    expect(countryFor("Pune")).toBe("in");
    expect(countryFor("London, UK")).toBe("gb");
    expect(countryFor(null)).toBe("in");
  });
});

import { jobFromHtml } from "@/lib/jobs/sources/url";

describe("jobFromHtml", () => {
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", name: "Ignore me" },
      {
        "@type": "JobPosting",
        title: "Backend Engineer &amp; SRE",
        description: "<p>Build <b>Go</b> services.</p><ul><li>Kafka</li><li>AWS</li></ul>",
        datePosted: "2026-09-20",
        hiringOrganization: { "@type": "Organization", name: "Acme" },
        jobLocation: [{ "@type": "Place", address: { addressLocality: "Pune", addressRegion: "MH", addressCountry: "IN" } }],
        baseSalary: { currency: "INR", value: { minValue: 2000000, maxValue: 3000000, unitText: "YEAR" } },
      },
    ],
  };
  it("parses JSON-LD JobPosting inside @graph", () => {
    const html = `<html><head><script type="application/ld+json">${JSON.stringify(ld)}</script></head></html>`;
    const j = jobFromHtml(html, "https://acme.example/jobs/1")!;
    expect(j).toMatchObject({ source: "manual", company: "Acme", title: "Backend Engineer & SRE", location: "Pune, MH, IN", remote: false });
    expect(j.salary?.replace(/,/g, "")).toBe("INR 2000000–3000000 / year");
    expect(j.description).toContain("• Kafka");
    expect(j.postedAt?.toISOString().slice(0, 10)).toBe("2026-09-20");
  });
  it("detects remote via jobLocationType and skips invalid JSON blocks", () => {
    const remote = { "@type": "JobPosting", title: "SDE", description: "x", jobLocationType: "TELECOMMUTE", hiringOrganization: "Beta" };
    const html = `<script type="application/ld+json">{bad json</script><script type="application/ld+json">${JSON.stringify(remote)}</script>`;
    expect(jobFromHtml(html, "https://beta.example/j")).toMatchObject({ company: "Beta", remote: true });
  });
  it("returns null when nothing is found", () => {
    expect(jobFromHtml("<html><title>Careers</title></html>", "https://x.example")).toBeNull();
  });
});

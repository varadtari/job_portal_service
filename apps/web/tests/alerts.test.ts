import { describe, expect, it } from "vitest";
import { parseJobAlert } from "@/lib/gmail/alerts";

const date = new Date("2026-10-03T12:00:00Z");

describe("parseJobAlert", () => {
  it("parses an Indeed digest", () => {
    const html = `<table>
      <tr><td><a href="https://cts.indeed.com/v3/x">Find Jobs</a></td></tr>
      <tr><td><a href="https://in.indeed.com/rc/clk/dl?jk=1">Backend Developer (Golang)</a></td></tr>
      <tr><td>Wobot.ai</td></tr><tr><td>Remote</td></tr><tr><td>₹40,000 - ₹60,000 a month</td></tr><tr><td>Easily apply</td></tr><tr><td>2 days ago</td></tr>
      <tr><td><a href="https://in.indeed.com/rc/clk/dl?jk=2">Full Stack Java Developer</a></td></tr>
      <tr><td>Acme Pvt Ltd</td></tr><tr><td>Pune, Maharashtra</td></tr><tr><td>Just posted</td></tr>
    </table>`;
    const jobs = parseJobAlert({ from: "Indeed <alert@jobalert.indeed.com>", subject: "Backend Developer (Golang) at Wobot.ai. 20 more jobs", html, date });
    expect(jobs.map((j) => [j.title, j.company, j.location, j.salary, j.remote])).toEqual([
      ["Backend Developer (Golang)", "Wobot.ai", "Remote", "₹40,000 - ₹60,000 a month", true],
      ["Full Stack Java Developer", "Acme Pvt Ltd", "Pune, Maharashtra", null, false],
    ]);
    expect(jobs[0].url).toBe("https://in.indeed.com/rc/clk/dl?jk=1");
    expect(jobs[0].postedAt?.toISOString().slice(0, 10)).toBe("2026-10-01");
    expect(jobs[0]).toMatchObject({ source: "email", via: "Indeed" });
  });

  it("parses an Indeed match email", () => {
    const html = `<p>₹9,&zwnj;00,&zwnj;000 - ₹18,&zwnj;00,&zwnj;000 a year.</p><p>Hi Varad, Rupeezy is seeking a Golang Developer.</p>
      <a href="https://cts.indeed.com/v3/view">&emsp;&#8203; View job &emsp;&#8203;</a><a href="https://cts.indeed.com/v3/bad">This is a bad match</a>
      <div><a href="https://cts.indeed.com/v3/view">Golang Developer</a><div>Rupeezy</div><div>Bengaluru, Karnataka</div></div>
      <h3>Introduction</h3><p>We build trading apps in Go and PostgreSQL.</p>`;
    const [j] = parseJobAlert({ from: "Indeed <donotreply@match.indeed.com>", subject: "Golang Developer @ Rupeezy", html, date });
    expect(j).toMatchObject({ title: "Golang Developer", company: "Rupeezy", location: "Bengaluru, Karnataka", url: "https://cts.indeed.com/v3/view" });
    expect(j.salary).toContain("a year");
    expect(j.description).toContain("trading apps in Go");
  });

  it("parses a hirist alert", () => {
    const html = `<p>Strong match: Site Reliability Engineer | Bangalore</p><p>Site Reliability Engineer</p><p>Scaling Theory Technologies</p>
      <p>Location: Bangalore</p><p>Experience: 2 - 4 Years</p><a href="https://postoffice.hirist.tech/CL0/apply">Apply Now</a>
      <p>Early applicants are 3x more likely to get noticed</p><p>- Build cloud infrastructure with Terraform and Kubernetes.</p>`;
    const [j] = parseJobAlert({ from: "hirist <info@hirist.tech>", subject: "Hiring | Site Reliability Engineer at Scaling Theory Technologies", html, date });
    expect(j).toMatchObject({ title: "Site Reliability Engineer", company: "Scaling Theory Technologies", location: "Bangalore", via: "hirist" });
    expect(j.description).toContain("Experience: 2 - 4 Years");
    expect(j.description).toContain("Terraform");
  });

  it("parses a Naukri openings email", () => {
    const html = `<p>Seize all job opportunities of this week!</p>
      <a href="https://tr.naukri.com/t1">Frontend Engineer (React)</a><p>Infoesearch Ites 3.2</p><p>Remote Not disclosed</p><a href="https://tr.naukri.com/a1">Apply</a>
      <a href="https://tr.naukri.com/t2">Intern Software Engineer</a><p>Rearck</p><p>Pune 3-4.5 Lacs PA</p><a href="https://tr.naukri.com/a2">Apply</a>
      <p>Are these jobs relevant? Yes No</p>`;
    const jobs = parseJobAlert({ from: "Naukri <info@naukri.com>", subject: "Top Openings for You", html, date });
    expect(jobs.map((j) => [j.title, j.company, j.location, j.salary, j.url])).toEqual([
      ["Frontend Engineer (React)", "Infoesearch Ites", "Remote", null, "https://tr.naukri.com/a1"],
      ["Intern Software Engineer", "Rearck", "Pune", "3-4.5 Lacs PA", "https://tr.naukri.com/a2"],
    ]);
  });

  it("returns nothing for non-alert mail", () => {
    expect(parseJobAlert({ from: "Naukri <info@naukri.com>", subject: "Show your SQL expertise", html: "<a href='x'>Get my badge now</a>", date })).toEqual([]);
  });
});

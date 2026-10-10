import { describe, expect, it } from "vitest";
import { parseContactsText } from "@/lib/outreach/import";

describe("parseContactsText", () => {
  it("reads CSV with a header", () => {
    const r = parseContactsText('email,company,location,remote\nhr@acme.io,"Acme, Inc",Pune,no\nbad-row,X,Y,\njobs@globex.com,Globex,,yes');
    expect(r.map((x) => [x.email, x.company, x.location, x.remote])).toEqual([
      ["hr@acme.io", "Acme, Inc", "Pune", false],
      ["jobs@globex.com", "Globex", "", true],
    ]);
  });
  it("reads one contact per line or free text", () => {
    const r = parseContactsText("careers@initech.com, Initech, Bengaluru\nSend CVs to a@x.io or b [at] y [dot] io");
    expect(r.map((x) => [x.email, x.company ?? null, x.location ?? null])).toEqual([
      ["careers@initech.com", "Initech", "Bengaluru"],
      ["a@x.io", null, null],
      ["b@y.io", null, null],
    ]);
  });
});

import { siteDomain } from "@/lib/outreach/harvest";
describe("siteDomain", () => {
  it("keeps the company's main domain", () => {
    expect(siteDomain("ats.latinumhr.com")).toBe("latinumhr.com");
    expect(siteDomain("careers.tcs.co.in")).toBe("tcs.co.in");
    expect(siteDomain("www.unimelb.edu.au")).toBe("unimelb.edu.au");
    expect(siteDomain("acme.io")).toBe("acme.io");
  });
});

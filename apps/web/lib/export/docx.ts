import { BorderStyle, Document, Packer, Paragraph, TabStopType, TextRun } from "docx";
import type { ResumeContent } from "@/lib/resume/types";
import { contactLine, dateRange, educationLine } from "./sections";

const RIGHT_TAB = 9638; // twips: right edge of an A4 page with 0.75" margins

const heading = (text: string) =>
  new Paragraph({
    spacing: { before: 240, after: 80 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "999999", space: 2 } },
    children: [new TextRun({ text: text.toUpperCase(), bold: true, size: 22 })],
  });

const bullet = (text: string) => new Paragraph({ bullet: { level: 0 }, spacing: { after: 20 }, children: [new TextRun(text)] });

const leftRight = (left: TextRun[], right: string) =>
  new Paragraph({
    tabStops: [{ type: TabStopType.RIGHT, position: RIGHT_TAB }],
    spacing: { before: 80 },
    children: [...left, new TextRun({ text: `\t${right}`, color: "444444" })],
  });

export async function resumeToDocx(r: ResumeContent): Promise<Buffer> {
  const children: Paragraph[] = [
    new Paragraph({ children: [new TextRun({ text: r.basics.name, bold: true, size: 40 })] }),
  ];
  if (r.basics.headline) children.push(new Paragraph({ children: [new TextRun({ text: r.basics.headline, size: 22 })] }));
  children.push(new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: contactLine(r), size: 18, color: "444444" })] }));

  if (r.basics.summary) children.push(heading("Summary"), new Paragraph({ children: [new TextRun(r.basics.summary)] }));

  if (r.experience.length) children.push(heading("Experience"));
  for (const e of r.experience) {
    children.push(
      leftRight(
        [new TextRun({ text: e.title, bold: true }), new TextRun(e.company ? `, ${e.company}` : ""), new TextRun({ text: e.location ? ` · ${e.location}` : "", color: "444444" })],
        dateRange(e.start, e.end, e.current),
      ),
      ...e.bullets.map(bullet),
    );
  }

  if (r.projects.length) children.push(heading("Projects"));
  for (const p of r.projects) {
    children.push(
      new Paragraph({
        spacing: { before: 80 },
        children: [
          new TextRun({ text: p.name, bold: true }),
          new TextRun({ text: [p.tech.join(", "), p.url?.replace(/^https?:\/\//, "")].filter(Boolean).map((x) => ` · ${x}`).join(""), color: "444444" }),
        ],
      }),
      ...p.bullets.map(bullet),
    );
  }

  if (r.skills.length) children.push(heading("Skills"));
  for (const k of r.skills) children.push(new Paragraph({ children: [new TextRun({ text: `${k.category}: `, bold: true }), new TextRun(k.items.join(", "))] }));

  if (r.education.length) children.push(heading("Education"));
  for (const e of r.education) {
    children.push(leftRight([new TextRun({ text: e.institution, bold: true })], dateRange(e.start, e.end)));
    const line = educationLine(e);
    if (line) children.push(new Paragraph({ children: [new TextRun(line)] }));
    children.push(...e.details.map(bullet));
  }

  if (r.certifications.length) children.push(heading("Certifications"));
  for (const c of r.certifications) children.push(new Paragraph({ children: [new TextRun([c.name, c.issuer, c.date].filter(Boolean).join(" · "))] }));

  for (const x of r.extra) children.push(heading(x.heading), ...x.items.map(bullet));

  const doc = new Document({
    creator: "JobPilot",
    title: r.basics.name,
    styles: { default: { document: { run: { font: "Calibri", size: 21 } } } },
    sections: [{ properties: { page: { margin: { top: 720, bottom: 720, left: 1080, right: 1080 } } }, children }],
  });
  return Packer.toBuffer(doc);
}

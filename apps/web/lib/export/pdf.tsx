import path from "node:path";
import { Document, Font, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { ResumeContent } from "@/lib/resume/types";
import { contactLine, dateRange, educationLine } from "./sections";

const fontDir = path.join(process.cwd(), "lib/export/fonts");
Font.register({
  family: "Noto Sans",
  fonts: [
    { src: path.join(fontDir, "NotoSans-Regular.ttf") },
    { src: path.join(fontDir, "NotoSans-Bold.ttf"), fontWeight: "bold" },
    { src: path.join(fontDir, "NotoSans-Italic.ttf"), fontStyle: "italic" },
  ],
});
Font.registerHyphenationCallback((w) => [w]); // never hyphenate (ATS parsers dislike it)

const s = StyleSheet.create({
  page: { fontFamily: "Noto Sans", fontSize: 10, lineHeight: 1.35, paddingVertical: 36, paddingHorizontal: 44, color: "#111" },
  name: { fontSize: 20, fontWeight: "bold", lineHeight: 1.2 },
  headline: { fontSize: 11, marginTop: 2 },
  contact: { fontSize: 9, color: "#444", marginTop: 4 },
  h2: { fontSize: 11, fontWeight: "bold", textTransform: "uppercase", letterSpacing: 0.8, marginTop: 12, marginBottom: 4, paddingBottom: 2, borderBottomWidth: 0.75, borderBottomColor: "#999" },
  row: { flexDirection: "row", justifyContent: "space-between" },
  bold: { fontWeight: "bold" },
  muted: { color: "#444" },
  entry: { marginBottom: 6 },
  bullet: { flexDirection: "row", marginTop: 1.5 },
  dot: { width: 10 },
  bulletText: { flex: 1 },
});

function Bullets({ items }: { items: string[] }) {
  return (
    <>
      {items.map((b, i) => (
        <View key={i} style={s.bullet} wrap={false}>
          <Text style={s.dot}>•</Text>
          <Text style={s.bulletText}>{b}</Text>
        </View>
      ))}
    </>
  );
}

function ResumePdf({ r }: { r: ResumeContent }) {
  return (
    <Document title={r.basics.name} author={r.basics.name} creator="JobPilot">
      <Page size="A4" style={s.page}>
        <Text style={s.name}>{r.basics.name}</Text>
        {r.basics.headline && <Text style={s.headline}>{r.basics.headline}</Text>}
        <Text style={s.contact}>{contactLine(r)}</Text>

        {r.basics.summary && (
          <>
            <Text style={s.h2}>Summary</Text>
            <Text>{r.basics.summary}</Text>
          </>
        )}

        {r.experience.length > 0 && <Text style={s.h2}>Experience</Text>}
        {r.experience.map((e, i) => (
          <View key={i} style={s.entry}>
            <View style={s.row} wrap={false}>
              <Text>
                <Text style={s.bold}>{e.title}</Text>
                {e.company ? `, ${e.company}` : ""}
                {e.location ? <Text style={s.muted}>{` · ${e.location}`}</Text> : null}
              </Text>
              <Text style={s.muted}>{dateRange(e.start, e.end, e.current)}</Text>
            </View>
            <Bullets items={e.bullets} />
          </View>
        ))}

        {r.projects.length > 0 && <Text style={s.h2}>Projects</Text>}
        {r.projects.map((p, i) => (
          <View key={i} style={s.entry}>
            <Text>
              <Text style={s.bold}>{p.name}</Text>
              {p.tech.length ? <Text style={s.muted}>{` · ${p.tech.join(", ")}`}</Text> : null}
              {p.url ? <Text style={s.muted}>{` · ${p.url.replace(/^https?:\/\//, "")}`}</Text> : null}
            </Text>
            <Bullets items={p.bullets} />
          </View>
        ))}

        {r.skills.length > 0 && <Text style={s.h2}>Skills</Text>}
        {r.skills.map((k, i) => (
          <Text key={i}>
            <Text style={s.bold}>{k.category}: </Text>
            {k.items.join(", ")}
          </Text>
        ))}

        {r.education.length > 0 && <Text style={s.h2}>Education</Text>}
        {r.education.map((e, i) => (
          <View key={i} style={s.entry} wrap={false}>
            <View style={s.row}>
              <Text style={s.bold}>{e.institution}</Text>
              <Text style={s.muted}>{dateRange(e.start, e.end)}</Text>
            </View>
            {educationLine(e) && <Text>{educationLine(e)}</Text>}
            <Bullets items={e.details} />
          </View>
        ))}

        {r.certifications.length > 0 && <Text style={s.h2}>Certifications</Text>}
        {r.certifications.map((c, i) => (
          <Text key={i}>{[c.name, c.issuer, c.date].filter(Boolean).join(" · ")}</Text>
        ))}

        {r.extra.map((x, i) => (
          <View key={i}>
            <Text style={s.h2}>{x.heading}</Text>
            <Bullets items={x.items} />
          </View>
        ))}
      </Page>
    </Document>
  );
}

export function resumeToPdf(r: ResumeContent): Promise<Buffer> {
  return renderToBuffer(<ResumePdf r={r} />);
}

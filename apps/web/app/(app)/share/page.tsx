import { PageHeader } from "@/components/page-header";
import { ShareImporter } from "./importer";

// Android share target (see app/manifest.ts): /share?title=…&text=…&url=…
export default async function SharePage(props: PageProps<"/share">) {
  const sp = await props.searchParams;
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).slice(0, 4000) : undefined);
  return (
    <>
      <PageHeader title="Add shared job" />
      <ShareImporter title={s("title")} text={s("text")} url={s("url")} />
    </>
  );
}

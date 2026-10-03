import { EmptyState, PageHeader } from "@/components/page-header";

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" description="Allowlist, extension token, and integrations." />
      <EmptyState title="Settings" body="Coming soon." />
    </>
  );
}

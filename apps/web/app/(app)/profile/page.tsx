import { EmptyState, PageHeader } from "@/components/page-header";

export default function ProfilePage() {
  return (
    <>
      <PageHeader title="Profile" description="Details and saved answers used for autofill." />
      <EmptyState title="Profile is empty" body="Profile editing arrives in phase 2." />
    </>
  );
}

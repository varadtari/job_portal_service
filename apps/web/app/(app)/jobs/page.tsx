import { EmptyState, PageHeader } from "@/components/page-header";

export default function JobsPage() {
  return (
    <>
      <PageHeader title="Jobs" description="Listings from your saved searches and company boards." />
      <EmptyState title="No jobs yet" body="Job sources arrive in phase 3." />
    </>
  );
}

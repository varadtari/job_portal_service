import { EmptyState, PageHeader } from "@/components/page-header";

export default function ApplicationsPage() {
  return (
    <>
      <PageHeader title="Applications" description="Track every application from applied to offer." />
      <EmptyState title="No applications yet" body="The Kanban board and Gmail sync arrive in phase 6." />
    </>
  );
}

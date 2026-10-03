import { EmptyState, PageHeader } from "@/components/page-header";

export default function DashboardPage() {
  return (
    <>
      <PageHeader title="Dashboard" description="Your search at a glance." />
      <EmptyState title="Nothing here yet" body="Stats and the application funnel will appear once you start applying." />
    </>
  );
}

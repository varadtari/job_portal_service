import { EmptyState, PageHeader } from "@/components/page-header";

export default function ResumesPage() {
  return (
    <>
      <PageHeader title="Resumes" description="Your master resume and tailored versions." />
      <EmptyState title="No resumes yet" body="Upload and tailoring arrive in phases 2 and 4." />
    </>
  );
}

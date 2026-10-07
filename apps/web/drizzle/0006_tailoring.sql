ALTER TABLE "resumes" ADD COLUMN "base_resume_id" uuid;--> statement-breakpoint
ALTER TABLE "resumes" ADD COLUMN "tailor_meta" jsonb;
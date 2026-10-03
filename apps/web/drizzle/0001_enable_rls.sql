-- The app connects as the postgres role (bypasses RLS) and scopes every query by user_id.
-- Enabling RLS with no policies blocks Supabase's public REST/GraphQL API (anon/authenticated roles) from reading any table.
ALTER TABLE "allowed_emails" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "profile_fields" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "resumes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "saved_searches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "applications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "application_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TYPE "public"."ats_kind" AS ENUM('greenhouse', 'lever', 'ashby');--> statement-breakpoint
CREATE TABLE "tracked_companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"ats" "ats_kind" NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "skills" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "jobs_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "jobs_sync_report" jsonb;--> statement-breakpoint
ALTER TABLE "tracked_companies" ADD CONSTRAINT "tracked_companies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tracked_companies_user_ats_slug" ON "tracked_companies" USING btree ("user_id","ats","slug");--> statement-breakpoint
CREATE INDEX "user_jobs_user" ON "user_jobs" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "saved_searches" DROP COLUMN "ats_companies";--> statement-breakpoint
ALTER TABLE "tracked_companies" ENABLE ROW LEVEL SECURITY;

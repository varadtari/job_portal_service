CREATE TYPE "public"."outreach_contact_status" AS ENUM('new', 'emailed', 'replied', 'bounced', 'do_not_contact');--> statement-breakpoint
CREATE TYPE "public"."outreach_email_status" AS ENUM('draft', 'sending', 'sent', 'failed', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."outreach_source" AS ENUM('job_post', 'gmail', 'manual', 'website');--> statement-breakpoint
CREATE TABLE "company_sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"domain" text NOT NULL,
	"name" text,
	"last_checked_at" timestamp with time zone,
	"ats" text,
	"slug" text,
	"jobs_found" integer DEFAULT 0 NOT NULL,
	"emails_found" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outreach_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"company" text,
	"domain" text NOT NULL,
	"location" text,
	"country_code" text,
	"remote" boolean DEFAULT false NOT NULL,
	"source" "outreach_source" NOT NULL,
	"source_ref" text,
	"kind" text DEFAULT 'person' NOT NULL,
	"status" "outreach_contact_status" DEFAULT 'new' NOT NULL,
	"last_emailed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outreach_emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"status" "outreach_email_status" DEFAULT 'draft' NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"method" text NOT NULL,
	"resume_id" uuid,
	"gmail_message_id" text,
	"thread_id" text,
	"error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "outreach_daily_cap" integer DEFAULT 25 NOT NULL;--> statement-breakpoint
ALTER TABLE "company_sites" ADD CONSTRAINT "company_sites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_contacts" ADD CONSTRAINT "outreach_contacts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_emails" ADD CONSTRAINT "outreach_emails_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_emails" ADD CONSTRAINT "outreach_emails_contact_id_outreach_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."outreach_contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_emails" ADD CONSTRAINT "outreach_emails_resume_id_resumes_id_fk" FOREIGN KEY ("resume_id") REFERENCES "public"."resumes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "company_sites_user_domain" ON "company_sites" USING btree ("user_id","domain");--> statement-breakpoint
CREATE UNIQUE INDEX "outreach_contacts_user_email" ON "outreach_contacts" USING btree ("user_id","email");--> statement-breakpoint
CREATE INDEX "outreach_contacts_user_status" ON "outreach_contacts" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "outreach_emails_user_status" ON "outreach_emails" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "outreach_emails_contact" ON "outreach_emails" USING btree ("contact_id");--> statement-breakpoint
ALTER TABLE "outreach_contacts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "outreach_emails" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "company_sites" ENABLE ROW LEVEL SECURITY;

CREATE TYPE "public"."follow_up_status" AS ENUM('draft', 'sent', 'dismissed');--> statement-breakpoint
CREATE TABLE "follow_ups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"status" "follow_up_status" DEFAULT 'draft' NOT NULL,
	"to_address" text,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"method" text NOT NULL,
	"thread_id" text,
	"in_reply_to" text,
	"gmail_message_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "follow_up_enabled" boolean;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "follow_up_every_days" integer;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "follow_up_max" integer;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "follow_up_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "last_follow_up_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "contact_email" text;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "contact_name" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "google_scopes" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "follow_up_default_on" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "follow_up_default_days" integer DEFAULT 7 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "follow_up_default_max" integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "follow_ups_app" ON "follow_ups" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "follow_ups_user_status" ON "follow_ups" USING btree ("user_id","status");--> statement-breakpoint
ALTER TABLE "follow_ups" ENABLE ROW LEVEL SECURITY;

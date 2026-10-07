CREATE TYPE "public"."queue_status" AS ENUM('queued', 'active', 'done', 'skipped');--> statement-breakpoint
CREATE TABLE "apply_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"status" "queue_status" DEFAULT 'queued' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "apply_queue" ADD CONSTRAINT "apply_queue_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apply_queue" ADD CONSTRAINT "apply_queue_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "apply_queue_user_job" ON "apply_queue" USING btree ("user_id","job_id");--> statement-breakpoint
CREATE INDEX "apply_queue_user_pos" ON "apply_queue" USING btree ("user_id","position");--> statement-breakpoint
ALTER TABLE "apply_queue" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "users" ADD COLUMN "it_only" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "disabled_sources" text[] DEFAULT '{}' NOT NULL;
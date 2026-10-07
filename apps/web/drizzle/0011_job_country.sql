ALTER TABLE "jobs" ADD COLUMN "country_code" text;--> statement-breakpoint
CREATE INDEX "jobs_country" ON "jobs" USING btree ("country_code");
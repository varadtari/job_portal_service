import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export const allowedEmails = pgTable("allowed_emails", {
  email: text("email").primaryKey(),
  createdAt: createdAt(),
});

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name"),
  image: text("image"),
  googleRefreshTokenEnc: text("google_refresh_token_enc"),
  gmailHistoryId: text("gmail_history_id"),
  gmailNeedsReconnect: boolean("gmail_needs_reconnect").notNull().default(false),
  // sha256 of the personal token used by the Chrome extension
  extTokenHash: text("ext_token_hash"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const fieldSource = pgEnum("field_source", ["manual", "resume", "learned"]);

// Flat key/value answers used for autofill. Canonical keys (first_name, phone, ...)
// plus learned keys = normalised question text captured by the extension.
export const profileFields = pgTable(
  "profile_fields",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    label: text("label"),
    value: text("value").notNull(),
    source: fieldSource("source").notNull().default("manual"),
    useCount: integer("use_count").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("profile_fields_user_key").on(t.userId, t.key)],
);

export const resumeKind = pgEnum("resume_kind", ["master", "tailored"]);

export const resumes = pgTable(
  "resumes",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    kind: resumeKind("kind").notNull(),
    jobId: uuid("job_id").references(() => jobs.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    storagePath: text("storage_path"),
    rawText: text("raw_text"),
    // Structured resume: see ResumeContent in lib/resume/types.ts
    content: jsonb("content"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("resumes_user").on(t.userId)],
);

export const jobs = pgTable(
  "jobs",
  {
    id: id(),
    source: text("source").notNull(), // jsearch | adzuna | greenhouse | lever | ashby | manual
    externalId: text("external_id").notNull(),
    company: text("company").notNull(),
    title: text("title").notNull(),
    location: text("location"),
    remote: boolean("remote").notNull().default(false),
    salary: text("salary"),
    description: text("description").notNull().default(""),
    url: text("url").notNull(),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    // sha1(company|title|location) to collapse the same job from multiple sources
    dedupHash: text("dedup_hash").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("jobs_source_ext").on(t.source, t.externalId),
    index("jobs_dedup").on(t.dedupHash),
    index("jobs_posted").on(t.postedAt),
  ],
);

// Per-user view of a job (match score, hidden, saved)
export const userJobs = pgTable(
  "user_jobs",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    jobId: uuid("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
    matchScore: integer("match_score"),
    matchNotes: text("match_notes"),
    hidden: boolean("hidden").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("user_jobs_pk").on(t.userId, t.jobId)],
);

export const savedSearches = pgTable("saved_searches", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  query: text("query").notNull(),
  location: text("location"),
  remoteOnly: boolean("remote_only").notNull().default(false),
  // e.g. [{ ats: "greenhouse", slug: "stripe" }]
  atsCompanies: jsonb("ats_companies").$type<{ ats: "greenhouse" | "lever" | "ashby"; slug: string }[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  createdAt: createdAt(),
});

export const applicationStatus = pgEnum("application_status", [
  "saved",
  "applied",
  "oa",
  "interview",
  "offer",
  "rejected",
  "ghosted",
]);

export const applications = pgTable(
  "applications",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    jobId: uuid("job_id").references(() => jobs.id, { onDelete: "set null" }),
    resumeId: uuid("resume_id").references(() => resumes.id, { onDelete: "set null" }),
    company: text("company").notNull(),
    title: text("title").notNull(),
    url: text("url"),
    status: applicationStatus("status").notNull().default("saved"),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    lastEmailAt: timestamp("last_email_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("applications_user").on(t.userId)],
);

export const eventType = pgEnum("event_type", [
  "applied_confirm",
  "oa",
  "interview",
  "rejection",
  "offer",
  "other",
  "manual",
]);

export const applicationEvents = pgTable(
  "application_events",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    // null = unmatched email waiting in "Needs review"
    applicationId: uuid("application_id").references(() => applications.id, { onDelete: "cascade" }),
    type: eventType("type").notNull(),
    emailMessageId: text("email_message_id"),
    fromAddress: text("from_address"),
    subject: text("subject"),
    snippet: text("snippet"),
    aiConfidence: real("ai_confidence"),
    needsReview: boolean("needs_review").notNull().default(false),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("events_user_msg").on(t.userId, t.emailMessageId),
    index("events_app").on(t.applicationId),
  ],
);

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

export type SyncReport = { source: string; label: string; fetched: number; kept: number; error?: string }[];

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
  gmailSyncedAt: timestamp("gmail_synced_at", { withTimezone: true }),
  alertsSyncedAt: timestamp("alerts_synced_at", { withTimezone: true }),
  // OAuth scopes Google granted (space-separated), to know whether Gmail send is allowed
  googleScopes: text("google_scopes"),
  // Follow-up defaults (per-application settings override these when not null)
  followUpDefaultOn: boolean("follow_up_default_on").notNull().default(true),
  followUpDefaultDays: integer("follow_up_default_days").notNull().default(7),
  followUpDefaultMax: integer("follow_up_default_max").notNull().default(2),
  // sha256 of the personal token used by the Chrome extension
  extTokenHash: text("ext_token_hash"),
  jobsSyncedAt: timestamp("jobs_synced_at", { withTimezone: true }),
  // JSearch's free tier is 200 requests/month; it runs at most every 12h
  jsearchSyncedAt: timestamp("jsearch_synced_at", { withTimezone: true }),
  // Job preferences: keep only IT/software titles; sources switched off on the Sources page
  itOnly: boolean("it_only").notNull().default(true),
  disabledSources: text("disabled_sources").array().notNull().default([]),
  experienceLevel: text("experience_level").notNull().default("any"), // lib/jobs/seniority.ts Level
  // Per-source results of the last sync, shown on the Sources page
  jobsSyncReport: jsonb("jobs_sync_report").$type<SyncReport>(),
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
    // Tailored resumes: the master they came from, and how they were made
    baseResumeId: uuid("base_resume_id"),
    tailorMeta: jsonb("tailor_meta").$type<{ method: "rules" | "gemini"; scoreBefore: number | null; scoreAfter: number | null; jobTitle: string; company: string }>(),
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
    source: text("source").notNull(), // see JobSource in lib/jobs/types.ts
    via: text("via"), // original site for aggregator results, e.g. "LinkedIn"
    externalId: text("external_id").notNull(),
    company: text("company").notNull(),
    title: text("title").notNull(),
    location: text("location"),
    // ISO country detected from location (lib/jobs/regions.ts); null = unknown / remote-anywhere
    countryCode: text("country_code"),
    remote: boolean("remote").notNull().default(false),
    salary: text("salary"),
    description: text("description").notNull().default(""),
    // Canonical skill names detected in the description (lib/match/skills.ts)
    skills: text("skills").array().notNull().default([]),
    url: text("url").notNull(),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    // Updated on every sync that still returns the job; stale ATS jobs are likely closed
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    // sha1(company|title|location) to collapse the same job from multiple sources
    dedupHash: text("dedup_hash").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("jobs_source_ext").on(t.source, t.externalId),
    index("jobs_dedup").on(t.dedupHash),
    index("jobs_posted").on(t.postedAt),
    index("jobs_country").on(t.countryCode),
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
  (t) => [uniqueIndex("user_jobs_pk").on(t.userId, t.jobId), index("user_jobs_user").on(t.userId)],
);

// Keyword searches. Used as queries for aggregator APIs and as title filters for company boards.
export const savedSearches = pgTable("saved_searches", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  query: text("query").notNull(),
  location: text("location"),
  remoteOnly: boolean("remote_only").notNull().default(false),
  createdAt: createdAt(),
});

export const atsKind = pgEnum("ats_kind", ["greenhouse", "lever", "ashby"]);

// Company career boards polled directly (free public APIs).
export const trackedCompanies = pgTable(
  "tracked_companies",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    ats: atsKind("ats").notNull(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("tracked_companies_user_ats_slug").on(t.userId, t.ats, t.slug)],
);

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
    // Follow-ups: null = use the user's defaults
    followUpEnabled: boolean("follow_up_enabled"),
    followUpEveryDays: integer("follow_up_every_days"),
    followUpMax: integer("follow_up_max"),
    followUpCount: integer("follow_up_count").notNull().default(0),
    lastFollowUpAt: timestamp("last_follow_up_at", { withTimezone: true }),
    contactEmail: text("contact_email"),
    contactName: text("contact_name"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("applications_user").on(t.userId),
    // One application per job per user (manual entries without a job are allowed to repeat)
    uniqueIndex("applications_user_job").on(t.userId, t.jobId).where(sql`${t.jobId} is not null`),
  ],
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

// Web push subscriptions (one per installed device/browser)
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("push_endpoint").on(t.endpoint)],
);

export const queueStatus = pgEnum("queue_status", ["queued", "active", "done", "skipped"]);

// Apply queue: jobs to apply to one after another with the extension (you still press Submit)
export const applyQueue = pgTable(
  "apply_queue",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    jobId: uuid("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    status: queueStatus("status").notNull().default("queued"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("apply_queue_user_job").on(t.userId, t.jobId), index("apply_queue_user_pos").on(t.userId, t.position)],
);

export const followUpStatus = pgEnum("follow_up_status", ["draft", "sent", "dismissed"]);

// Follow-up emails: drafted by JobPilot (Gemini or template), sent from Gmail only when the user taps Send
export const followUps = pgTable(
  "follow_ups",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    applicationId: uuid("application_id").notNull().references(() => applications.id, { onDelete: "cascade" }),
    status: followUpStatus("status").notNull().default("draft"),
    toAddress: text("to_address"),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    method: text("method").notNull(), // gemini | template
    threadId: text("thread_id"), // Gmail id of the company email we reply to (thread resolved at send time)
    inReplyTo: text("in_reply_to"), // RFC Message-ID of the email being replied to
    gmailMessageId: text("gmail_message_id"),
    createdAt: createdAt(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (t) => [index("follow_ups_app").on(t.applicationId), index("follow_ups_user_status").on(t.userId, t.status)],
);

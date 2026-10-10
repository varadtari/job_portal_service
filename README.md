# JobPilot

A personal job search copilot. It lists jobs, autofills applications from a profile that learns new answers, tailors your resume to each job description, and tracks application status from your Gmail.

```
apps/web         Next.js 16 app (UI, API routes, cron) deployed to Vercel
apps/extension   Chrome extension (MV3) for autofill: build with `npm run build:ext`, load `apps/extension/dist`
packages/shared  Shared types and schemas
```

## Build status

| Phase | Scope | Status |
|---|---|---|
| 1 | Monorepo, Google login + allowlist, DB schema, app shell, cron stubs | ✅ Done |
| 2 | Profile editor, resume upload and parsing | ✅ Done (rule-based parser; Claude used if `ANTHROPIC_API_KEY` is set) |
| 3 | Job sources (Greenhouse, Lever, Ashby free; JSearch/Adzuna optional; URL import), jobs UI, skill match | ✅ Done |
| 4 | Resume tailoring (rules + optional Gemini free tier), review, PDF/DOCX export | ✅ Done |
| 5 | Chrome extension: autofill (incl. custom dropdowns), resume attach, learning, application capture | ✅ Done |
| 6 | Gmail sync (rule-based classifier + matcher), needs-review inbox, Kanban, timeline, dashboard funnel | ✅ Done |
| 7 | Worldwide jobs + location filter, one-click & bulk tailoring, apply queue (extension), follow-up emails (drafted, user sends) | ✅ Done |
| 8 | Outreach: hiring contacts (job posts, Gmail, company websites, manual/CSV), personalised emails with the master resume, capped batch sending | ✅ Done |

## One-time setup

### 1. Supabase (database and file storage)
1. Create a project at https://supabase.com/dashboard.
2. Go to **Project Settings → Database → Connection string**, choose **Transaction pooler** (port 6543), and copy it into `DATABASE_URL`.
3. Copy the project URL and the `service_role` key into `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

### 2. Google Cloud (login and Gmail)
1. Create a project at https://console.cloud.google.com.
2. Go to **APIs & Services → Library** and enable the **Gmail API**.
3. Go to **OAuth consent screen**:
   - Set the user type to **External** and leave the publishing status as **Testing**.
   - Add the scope `https://www.googleapis.com/auth/gmail.readonly`.
   - Under **Test users**, add every email on your allowlist.
4. Go to **Credentials → Create OAuth client ID → Web application** and add these authorised redirect URIs:
   - `http://localhost:3000/api/auth/callback/google`
   - `https://<your-vercel-domain>/api/auth/callback/google`
5. Copy the client ID and secret into `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`.

> Gmail read access is a *restricted* scope. Testing mode avoids Google's paid security review, but Google expires refresh tokens after 7 days. When that happens, the app shows a **Reconnect Gmail** banner; signing in again restores status tracking.

### 3. Local env
```bash
cp apps/web/.env.example apps/web/.env.local   # fill in values
openssl rand -base64 32                       # use for AUTH_SECRET and TOKEN_ENC_KEY
openssl rand -hex 24                          # use for CRON_SECRET
```

### 4. Install, migrate, run
```bash
npm install
cd apps/web
npm run db:migrate          # reads DATABASE_URL from .env.local
npm run dev
```

### 5. Deploy to Vercel
1. Import the repo at https://vercel.com/new and set **Root Directory** to `apps/web`.
2. Add every variable from `.env.example` under **Settings → Environment Variables**.
3. Deploy. The cron jobs in `apps/web/vercel.json` register automatically.
   - The Hobby plan allows only daily crons, so `vercel.json` runs both syncs once a day. For more frequent Gmail sync, call `/api/cron/gmail-sync` from an external scheduler (e.g. GitHub Actions) with `Authorization: Bearer $CRON_SECRET`.

Production URL: https://jobpilot-rho-green.vercel.app

## Chrome extension
1. `npm run build:ext` (outputs `apps/extension/dist`).
2. In Chrome open `chrome://extensions`, enable **Developer mode**, then **Load unpacked** and select `apps/extension/dist`.
3. In JobPilot → **Settings**, create a token and paste it into the extension popup.
4. On an application form: click the icon → **Autofill this page** (or Alt+Shift+F). Submitting, or **Save answers & mark applied**, saves new answers and logs the application.

The extension runs only when clicked (`activeTab`), plus ATS domains for embedded iframes. The token lives in extension storage; API calls go through the background worker, never the page. Custom dropdowns (react-select) are filled by a small page-world helper (`src/main.ts`) that calls the component's own select function.

## Android
**Phone app (PWA).** Open the site in Chrome on Android → ⋮ → *Install app* (or Settings → Phone app → Install). It runs full-screen with a bottom tab bar and:
- **Share → JobPilot** from LinkedIn, Naukri, Indeed or Chrome adds the job (`/share`, manifest `share_target`).
- **Quick answers** (`/answers`): tap any profile value or saved answer to copy it into a form.
- **Push notifications** (Settings → Notifications) when Gmail sync finds an assessment, interview, offer or rejection. Needs `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` (`npx web-push generate-vapid-keys`).
- Offline fallback page via `public/sw.js`.

**Firefox for Android extension.** `npm run build:firefox -w apps/extension` → `apps/extension/dist-firefox` (event-page background, gecko id, min Firefox 142). `npm run package:firefox -w apps/extension` zips it. Firefox requires signed add-ons. Bump `version` in `static/manifest.json`, then run `AMO_KEY=… AMO_SECRET=… npm run sign:firefox -w apps/extension` (keys from addons.mozilla.org → Developer Hub → API keys). It signs the add-on as *unlisted* (private) and saves `signed/*.xpi`; copy it to `apps/web/public/downloads/jobpilot-autofill.xpi` and deploy. Phones install it from Settings → "Download the Firefox add-on". (`web-ext sign` is rejected with "Unknown JWT iss" for this account; the script calls the AMO API directly.) The `/api/ext/*` routes allow CORS from extension origins (token auth, no cookies).

## Apply queue & follow-ups
- **Location filter**: `jobs.country_code` (from `lib/jobs/regions.ts`) powers region chips with counts plus free-text city/country. Searches with no location are worldwide; the company directory has ~150 global boards; JSearch rotates one country per day for worldwide searches.
- **One-click tailoring** (`lib/tailor/auto.ts`): Gemini (guarded, 35s timeout, LOW thinking) or rules; reuses an existing tailored resume unless re-tailored. Bulk selection on Jobs runs it per job (spaced for Gemini's free tier) and can queue each job.
- **Apply queue** (`/queue`, `apply_queue` table, `/api/ext/queue`): the extension opens each queued job, autofills it, attaches that job's tailored resume and shows a bottom bar; submitting (or "Submitted → next") logs the application and opens the next job. Nothing is auto-submitted.
- **Follow-ups** (`lib/followup/*`): due when the timer (latest of applied / last follow-up / company's last email) passes N days, while waiting (applied, assessment, no response), up to a max, never >30 days after the last activity. The daily Gmail cron drafts them (Gemini or template) and sends a push; the user reviews and sends from Gmail (`gmail.send` scope, threaded replies via `lib/gmail/send.ts`).

## Outreach
- **Contacts** (`lib/outreach/`, `outreach_contacts`): hiring addresses from job descriptions (after every jobs sync), recruiters in Gmail (daily), company websites, and paste/CSV import. `extract.ts` drops privacy/EEO/accessibility/no-reply/ATS/alert inboxes and marks team inboxes (careers@, hr@…) vs people. Location/remote come from the job, so the region chips work like on Jobs.
- **Company websites** (`site.ts`, `company_sites`): up to 6 public pages per site (home, careers, jobs, contact, about + linked career pages), honouring robots.txt. Found Greenhouse/Lever/Ashby boards are added to tracked companies (openings sync daily), schema.org JobPostings are stored as jobs, published addresses become contacts. ~30 sites are checked per day by the Gmail cron; re-checked every 14 days.
- **Emails** (`service.ts`, `outreach_emails`): Gemini (or a varied template) writes a short, factual email per contact; the user reviews drafts and clicks **Send all**. Sends go from Gmail with the master resume PDF attached (`buildMime` multipart), one every ~25 s from the open tab, max `users.outreach_daily_cap` (default 25) per 24 h, never the same address within 60 days, never to replied/bounced/do-not-contact. Replies and bounces are detected from the sent threads by the daily cron.

## Access control
- Only emails listed in `ALLOWED_EMAILS` (env) or the `allowed_emails` table can sign in. Everyone else gets "This Google account isn't on the allowlist".
- Every table has Row Level Security enabled with no policies, so Supabase's public API cannot read anything. The server connects as `postgres` and scopes every query by `user_id`.
- Gmail refresh tokens are encrypted at rest with AES-256-GCM (`TOKEN_ENC_KEY`).

## Development
```bash
cd apps/web
npm test            # vitest unit tests
SAMPLE_DIR=/path/to/samples npm run test:int   # real Supabase Storage + PDF/DOCX extraction
npm run typecheck   # next typegen + tsc
npm run lint
npm run db:generate # after editing lib/db/schema.ts
```
# job_portal_service

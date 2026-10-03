# JobPilot

A personal job search copilot. It lists jobs, autofills applications from a profile that learns new answers, tailors your resume to each job description, and tracks application status from your Gmail.

```
apps/web         Next.js 16 app (UI, API routes, cron) deployed to Vercel
apps/extension   Chrome extension for autofill (phase 5)
packages/shared  Shared types and schemas
```

## Build status

| Phase | Scope | Status |
|---|---|---|
| 1 | Monorepo, Google login + allowlist, DB schema, app shell, cron stubs | ✅ Done |
| 2 | Profile editor, resume upload and parsing | ⏳ |
| 3 | Job sources (JSearch, Adzuna, Greenhouse, Lever, Ashby, URL), jobs UI | ⏳ |
| 4 | Resume tailoring and PDF/DOCX export | ⏳ |
| 5 | Chrome extension: autofill, learning, application capture | ⏳ |
| 6 | Gmail sync, status classification, Kanban dashboard | ⏳ |

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
   - On the Hobby plan, crons are limited to once per day. Use Pro to get the 30-minute Gmail sync, or trigger it from an external scheduler with the `CRON_SECRET` bearer token.

## Access control
- Only emails listed in `ALLOWED_EMAILS` (env) or the `allowed_emails` table can sign in. Everyone else gets "This Google account isn't on the allowlist".
- Every table has Row Level Security enabled with no policies, so Supabase's public API cannot read anything. The server connects as `postgres` and scopes every query by `user_id`.
- Gmail refresh tokens are encrypted at rest with AES-256-GCM (`TOKEN_ENC_KEY`).

## Development
```bash
cd apps/web
npm test            # vitest
npm run typecheck   # next typegen + tsc
npm run lint
npm run db:generate # after editing lib/db/schema.ts
```
# job_portal_service

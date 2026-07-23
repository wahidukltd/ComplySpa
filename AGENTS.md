# AGENTS.md

Tooling, conventions, and auth architecture for this repo.

## Tooling (user-scoped, not checked in)

- **Ponytail** — active at `full` by default. Laziest working solution ladder.
- **Impeccable** — frontend anti-slop detector on UI file edits.
- **Psychological Copywriting** — governs all public-facing copy.
- **Context7** — fetch current library docs (Next.js, Supabase, Tailwind, etc.). Prefer over Exa for framework/API questions.
- **Exa** — web search / URL content extraction.
- **Deployment MCPs**: Cloudflare, Vercel, GitHub, Resend, Supabase.

## Stack

Next.js 16 (App Router) · TypeScript strict · Tailwind CSS v4 · shadcn/ui · Framer Motion · Supabase (Auth, PostgreSQL, Edge Functions, Storage, pg_cron) · Vercel (Hosting) · Resend (Transactional Email) · Polar.sh (Payments) · Sentry (Errors)

Domain complyspa.com on Cloudflare Registrar, DNS managed in Cloudflare, deployed via Vercel MCP.

## Auth — Supabase (NOT Clerk)

Clerk was removed. All auth is Supabase Auth.

### Auth entrypoints
- `src/proxy.ts` — Next.js 16 proxy (middleware). Uses `createServerClient` from `@supabase/ssr` with cookie-based auth. Checks auth state with `supabase.auth.getUser()`. Enforces route protection (public, dashboard, onboarding) and plan gating.
- `src/lib/supabase/client.ts` — browser Supabase client (`createBrowserClient` from `@supabase/ssr`). Cookie-based, no Clerk access token callback. Used in client components.
- `src/lib/supabase/server.ts` — server Supabase client (`createServerClient` from `@supabase/ssr`). Reads cookies via `next/headers`. Used in server components, server actions, route handlers.

### Auth pages
- `src/app/sign-in/page.tsx` — `LoginForm` component (email/password + Google OAuth redirect)
- `src/app/sign-up/page.tsx` — `SignUpForm` component (email/password + Google OAuth redirect)
- `src/app/reset-password/page.tsx` — `ResetPasswordForm` (handles both "enter email" and "set new password" states via URL hash detection)
- `src/app/auth/callback/route.ts` — OAuth code exchange via `exchangeCodeForSession(code)`. If no code param (recovery redirect with hash), redirects to `/reset-password`.

### Auth flow
- **Email/password sign-up**: `supabase.auth.signUp()` → confirmation email → user clicks link → `/auth/callback` → `exchangeCodeForSession` → `/onboarding`
- **Email/password sign-in**: `supabase.auth.signInWithPassword()` → `/dashboard`
- **Google OAuth (both sign-in & sign-up)**: `supabase.auth.signInWithOAuth({ provider: "google", redirectTo: "/auth/callback" })` → Google consent → redirect to Supabase callback → our `/auth/callback` → `exchangeCodeForSession` → `/dashboard` or `/onboarding`
- **Password reset**: `supabase.auth.resetPasswordForEmail({ redirectTo: "/reset-password" })` → recovery email → Supabase processes token → redirects to `/reset-password#access_token=...&type=recovery` → form detects hash → `supabase.auth.updateUser({ password })` → `/sign-in`

### RLS
The `users.auth_user_id` column stores the Supabase Auth user UUID. RLS policies use `auth.jwt() ->> 'sub'` which returns the Supabase Auth UUID. Queries use `.eq("auth_user_id", userId)` where userId comes from `(await supabase.auth.getUser()).user.id`.

### Supabase Auth config
- `site_url`: `https://complyspa.com`
- `additional_redirect_urls`: `["https://complyspa.com", "https://www.complyspa.com"]`
- Google OAuth credentials set as raw values via Management API (NOT `env()` references — those don't resolve properly)

## Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start Next.js dev server |
| `supabase start` | Start local Supabase stack |
| `supabase migration up` | Apply local migrations |
| `supabase db push` | Push migrations to production |
| `supabase functions serve` | Start Edge Functions locally |
| `npx tsc --noEmit` | TypeScript check |
| `npm run build` | Production build |

Required order: `npx tsc --noEmit` → `npm run build` before committing.

## Database conventions
- All primary keys: `id UUID DEFAULT gen_random_uuid() PRIMARY KEY`
- All timestamps: `TIMESTAMPTZ NOT NULL DEFAULT NOW()` with `updated_at` trigger
- Soft deletes use `deleted_at TIMESTAMPTZ NULL`
- Enums stored as `TEXT` with `CHECK` constraint
- Migrations numbered sequentially, never edit applied migrations

## Plan enforcement (3 layers)
1. **Middleware** — redirects `expired_trial`/`inactive` to `/pricing`
2. **Server components** — show upgrade banner for restricted features
3. **Database** — count checks before insert (PlanLimitError)

Plan values: `trial`, `expired_trial`, `inactive`, `solo`, `practice`, `multi_location`

## Email

### Zoho Mail (Free tier — 5 users, 5GB/user)
- **Mailboxes:** support@complyspa.com (Abdul Wahid), hello@complyspa.com (Arthur)
- **Alias:** alerts@complyspa.com → hello@complyspa.com (free, no extra slot)
- **Domain:** complyspa.com — verified, mail hosting enabled
- **DKIM:** `zmail._domainkey.complyspa.com` TXT — verified
- **SPF:** `v=spf1 include:zoho.com include:amazonses.com ~all` — verified
- **DMARC:** `_dmarc.complyspa.com` TXT — `p=none; rua=mailto:hello@complyspa.com`
- **MX:** mx.zoho.com (10), mx2.zoho.com (20), mx3.zoho.com (50)
- **CLI:** `zmail-cli.jar` authenticated as super admin (support@)
  - Launcher: `zmail-cli.bat`
  - Direct: `java -jar zmail-cli.jar -p MyEncPwd123! <command>`
  - Config: `~/.zmail-cli/` (encrypted tokens)
- **Webmail:** https://mail.zoho.com
- Resend: transactional emails (alerts, welcome, trials) — 3,000/month free
- Supabase Auth sends its own confirmation/recovery emails (configured in Auth → Email Templates)
- Resend FROM addresses: hello@complyspa.com (welcome/trial), alerts@complyspa.com (credential alerts)

### Resend (Verified)
- **Domain:** complyspa.com — verified, sending enabled
- **DKIM:** `resend._domainkey.complyspa.com` TXT — verified
- **Return-path:** `send.complyspa.com` MX + SPF — verified
- **Webhook:** `https://complyspa.com/api/resend/webhook` — `email.delivered`, `email.bounced`, `email.complained`, `email.failed`
- **Signing secret:** `whsec_J+h/k/siRvRB3hn5KjaxlYPina9pjidk` (in `.env.local` as `RESEND_WEBHOOK_SECRET`)

## Environment variables
- `NEXT_PUBLIC_*` vars exposed to browser — no secrets
- `SUPABASE_SERVICE_ROLE_KEY` — Edge Functions only
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID` — for Google OAuth browser redirect

## DNS (Cloudflare)
All records **proxied = false** (gray cloud). Proxy interferes with email DNS and auth redirects.

## Deploy
Vercel auto-deploys on push to `main` via GitHub integration. `supabase config push` for auth/API config.

## Sync on `errors.ts` — Single Source

**All error classes live in a single file**: `src/lib/utils/errors.ts`.

- `RlsViolationError` — RLS blocked an operation.
- `PlanLimitError` — clinic reached its plan cap.

If an error class is not in that file, it does not exist. Do not create new error classes in other files. Do not inline stringly-typed errors in helper functions — use the proper named class.

Sentinel instead of null:
```typescript
// ❌ Don't return null from a function that sometimes succeeds
// ✅ Return { error: null } or { data, error }
```
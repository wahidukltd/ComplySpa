# AGENTS.md

**Ponytail MUST be active at `full` for every task. No exceptions.**

ComplySpa — Med Spa Compliance SaaS. US-first.

## 3 Core Features

1. **Credential Tracker** — staff licenses, certifications, insurance, agreements
2. **Expiration Alerts** — email-only via Resend (no SMS)
3. **Audit Report PDF** — downloadable compliance report per clinic

## Commands (run in order: typecheck → lint → build)

```
npm run typecheck                    # tsc --noEmit
npm run lint                         # ESLint
npm run build                        # next build
npm run test:unit                    # vitest run tests/unit
npm run test:integration             # requires `supabase start` + .env.local
npm run test:e2e                     # playwright
```

**Security: Never push `.env*`, secrets, API keys, or credentials to GitHub.**  
Everything sensitive stays in `.env.local` (gitignored) or Vercel/Supabase environment variables.

## Entitlement System

Single source of truth at `src/lib/utils/entitlements.ts`. Every enforcement layer reads from `getEntitlements(plan)`:

| Layer | File | What it enforces |
|-------|------|-----------------|
| Middleware | `src/middleware.ts` | Blocks `expired_trial`/`inactive` from dashboard. Solo → redirects users settings. |
| Dashboard layout | `src/app/dashboard/layout.tsx` | Same blocks as middleware (defense-in-depth) |
| Server actions | `src/lib/actions/reports.ts` | Gating reports per tier (`none` for trial, `basic` for solo, `audit` for practice, `white_label` for multi) |
| API routes | `src/app/api/reports/email/route.ts` | Blocks email for plans without `canEmailReports` |
| Polar webhook | `src/app/api/polar/webhook/route.ts` | Processes subscription lifecycle (active/canceled/revoked/uncanceled/updated). Maps Polar products via metadata. |
| Limit checks | `src/lib/actions/staff.ts`, `credentials.ts`, `settings.ts` | Count-based checks via `getPlanLimits()` (derived from entitlements) |
| DB trigger | `supabase/migrations/030_fix_trigger_race_condition.sql` | Defense-in-depth with `pg_advisory_xact_lock` preventing race conditions on concurrent inserts |
| DB RPC | `clinics.update_clinic_subscription()` | Advisory-locked atomic subscription changes (prevents downgrade overwrite) |
| Billing page | `src/app/dashboard/settings/billing/page.tsx` | Live plan details, limits display, Polar customer portal link |
| Report template | `src/lib/pdf/report-template.tsx` | Accepts `tier` prop: basic → summary only, audit → full, white_label → unbranded |

### Plan → Feature Mapping (from entitlements.ts)

| Plan | Staff | Creds | Users | Reports | Email | API | Users Mgmt |
|------|-------|-------|-------|---------|-------|-----|------------|
| trial | 1000 | 10000 | 100 | ❌ none | ❌ | ❌ | ✅ |
| solo | 5 | 50 | 1 | ✅ basic | ❌ | ❌ | ❌ |
| practice | 15 | 300 | 3 | ✅ audit | ✅ | ❌ | ✅ |
| multi_location | 50 | 1000 | 10 | ✅ white_label | ✅ | ✅ | ✅ |

### Report Tiers

- **none** — trial: reports page shows upgrade CTA, server action blocks, no reports ever generated
- **basic** — solo: simplified PDF (summary + upcoming renewals only, no staff register, no cover page, no attestation), download only, no email
- **audit** — practice: full PDF with cover page, executive summary, staff register, status summary + category grid, upcoming renewals, attestation, branded header/footer with page numbers, email enabled
- **white_label** — multi_location: same content as audit but no "Compliance Audit Report" title, no branded header/footer/page numbers, clinic name as document title, unbranded enterprise output

#### Two Onboarding Paths

1. **14-day free trial** (default): `create_clinic_for_user` RPC sets `plan=trial` + `trial_end_date=NOW()+14d`. User explores all features during trial. Trial expiry cron moves to `expired_trial`.
2. **Skip trial / subscribe immediately**: Pricing page shows "Subscribe now" links. Click → Polar checkout → pay → `subscription.active` webhook → `update_clinic_subscription()` RPC activates plan immediately. No trial period.

Purchase can happen from: pricing page, billing settings, upgrade prompts on paywalled features, during onboarding, or any day of the trial. Checkout links generated via `src/lib/polar/checkout.ts`.

#### Subscription Lifecycle

| State | Trigger | Destination |
|-------|---------|-------------|
| signup | Onboarding → `create_clinic_for_user` RPC | `trial` with 14-day `trial_end_date` |
| skip trial | Polar checkout → `subscription.active` | Plan activated immediately, no trial |
| purchase during trial | Polar checkout → `subscription.active` | Trial ends, plan activated via RPC |
| trial→active | Polar webhook `subscription.active` | `update_clinic_subscription()` RPC maps product metadata to plan |
| upgrade | Polar webhook `subscription.updated` with new product | Plan updated via RPC |
| downgrade | Polar webhook `subscription.updated` with new product | Plan updated via RPC (RPC prevents expired_trial overwrite) |
| cancel | Polar webhook `subscription.canceled` | `cancel_at_period_end=true` set, plan unchanged |
| uncancel | Polar webhook `subscription.uncanceled` | `cancel_at_period_end=false` restored |
| revoke | Polar webhook `subscription.revoked` | Plan set to `expired_trial` immediately |
| trial expire | `daily-trial-expiry-check` cron | `trial` → `expired_trial` if `trial_end_date < NOW()` |
| inactive | `daily-inactive-cleanup` cron | `expired_trial` → `inactive` after 30 days |

Product mapping: Polar product metadata `plan: solo|practice|multi_location` or product name matching.

Checkout integration: `src/lib/polar/checkout.ts` creates Polar checkout links with `clinic_id` in metadata. Webhook at `src/app/api/polar/webhook/route.ts` looks up clinic by metadata first, then `polar_customer_id`. Customer portal via `src/lib/polar/customer-portal.ts` creates customer sessions.

**Polar.sh status: NOT YET APPROVED.** The webhook handler, checkout link generator, and customer portal session creator are infrastructure-ready code that compiles and uses the correct SDK types, but have never been tested against real Polar APIs. To enable, configure these env vars:

```
POLAR_ACCESS_TOKEN             # Server-side API access
POLAR_WEBHOOK_SECRET           # Webhook signature verification
POLAR_SOLO_PRODUCT_PRICE_ID    # Polar product price IDs
POLAR_PRACTICE_PRODUCT_PRICE_ID
POLAR_MULTI_LOCATION_PRODUCT_PRICE_ID
NEXT_PUBLIC_APP_URL            # Checkout success redirect
```

Without these, there is no checkout flow, no customer portal, and no subscription state transitions from Polar. Users stay on `trial` forever. The cron-based transitions (trial expiry → `expired_trial` → `inactive`) work independently of Polar.

**Specific untested gaps (documented so re-audit is not needed when Polar approval arrives):**
1. **No webhook idempotency table** — duplicate `subscription.active` events 30 sec apart hit RPC twice. Advisory lock prevents concurrent races but not duplicates. Add a `processed_webhooks` table keyed by event ID for at-least-once → exactly-once.
2. **`polar_customer_id` update race** — first subscription sets it outside the advisory lock. Two concurrent webhook events could both see null and both write. Move inside `update_clinic_subscription()` or add a separate locked RPC.
3. **`as Parameters<...>[0]` in checkout.ts** — the Polar SDK union type is masked by a type assertion. If the SDK types drift on upgrade, the compiler won't catch it. Remove the cast and use the correct union member type.
4. **8 of 11 transitions are Polar-gated** — only signup→trial, trial→expired_trial, and expired_trial→inactive work today. The other 8 (skip trial, purchase during trial, upgrade, downgrade, cancel, uncancel, revoke, trial→active) all require Polar approval and live webhook payloads to validate.

### Post-Trial Lifecycle

When trial expires (cron `daily-trial-expiry-check`), the clinic moves to `expired_trial`:
- **No data is deleted or modified** — staff, credentials, documents, settings, reports all preserved
- **All limits go to zero** — blocked from adding/modifying, existing data read-able via DB but app blocks writes via middleware redirect
- **Returning user flow**: sign in → middleware finds clinic → plan expired_trial → redirects to `/resume` (not `/pricing`)
- **Resume page** (`/resume`): full-screen premium UI with preserved staff/credential counts, professional copy, CTA to reactivate
- **Returning customer detection** (`restoreExistingAccount`): when email matches existing `users` record, links new `auth_user_id` and redirects to `/resume` — never duplicates clinic/account
- **Reactivation**: subscribe from `/resume`, `/pricing`, or billing settings → Polar checkout → webhook `subscription.active` → RPC restores plan → user continues where they left off

| State | Access | UI |
|-------|--------|-----|
| expired_trial | Blocked (read-only) | `/resume` premium screen |
| inactive | Blocked (read-only) | `/resume` premium screen |
| paid (after expired) | Full access | Dashboard as normal |

## Report Design

Colors: ink (#000000), action (#6E97A7), canvas (#FFFFFF).  
Status: valid (#4A8C5C), expiring (#C2853A), expired (#B8443A).  
Cover page: decorative accent bar, centered content, divider, meta fields.  
Executive summary: compliance score (%), staff count, narrative paragraph.  
Staff register: per-staff credential tables with alternating row backgrounds (#F8FAFB).  
Summary: metric cards with 4-column layout (total/valid/expiring/expired) for audit, compact list for basic.  
Category grid: 2-column layout (license, training, insurance, agreement).  
Attestation: italic statement with report ID and generation timestamp.  
Email template: branded card-style design with left accent bar, clinic info table.  
PDF viewer: inline preview via PDFViewer component in report-generator.

## 3 Colors

```
Background:  #FFFFFF
Primary:     #6E97A7
Text:        #000000
```

No other brand colors. Status colors (green/amber/red) are functional only.

## Tooling (always active)

- **Ponytail** — active at `full`. Laziest working solution ladder. Must be on for every task.
- **Graphify** — knowledge graph. Query it for any project knowledge. No assumptions ask Graphify first.

### MCPs + CLI

| Tool | Purpose |
|------|---------|
| Vercel MCP | Deploy, domains, env vars |
| Supabase MCP + CLI | Auth, DB, Edge Functions, Storage, migrations |
| GitHub MCP | Repos, PRs, issues, actions |
| Resend MCP | Transactional email |
| Sentry MCP | Error monitoring |
| Cloudflare MCP | DNS, registrar |
| Cloudflare-blog MCP | Cloudflare blog search |
| Cloudflare-docs MCP | Cloudflare documentation |
| Firecrawl MCP | Web scraping |
| Exa MCP | Web search |
| Context7 MCP | Library/framework docs |
| Zoho CLI | `zmail-cli.jar` — email admin (support@complyspa.com) |

### Specialist Review Agents

Use these for quality gates. Delegate when needed — do not skip.

| Agent | When to use |
|-------|-------------|
| Code Reviewer | PR review, code quality, logic checks |
| Security Reviewer | Auth, secrets, input validation, RLS |
| Database Reviewer | Migrations, schema changes, RLS policies, queries |

## Stack

| Layer | Tool | Purpose |
|-------|------|---------|
| Frontend | Next.js 16 (App Router) | React framework, SSR, routing |
| Language | TypeScript (strict) | Type safety |
| Styling | Tailwind CSS v4 + shadcn/ui | Utility-first CSS + component library |
| Animation | Framer Motion | UI animations |
| Auth | Supabase Auth | Email/password + Google OAuth, RLS |
| Database | Supabase PostgreSQL | Primary data store |
| Backend | Supabase Edge Functions | Serverless compute |
| Storage | Supabase Storage | File uploads (documents) |
| Cron | Supabase pg_cron | Scheduled jobs (expiration checks) |
| Email | Resend | Transactional emails (alerts, welcome) |
| Email Admin | Zoho Mail | support@, hello@, alerts@ |
| Payments | Polar.sh | Subscription billing |
| Monitoring | Sentry | Error tracking |
| Hosting | Vercel | Deployment + auto-deploy from GitHub |
| DNS | Cloudflare | Registrar + DNS management |

Domain: complyspa.com (Cloudflare Registrar, Vercel deploy).  
Push to `main` → auto-deployed to production.

## Email

- **support@complyspa.com** — support mailbox
- **hello@complyspa.com** — general mailbox  
- **alerts@complyspa.com** — alias → hello@ (credential expiration alerts)

## Rules

- Before commit: `npm run typecheck` → `npm run lint` → `npm run build`
- All error classes in `src/lib/utils/errors.ts` — single source.
- Use `{ data, error }` sentinel pattern, never return null.

## Lessons

- **Never change DNS records unless absolutely necessary.** Each change causes propagation delays that take the site down temporarily. The default Cloudflare + Vercel setup (proxied A record → 76.76.21.21) is correct and stable. CNAME flattening at the apex introduces risk for zero benefit.

### Known Technical Debt

These are acknowledged gaps that don't warrant fixing at their current risk level. Revisit if the related code area is being actively developed:

- **Sentinel pattern inconsistency** — `addCredential()` returns `{success, error}`, but `updateCredential()`/`deleteCredential()`/`verifyCredentialNow()` return `{error}` without `success`. Standardize if touching these actions.
- **Edge Function code duplication** — `send-credential-alert/index.ts` duplicates `htmlEscape`, `sleep`, and retry logic from `src/lib/email/send.ts`. Deno vs Node runtime prevents shared imports. Update both if changing retry behavior.
- **Webhook rate limiter in-memory** — Resend webhook rate limiter uses a `Map` that resets on Vercel deploy. Resend controls the caller IPs, Svix validates signatures. Add persistent storage if throughput exceeds 100 req/min.
- **In-memory rate limits (report email, health)** — Same pattern as resend webhook. Acceptable at current scale. Add persistent storage if throughput grows.
- **No e2e tests** — `tests/e2e/` has only `.gitkeep`. Add Playwright tests before major UI refactors.

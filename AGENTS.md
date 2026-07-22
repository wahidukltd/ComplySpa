# AGENTS.md

This file provides guidance to Opencode.

## Tooling that governs work in this repo

The following are configured at Claude Code **user scope** and shape how code gets written and reviewed here. They are not repo files — they load automatically in every session.

- **Ponytail** (`ponytail@ponytail` plugin) — enforces a "laziest solution that works" ladder (YAGNI → reuse → stdlib → native → installed dep → one line → minimum). Active at `full` by default. Reach for `/ponytail ultra` only to cut bloat; `stop ponytail` to disable. Never strips validation, error handling, security, or accessibility — this aligns with the "Simplicity Over Cleverness" principle below.
- **Impeccable** (`impeccable@impeccable` plugin) — frontend design skill + a `PostToolUse` detector hook that runs 45 deterministic anti-slop rules on UI file edits (HTML/CSS/JSX/TSX/Vue/Svelte), no LLM. Run `/impeccable init` once the frontend exists to write `PRODUCT.md`/`DESIGN.md`; use `/impeccable critique`, `/impeccable audit`, `/impeccable polish` for design work. Pairs with the Frontend Conventions and Accessibility sections below.
- **Psychological Copywriting** (`.agents/skills/psychological-copywriting/SKILL.md`) — governs ALL public-facing copy: landing page headlines, pricing page text, email templates, blog posts, and marketing CTAs. Mandatory audit before any public page ships. Enforces anti-AI-pattern checks (no "Unlock," "Leverage," "seamless," "revolutionize," "game-changer," "In today's fast-paced world"), audience diagnosis, persuasion framework selection, and conversion psychology. All public copy must sound like a med spa consultant who has seen 50 board inspections — direct, expert, unpretentious. No generic SaaS voice.
- **Exa** (`mcp__exa__web_search_exa`, `mcp__exa__web_fetch_exa`) — web search / URL content extraction. Use for general web lookups (competitor research, market context).
- **Context7** (`context7` MCP, auto-triggers on library/framework questions) — fetches current, version-specific library docs (Next.js, Supabase, Clerk, Tailwind, Prisma, etc.) instead of relying on training data. **Prefer Context7 over Exa for library API / framework questions.**
- **skill-creator** skill (project-scoped, `.agents/skills/skill-creator`) — use when creating, editing, or benchmarking custom skills.
- **Deployment MCPs** — the following MCP servers are available for Phase 7.8+ deployment automation. Use them instead of manual dashboard steps wherever possible:
  - **Cloudflare MCP** — DNS record CRUD, zone settings (DNSSEC, SSL/TLS, HSTS, security level, bot fight mode, speed/network optimization)
  - **Vercel MCP** — project creation, environment variables, domain management, deployments
  - **Clerk MCP** — JWT templates, instance configuration, redirect URLs
  - **GitHub MCP** — repository settings, branch protection, secret scanning
  - **Resend MCP** — sending domains, DKIM records, domain verification, webhooks, verified emails
  - **Supabase MCP** — SQL execution, database management, migration verification

**Tool selection rule:** Context7 for library/framework docs, Exa for general web search, deployment MCPs for Phase 7.8+ infrastructure, Ponytail to keep code minimal, Impeccable for UI design/quality, Psychological Copywriting for public-facing copy. No overlap — pick the one matching the task.

## Project Overview

ComplySpa is a vertical SaaS product for medical spas globally, launching in the US market. It tracks staff credentials, sends automated expiration alerts, and generates audit-ready compliance reports. **3 features** — credential tracker, expiration alerts, audit-ready PDF reports. Feature 4 (inspection-readiness engine) was removed in July 2026 to keep MVP scope tight.

**Stack:** Next.js 14+ (App Router) · TypeScript · Tailwind CSS · shadcn/ui (component library) · Framer Motion (micro-interactions + page transitions) · React Three Fiber + Three.js (landing page hero 3D only) · Supabase (PostgreSQL, Edge Functions, Storage, pg_cron) · Clerk (Auth) · Vercel (Hosting) · Resend (Transactional Email) · Zoho Mail (Business Email — support@, hello@) · Polar.sh (Payments) · Sentry (Errors)

**Domain:** complyspa.com — purchased on Cloudflare Registrar. DNS managed in Cloudflare. Deployed directly to the domain via Vercel MCP.

**Alert channel:** Email-only via Resend. SMS (Twilio) was removed — founder is non-US citizen, Twilio requires US business tax ID for upgrade beyond trial. Email handles all alert use cases (detailed info, paper trail, attachments) at $0 cost. SMS can be reintroduced later via Vonage or MessageBird if needed.

**Architecture:** Two services only — Vercel (frontend) + Supabase (database, auth fallback, storage, crons, edge functions). No separate backend server. No Railway. No microservices. No message queues.

**Product name:** ComplySpa. This is the official brand name. Use it in domain registrations, metadata titles, email templates, and public-facing pages. Do NOT use alternative names — consistency across all touchpoints is mandatory.

## Engineering Principles

### 1. Security First
- Every database table has Row Level Security (RLS) enabled
- Clinic data isolation is enforced at the database level, not the application level
- The Supabase service role key is NEVER used in client-side code or Vercel API routes that serve HTML — only in Edge Functions
- All user input is validated with Zod schemas before any database operation
- All webhooks validate signatures before processing
- Document uploads use presigned URLs that expire in 15 minutes — files go directly from browser to Supabase Storage, never through Vercel

### 2. Simplicity Over Cleverness
- Prefer boring, proven patterns over fashionable abstractions
- No premature optimization. No speculative features. No abstraction layers until duplication is proven
- A solo founder must be able to understand every file in the codebase without studying architecture documentation
- If a solution requires more than 3 levels of indirection, it is too complex — simplify

### 3. Type Safety Is Non-Negotiable
- TypeScript strict mode enabled. No `any` types. No `@ts-ignore`
- All Supabase query results are typed using generated database types (`supabase gen types`)
- All API inputs (forms, webhooks, Edge Function payloads) are validated with Zod schemas
- All function parameters and return types are explicitly typed

### 4. Production-Ready By Default
- No placeholder code. No TODO comments without an associated GitHub issue
- No silent failures — every error is either handled, logged to Sentry, or surfaced to the user
- No `console.log` in production code — use Sentry for error tracking
- Every feature includes error states, loading states, and empty states in the UI

### 5. Consistency Over Novelty
- Follow existing patterns in the codebase. Do not introduce parallel patterns
- If a component exists that does 80% of what you need, extend it — do not create a new one
- Use the same naming conventions, file structure, and import patterns throughout
- When refactoring, update all affected files — do not leave half-migrated patterns

## Repository Structure

```
/complyspa
  /src
    /app                          # Next.js App Router
      /dashboard
        /staff                    # Staff CRUD pages
        /credentials              # Credential CRUD pages
        /reports                  # Audit report generation
        /settings                 # Clinic settings, billing, users
        layout.tsx                # Dashboard layout with auth guard
        page.tsx                  # Main dashboard
      /api
        /polar/webhook/route.ts   # Polar billing webhook
        /resend/webhook/route.ts  # Email delivery status webhook
      /sign-in/[[...index]]/page.tsx
      /sign-up/[[...index]]/page.tsx
      /onboarding/page.tsx        # New user onboarding flow
      /pricing/page.tsx           # Public pricing page
      layout.tsx                  # Root layout with ClerkProvider
      page.tsx                    # Landing page
    /components
      /ui/                        # Generic UI: Button, Table, Badge, Dialog, Input, Select, Toast
      /staff/                     # Staff-specific: StaffForm, StaffTable, CredentialForm
      /alerts/                    # AlertList, DeliveryStatusBadge
      /reports/                   # PdfTemplate, ReportGenerator
      /layout/                    # Sidebar, Topbar, PageHeader
    /lib
      /supabase/
        client.ts                 # Browser Supabase client (anon key, RLS-enforced)
        server.ts                 # Server-side Supabase client (service role, Edge Functions only)
        middleware.ts             # Session refresh middleware
      /clerk/
        middleware.ts             # Auth middleware (protects /dashboard)
      /validations/
        staff.ts                  # Zod schemas for staff + credential forms
        webhook.ts                # Zod schemas for webhook payloads
      /email/
        templates.tsx             # Email templates (alert, welcome, trial reminders)
        send.ts                   # Resend API wrapper
      /pdf/
        report-template.tsx       # react-pdf template for audit report
      /polar/
        client.ts                 # Polar SDK wrapper
        webhook.ts                # Webhook signature validation + event handler
      /utils/
        date.ts                   # Date formatting, timezone handling
        status.ts                 # Credential status calculation
        currency.ts               # Currency formatting
    /types/
      database.ts                 # Generated from Supabase (supabase gen types)
      index.ts                    # Shared types
    /middleware.ts                 # Root middleware (Clerk auth + Supabase session)
  /supabase
    /migrations/
      001_initial_schema.sql
      002_rls_policies.sql
      003_pg_cron_jobs.sql
      004_credential_audit.sql
      006_security_fixes.sql
      007_post_review_fixes.sql
    /functions/
      send-credential-alert/
        index.ts
    config.toml
  /tests
    /e2e/                         # Playwright tests
    /unit/                        # Vitest unit tests
    /integration/                 # Vitest + local Supabase tests
  .env.local.example
  .env.local                      # Gitignored — all API keys
  .gitignore
  next.config.js
  tailwind.config.ts
  tsconfig.json
  vitest.config.ts
  playwright.config.ts
  package.json
```

## Page Inventory

**Public Pages (built in Phase 8)**
- `/` — Landing page (marketing, conversion-focused, enterprise-grade design)
- `/pricing` — Three plan cards, free trial CTA, feature comparison table

**Auth Pages (built in Phase 0)**
- `/sign-in` — Clerk `SignIn` component
- `/sign-up` — Clerk `SignUp` component

**Onboarding (built in Phase 8)**
- `/onboarding` — 4-step wizard: create clinic → add staff → enter credentials → "You're all set" → dashboard

**Dashboard Pages (the product — built across Phases 2-8)**
- `/dashboard` — Main overview: status counts, expiring credentials, recent alerts
- `/dashboard/staff` — Staff list table with status badges, add/edit/delete
- `/dashboard/staff/[id]` — Single staff profile with all credentials
- `/dashboard/staff/[id]/credentials` — Credential list for one staff member, add/edit/delete
- `/dashboard/credentials` — All credentials across all staff, filterable by type/status/staff
- `/dashboard/reports` — Report generation: select date range, generate PDF
- `/dashboard/settings` — Clinic profile, alert recipients, custom credential types, user management
- `/dashboard/settings/billing` — Current plan, manage subscription via Polar portal
- `/dashboard/settings/users` — Invite manager/viewer, manage roles

Total: 13 pages (2 public, 2 auth, 1 onboarding, 8 dashboard). `/dashboard/audit` was removed with Feature 4 (July 2026).

## Naming Conventions

| Element             | Convention           | Example                |
|---------------------|----------------------|------------------------|
| Files (components)  | PascalCase           | StaffForm.tsx          |
| Files (utilities)   | camelCase            | dateUtils.ts           |
| Files (pages)       | Next.js convention   | page.tsx, layout.tsx   |
| Directories         | lowercase-hyphenated | settings/               |
| TypeScript types    | PascalCase           | CredentialRecord       |
| Variables/functions | camelCase            | getExpiringCredentials |
| Constants           | UPPER_SNAKE_CASE     | ALERT_INTERVAL_DAYS    |
| Database tables     | snake_case           | staff_members          |
| Database columns    | snake_case           | expiration_date        |
| Environment vars    | UPPER_SNAKE_CASE     | RESEND_API_KEY         |
| Zod schemas         | camelCase + Schema   | staffFormSchema        |
| Edge Functions      | kebab-case           | send-credential-alert  |

## Database Conventions

### Schema
- All primary keys: `id UUID DEFAULT gen_random_uuid() PRIMARY KEY`
- All foreign keys: `<entity>_id UUID REFERENCES <table>(id) ON DELETE CASCADE`
- All date columns: `TIMESTAMPTZ NOT NULL` (never `DATE` — timezone bugs)
- All timestamps: `created_at TIMESTAMPTZ DEFAULT NOW()`, `updated_at TIMESTAMPTZ DEFAULT NOW()`
- `updated_at` is maintained by a trigger function that sets `updated_at = NOW()` on every UPDATE
- Soft deletes use `deleted_at TIMESTAMPTZ NULL` — queries filter `WHERE deleted_at IS NULL`
- Arrays use PostgreSQL native arrays (`TEXT[]`) for simple lists, not junction tables
- Flexible data uses `JSONB` (e.g., `report_data_snapshot`)
- Enums are stored as `TEXT` with a `CHECK` constraint, not PostgreSQL `ENUM` types (easier to modify)

### Migrations
- Migrations are numbered sequentially: `001_initial_schema.sql`, `002_rls_policies.sql`
- Each migration is idempotent — safe to run multiple times
- Never edit an applied migration. Create a new migration instead
- Test migrations locally: `supabase migration up`
- Push to production: `supabase db push`
- Seed data (credential types) goes in the initial migration

### Row Level Security
- RLS is enabled on EVERY table that contains clinic-specific data
- The base policy pattern:

```sql
CREATE POLICY "clinic_isolation_select" ON staff_members
  FOR SELECT USING (
    clinic_id IN (
      SELECT clinic_id FROM users WHERE clerk_user_id = auth.jwt() ->> 'sub'
    )
  );
```

- Service role bypasses RLS — used ONLY in Edge Functions via `SUPABASE_SERVICE_ROLE_KEY`
- Test RLS by inserting as clinic A and querying as clinic B — must return zero rows

### pg_cron
- All scheduled jobs use `pg_cron` extension
- Jobs call SQL functions that invoke Edge Functions via `net.http_post` (`pg_net` extension)
- Never put business logic in the cron job itself — put it in a SQL function or Edge Function
- Test cron jobs by manually calling the SQL function: `SELECT scan_expiring_credentials();`

### Trial Lifecycle
- `clinic.plan` values: `'trial'`, `'expired_trial'`, `'inactive'`, `'solo'`, `'practice'`, `'multi_location'`
- `clinic.trial_end_date`: `TIMESTAMPTZ`, set to `NOW() + 14 days` on clinic creation (column DEFAULT)
- pg_cron job `daily-trial-expiry-check` (07:00 UTC): updates `plan` from `'trial'` to `'expired_trial'` when `trial_end_date < NOW()`
- pg_cron job `daily-inactive-cleanup` (08:00 UTC): updates `plan` from `'expired_trial'` to `'inactive'` when `trial_end_date < NOW() - 30 days`
- Polar webhook `subscription.active`: updates `plan` to paid tier (`solo`/`practice`/`multi_location`)
- Polar webhook `subscription.canceled`: updates `plan` to `'inactive'`
- Data is never deleted due to plan status — only access is gated

#### Skip Trial (Subscribe Immediately)

A user can bypass the 14-day trial entirely and pay immediately. Two flows:

**Flow A — Checkout first, then sign up (recommended):**
1. User visits landing page / pricing page → selects a paid plan
2. Clicks "Subscribe" → Polar checkout → completes payment
3. Polar webhook marks payment as pending (associates with email, not clinic_id yet — no clinic exists)
4. User signs up via Clerk → completes onboarding wizard
5. `create_clinic_for_user` RPC creates clinic with `plan = 'trial'` (default)
6. Polar webhook detects the new user's email matches a pending subscription → fires `subscription.active` → updates `plan` from `'trial'` to the paid tier
7. User lands on dashboard with paid plan limits — trial was skipped in milliseconds

**Flow B — Sign up first, subscribe immediately:**
1. User signs up → completes onboarding → clinic created with `plan = 'trial'`
2. On dashboard or settings/billing, user clicks "Upgrade"
3. Polar checkout → completes payment
4. Polar webhook `subscription.active` fires → updates `plan` to paid tier
5. User gets immediate access to paid features — trial_end_date becomes irrelevant

**Database support**: `clinics.plan` CHECK constraint includes all values. Updating from `'trial'` to `'practice'` is allowed. pg_cron only touches rows where `plan = 'trial'` — if plan is already changed, pg_cron ignores it.

#### Mid-Trial Upgrade (Subscribe During Trial)

A user on trial wants to upgrade to a paid plan before the 14 days expire:

1. Banner on dashboard: "X days left in your trial" with "Upgrade now" button
2. Settings → Billing: shows current plan + "Upgrade" button
3. Pricing page: shows "Subscribe" CTAs (not "Start free trial") for authenticated users
4. Polar checkout → payment → webhook → plan updated → immediate paid access
5. `trial_end_date` continues to exist but is irrelevant — pg_cron only checks `plan = 'trial'`

**No RPC change needed for pre-Polar (Phase 7)**: The `create_clinic_for_user` RPC always creates clinics with `plan = 'trial'`. Plan changes happen via Polar webhook (Phase 9), which updates the plan column directly. The RPC does NOT need a `p_plan` parameter — the plan defaults to trial and Polar upgrades it. This is simpler and avoids parameter validation.

**Manual upgrade during development (pre-Polar)**:
```sql
-- Set yourself to any plan for testing
UPDATE clinics SET plan = 'practice' WHERE id = 'YOUR_CLINIC_ID';
-- No other changes needed — middleware, Edge Functions, RLS all react to plan immediately
- Data is never deleted due to plan status — only access is gated

## Frontend Conventions

### Next.js App Router
- Use Server Components by default for data fetching and static rendering
- Use `'use client'` only for interactive components (forms, filters, dialogs, dropdowns)
- Server Components fetch data via the Supabase server client
- Client Components receive data as props and use the Supabase browser client for mutations
- Layout files (`layout.tsx`) handle authentication guards and shared UI
- Page files (`page.tsx`) are thin — they compose components and fetch data

### Component Design
- Components are single-responsibility — one component does one thing
- Components under 200 lines. If longer, split into sub-components
- Props are typed with TypeScript interfaces, not inline types
- Components do not fetch data directly unless they are Server Components — data is passed as props or fetched via custom hooks
- UI components (buttons, tables, badges) are generic and reusable — no business logic in UI components
- Business components (StaffForm, CredentialForm) contain domain logic and call Supabase directly

### State Management
- No global state library (no Redux, no Zustand). Use React's built-in state:
  - `useState` for local component state
  - `useOptimistic` for optimistic updates on mutations
  - Server Components for initial data load
  - `revalidatePath` or `revalidateTag` for cache invalidation after mutations
- Form state uses `react-hook-form` with Zod validation (`zodResolver`)
- No prop drilling deeper than 2 levels — use Server Component data fetching instead

### Styling
- Tailwind CSS only. No CSS modules, no styled-components, no inline styles
- Use the `cn()` utility (`clsx` + `tailwind-merge`) for conditional classes
- Color tokens are defined in `globals.css` as CSS variables and are non-negotiable. The palette uses exactly three colors. Do not introduce new tokens, revert to cold Tailwind defaults, or pick ad-hoc brand colors.

#### Foundation — three colors only

| Token | Hex | Role |
|---|---|---|
| `--color-canvas` | `#FFF8F2` | Cream. Page backgrounds, empty states, hero surface. The dominant color everywhere. |
| `--color-action` | `#6E97A7` | Blue-teal. The ONLY filled-button / link / focus-ring / active-nav color. |
| `--color-ink` | `#000000` | Pure black. Primary text, headings, structural chrome. No dark grays — black delivers maximum contrast and readability. |

#### Derived tokens (built from the three foundation colors + white)

| Token | Value | Role |
|---|---|---|
| `--color-surface` | `#FFFFFF` | White. Elevated cards, dashboard panels, input backgrounds. Sits on the cream canvas. |
| `--color-surface-alt` | `#F0F4F5` | Very light blue-teal tint. Hover backgrounds, alternating section bands. |
| `--color-hairline` | `rgba(0,0,0,0.12)` | 12% black. Borders, dividers, input outlines. |
| `--color-text` | `#000000` | Same as `--color-ink`. Primary body and heading text. |
| `--color-text-muted` | `rgba(0,0,0,0.55)` | 55% black. Secondary text, metadata, helper copy, captions. |
| `--color-input-border` | `rgba(0,0,0,0.20)` | 20% black. Default input border. On focus, shifts to `--color-action`. |

#### Semantic status tier — functional colors, not brand colors

Status colors exist for compliance state communication. They are NOT additional brand colors — they serve a functional purpose (WCAG 1.4.1: Use of Color). Every status pill ships as `tint background + dark foreground text + icon + visible label`.

| Status | Strong | Tint Bg | Text on tint | Icon | Label |
|---|---|---|---|---|---|
| Valid / Active | `#5B8A6A` | `#E8F2EB` | `#2D5C3A` | ✓ check | "Valid" |
| Expiring / Warning | `#C2853A` | `#FBF0E0` | `#7A4E1F` | ▲ triangle | "Expiring" |
| Expired / Critical | `#B8443A` | `#FCE8E5` | `#7A2A26` | ✕ X | "Expired" |
| Unknown / Not tracked | `rgba(0,0,0,0.40)` | `#F0F0F0` | `rgba(0,0,0,0.60)` | dash | "Unknown" |

#### Data visualization (charts, KPIs)
Blue-teal anchors the first series. All chart colors derive from the primary hue family or use opacity variations of black.

| Slot | Value | Use |
|---|---|---|
| 1 | `#6E97A7` | Default series — the brand anchor |
| 2 | `#5B8A6A` | Distinguishable cool green |
| 3 | `rgba(0,0,0,0.45)` | Muted gray-black |
| 4 | `#8DA7B0` | Lighter primary |
| 5 | `#4A7D8C` | Darker primary |

#### Dark theme — tokens DEFINED, UI toggle is POST-MVP

Dark-mode toggle is OUT of MVP scope — do not add `dark:` classes to UI surfaces. The tokens are defined in `globals.css` as a deferred design system.

#### Responsive
- Mobile-first. Test at 375px (mobile), 768px (tablet), 1280px (desktop)

### Component Library
- Use shadcn/ui for all UI components (Button, Table, Badge, Dialog, Input, Select, Toast, Dropdown, Tabs, Card, Skeleton)
- Install: `npx shadcn@latest init`
- shadcn/ui components are copied into the project — they live in `src/components/ui/`
- All UI must look enterprise-grade: clean typography, consistent spacing, no amateur styling
- Use `lucide-react` for all icons (included with shadcn/ui)

### Animation & 3D Graphics

#### Framer Motion — used EVERYWHERE in the product
- Install: `npm install motion`
- Use for: page transitions, list item enter/exit animations, card hover effects, loading skeletons, toast notifications, sidebar slide-in on mobile, dialog open/close, tab transitions, badge state changes
- Keep animations subtle and fast: 200-400ms duration, ease-out easing
- Respect `prefers-reduced-motion`: wrap motion components in a check and disable animation for users who request it

#### React Three Fiber + Three.js — LANDING PAGE ONLY
- Install: `npm install three @react-three/fiber @react-three/drei`
- Use for: landing page (`/`) hero section 3D background ONLY
- DO NOT use Three.js in the dashboard, settings, or reports pages
- The 3D hero must lazy-load: use `next/dynamic` with `ssr: false`, show static gradient fallback
- Max 50KB gzipped for Three.js payload. Simple geometry only. No GLTF, no textures.
- Respect `prefers-reduced-motion`: render a static gradient instead
- Color palette for 3D: `#FFF8F2` (cream) and `#B5CED6` (lightened primary) against a `#FFF8F2` canvas. Soft lighting only. No dark backgrounds.

### Accessibility
- All interactive elements are keyboard-accessible
- All form inputs have associated `<label>` elements
- All images have alt text
- Color is never the sole indicator of status — always include text (e.g., "Expired" not just red)
- Use semantic HTML: `<table>`, `<thead>`, `<tbody>`, `<th scope="col">`
- Test with keyboard-only navigation before releasing any feature

## Public Pages & Marketing Conventions

The landing page (`/`) and pricing page (`/pricing`) are the conversion surface.
They must communicate trust, authority, and premium quality without feeling
like a generic SaaS template. See the Engineering Blueprint, Phase 7.2-7.5
for the complete specification. This section documents the code-level conventions.

### Landing Page (`src/app/page.tsx`)

- Server Component. Pre-rendered HTML for SEO.
- Three.js 3D hero background ONLY — soft organic forms (smooth, flowing,
  rounded metaball-like shapes) in brand colors (`#B5CED6` lightened primary,
  `#6E97A7` primary) against a `#FFF8F2` (cream) canvas. Not geometric.
  Not hard-edge. Not dark. Subtle slow morphing (0.001 rad/frame max). Warm
  ambient lighting creating soft shadows.
- Three.js lazy-loaded via `next/dynamic` with `ssr: false`. Static gradient
  fallback (`#FFF8F2 → #6E97A7`) while loading.
- Three.js canvas has `aria-hidden="true"` and `role="presentation"` — purely
  decorative. Screen readers read the hero text, not the 3D.
- On mobile (< 768px): replace Three.js with a static gradient. No 3D on
  devices where GPU/bandwidth are constrained.
- Hero headline: 12 words max. Renders instantly — no fade-in, no typing
  animation. CSS opacity transition on CTAs only (200ms).
- Sections below the hero: Framer Motion scroll-triggered reveals only
  (fade + subtle translateY, 300ms, ease-out). No animation on trust signals
  or testimonial text — motion on social proof reduces credibility.
- Performance budget: Lighthouse > 90 desktop, > 85 mobile. Total page
  weight < 300KB. Three.js chunk < 50KB gzipped.
- Every headline and CTA must pass the psychological-copywriting skill audit.
  Zero AI slop phrases. Every claim is evidence-backed (Reddit link, industry
  stat, or board citation).

### Pricing Page (`src/app/pricing/page.tsx`)

- Server Component. Pre-rendered HTML for SEO.
- Three plan cards: Solo ($29/mo), Practice ($49/mo), Multi-Location ($79/mo).
- "Practice" card has subtle primary border highlight + "Most popular" badge.
- Annual/monthly toggle: Framer Motion on price numbers only (transform +
  opacity, 200ms). No layout shift — card dimensions fixed.
- Card entrance: Framer Motion stagger on page load (100ms per card, 300ms
  fade + 8px translateY). One-time — no re-trigger on scroll.
- Feature comparison table: shadcn/ui Table. ✓ for included, — for excluded.
  Sticky header row. No animation on the table itself.
- FAQ: shadcn/ui Accordion. One open at a time. Framer Motion
  AnimatePresence on content height.
- NO Polar checkout links during Phase 7. Trial CTA goes to `/sign-up`.
  Polar checkout is wired in Phase 9.
- No dark patterns: no countdown timers, no fake scarcity, no hidden fees.
  All prices are final (Polar handles tax).
- Price anchoring note: "Most med spa compliance tools cost $3,000/year.
  Same coverage, 88% less." in small muted text below cards.

### Three.js on Public Pages — Rules

- Landing page hero ONLY. Never on pricing, auth, dashboard, or blog pages.
- Simple geometry only — no GLTF models, no textures, no external assets.
- Max 50KB gzipped for the Three.js payload.
- Respects `prefers-reduced-motion`: renders static gradient instead.
- Canvas is a background layer (z-index behind hero text).
- Colors: `#FFF8F2` (cream), `#B5CED6` (lightened primary), `#6E97A7` (primary
  — the page canvas the 3D sits on). No dark hues.

### Framer Motion on Public Pages — Rules

- Scroll-triggered reveals only: `whileInView` with `viewport={{ once: true }}`.
  Nothing re-triggers on subsequent scrolls.
- Landing page: stagger on pain-point cards (100ms per card) and feature cards
  (50ms per card). No stagger on "How It Works" (all three appear together).
- Pricing page: card entrance stagger on page load only. Price toggle animation
  only on the numbers.
- No animation on: trust signals, testimonial text, comparison table, FAQ
  question text, footer, or any copy that is actively being read.
- Duration: 200-400ms max. Easing: ease-out. Nothing decorative or attention-
  seeking. Animation must serve orientation (where am I on the page?) or
  feedback (did the toggle switch?), never decoration.
- `prefers-reduced-motion`: all Framer Motion disabled. Accordion opens
  instantly. No scroll reveals.

### SEO & GEO Standards

The complete SEO and Generative Engine Optimization (GEO) specification lives
in the Engineering Blueprint, Section 9.15. This section documents the
code-level requirements enforced at implementation time.

Non-negotiable for every public page:
- Export `metadata` or `generateMetadata` with: title, description, keywords,
  robots (index/follow), openGraph (title, description, image 1200×630),
  twitter card, canonical URL.
- JSON-LD structured data on homepage (Organization + SoftwareApplication),
  pricing page (OfferCatalog), and blog posts (Article + BreadcrumbList).
  Validated against https://validator.schema.org/ before commit.
- `src/app/sitemap.ts` — dynamic sitemap with all public routes.
- `src/app/robots.ts` — allows `/`, `/pricing`, `/blog/*`; disallows
  `/dashboard/*`, `/api/*`, `/onboarding/`.
- All public pages are Server Components (pre-rendered HTML). No client-side
  rendered content that search engines cannot read.
- Images: Next.js `<Image>` component with explicit width/height, lazy
  loading, WebP/AVIF formats.
- Fonts: Inter via `next/font/google` with `display: 'swap'`.
- Core Web Vitals: Lighthouse > 90 on every public page.
- Internal links use `<a>` tags or `next/link` — search engines must be
  able to crawl the entire public site.
- Blog (Phase 7+): MDX files in `/content/blog/`, rendered via Server
  Components. Each post: Article JSON-LD, BreadcrumbList JSON-LD, author
  bio with Person schema, internal links to 2+ related posts.

### Psychological Copywriting — Rules

The psychological-copywriting skill (`.agents/skills/psychological-
copywriting/SKILL.md`) governs all public-facing copy. Before any public page
ships:
- Run the skill's self-audit on all headlines, subheadlines, CTAs, and body
  copy above the fold.
- Verify zero AI-slop phrases: no "In today's fast-paced world," no "In the
  ever-evolving landscape of," no "Unlock," no "Leverage," no "seamless,"
  no "revolutionize," no "cutting-edge," no "game-changer," no "next-gen."
- Tone: direct, expert, unpretentious. Like a med spa consultant who has
  seen 50 board inspections and doesn't sugarcoat.
- Audience state: med spa owners feeling ANXIETY, not curiosity. Copy must
  acknowledge the specific risk (license lapsing, board investigation, staff
  operating outside scope) and offer the concrete solution.
- Every claim is evidence-backed: link to a Reddit thread, industry stat,
  or board citation. No assertion without attribution.
- Pricing page copy: no dark patterns. No countdown timers. No fake urgency.
  The trial is real — honor it.
- Email templates (Resend): same rules apply. Alert emails, trial reminders,
  and onboarding emails must match the product's voice — direct, helpful,
  never salesy.

## Backend Conventions

### Supabase Client Usage
- Browser client (`lib/supabase/client.ts`): uses anon key, RLS-enforced, used in Client Components
- Server client (`lib/supabase/server.ts`): uses service role key, bypasses RLS, used ONLY in Edge Functions and server-side admin operations
- Never import the service role client in a Client Component — this is a critical security violation
- Always select specific columns — never `select('*')` in production code (explicit is better)

### Edge Functions (Deno)
- Edge Functions run on Supabase's Deno runtime, not Node.js
- Use `Deno.serve()` as the entry point
- Use `import from "npm:"` and `https://` URLs (Deno convention)
- Keep Edge Functions under 100 lines — they are API glue, not business logic repositories
- All Edge Functions validate input with Zod
- All Edge Functions log errors to Sentry via the SDK
- All Edge Functions return JSON responses with consistent shape:

```json
{ "success": true, "data": {} }
{ "success": false, "error": "message" }
```

### API Routes (Vercel)
- Used only for webhooks (Polar, Resend) and server-side operations that cannot run in Edge Functions
- All API routes validate input with Zod
- All webhook routes validate signatures before processing
- All API routes return JSON with the same consistent shape as Edge Functions
- Rate limit webhook endpoints: reject if more than 100 requests per minute from the same IP

### Error Handling
- In Server Components: throw errors to the nearest `error.tsx` boundary
- In Client Components: catch errors, show toast notification, log to Sentry
- In Edge Functions: catch errors, log to Sentry, return error JSON
- In API routes: catch errors, log to Sentry, return error JSON with appropriate HTTP status
- Never swallow errors silently. Never `catch (e) {}`. Every catch block either handles the error, logs it, or rethrows it
- Use custom error classes for domain-specific errors:
  - `RlsViolationError` — RLS policy blocked an operation
  - `PlanLimitError` — clinic exceeded their plan's staff/credential limit
  - `WebhookValidationError` — webhook signature validation failed

## Validation Strategy

- All form inputs validated with Zod schemas before Supabase insert/update
- All webhook payloads validated with Zod schemas before processing
- All Edge Function inputs validated with Zod schemas before execution
- Zod schemas live in `src/lib/validations/` and are imported by both frontend and backend
- Schema names: `<entity>FormSchema` (forms), `<entity>WebhookSchema` (webhooks)
- Validation errors are returned to the user as form field errors (react-hook-form integration)
- Never trust client-side validation alone — server-side validation is mandatory

## Authentication & Authorization

### Clerk
- Clerk handles all authentication: signup, signin, signout, password reset, OAuth
- User roles are stored in the `users` table, not in Clerk metadata (except `clinic_id` which is cached in Clerk `publicMetadata` for fast access)
- Roles: `owner` (full access), `manager` (view + edit staff/credentials), `viewer` (view only)
- Role enforcement: RLS policies check the user's role from the `users` table
- Invitations: owner enters email → Clerk sends invitation → invitee signs up → linked to `clinic_id` with specified role

### Route Protection
- `/dashboard/*` — requires authentication (Clerk middleware)
- `/api/webhooks/*` — public but signature-validated
- `/sign-in`, `/sign-up`, `/pricing`, `/` — public
- `/onboarding` — requires authentication but no clinic (redirects to dashboard if clinic exists)

### Plan Enforcement

Plan values: `trial`, `expired_trial`, `inactive`, `solo`, `practice`, `multi_location`

**14-DAY TRIAL (no card required):**
- On clinic creation: set `plan='trial'`, `trial_end_date = NOW() + 14 days`
- pg_cron job daily: any clinic where `plan='trial'` AND `trial_end_date < NOW()` → update to `'expired_trial'`
- Middleware: if `plan='expired_trial'`, redirect all `/dashboard/*` to `/pricing` with message "Your free trial has ended"
- Data preserved 30 days after trial expiry
- If user subscribes within 30 days: plan updates to paid tier, access restored
- After 30 days: pg_cron sets `plan='inactive'`. User sees reactivation page only.

**Plan limits and feature gating:**
- `solo`: email alerts, 5 staff, 50 credentials, 1 user, basic report
- `practice`: email alerts, 15 staff, 300 credentials, 3 users, audit-ready report, MD tracking
- `multi_location`: all features, 50 staff, 1000 credentials, 5 locations, 10 users, API, white-label

**Enforcement at THREE layers (all implemented Phase 4):**

Layer 1 — MIDDLEWARE (route-level):
- `plan='expired_trial'` → redirect to `/pricing`
- `plan='inactive'` → redirect to `/reactivate`
- `plan='solo'` → `/dashboard/settings/users` returns 403 (1 user only)

Layer 2 — SERVER COMPONENT (feature-level):
- Before rendering premium features: if plan doesn't include the feature, show upgrade banner instead
- Before rendering audit report: if `plan='solo'`, show basic report only

Layer 3 — DATABASE (data-level):
- Before inserting staff: count existing. If `>=` plan limit, reject with `PlanLimitError`
- Before inserting credentials: count existing. If `>=` plan limit, reject with `PlanLimitError`
- RLS does NOT enforce plan limits (RLS is for clinic isolation only)
- Implementation: `src/lib/utils/plan.ts` (limits), `src/lib/utils/errors.ts` (PlanLimitError), `src/lib/actions/staff.ts` and `credentials.ts` (count checks)

## Email Responsibilities

### Zoho Mail Handles (free, up to 5 users, 5GB/user)
- Business email: support@complyspa.com (manual — customer support), hello@complyspa.com (full mailbox, receives replies to automated emails)
- alerts@complyspa.com — free alias forwarding to hello@ (no user slot consumed)
- DMARC aggregate reports (rua=mailto:hello@complyspa.com)
- These are accessed via Zoho webmail — no SMTP/IMAP on free tier

### Clerk Handles (free, included in 10K MAU)
- Email verification (signup confirmation)
- Password reset emails
- Email change confirmation
- These are sent from Clerk's infrastructure — no Resend needed

### Resend Handles (free, 3,000 emails/month)
- Credential expiration alerts (90/60/30/7 days) — FROM: alerts@complyspa.com
- Escalation alerts (credential expired 7+ days) — FROM: alerts@complyspa.com
- Welcome email (after onboarding completes) — FROM: hello@complyspa.com
- Trial ending reminder (day 12 of 14-day trial) — FROM: hello@complyspa.com
- Trial expired notification (day 14) — FROM: hello@complyspa.com
- Subscription canceled confirmation — FROM: hello@complyspa.com
- These are sent from Edge Functions via the Resend API
- FROM addresses: alerts@ (alerts) and hello@ (essential) — both verified under complyspa.com

## Testing Philosophy

### What to Test
- Unit tests (Vitest, every commit): Zod schemas, status calculation, date utilities
- Integration tests (Vitest + local Supabase, every commit): CRUD operations, RLS enforcement, alert logging
- E2E tests (Playwright, before every release): Full onboarding flow, auth flows, billing (mock Polar), report generation, mobile viewport

### What NOT to Test Automated
- Email delivery (Resend) — tested manually, verified in Resend dashboard
- Polar webhook — tested manually with Polar sandbox
- pg_cron execution — tested manually via SQL function call

### Test File Location
- Unit tests: `tests/unit/<name>.test.ts`
- Integration tests: `tests/integration/<name>.test.ts`
- E2E tests: `tests/e2e/<name>.spec.ts`

### Test Data
- Use factory functions to create test data, not hardcoded fixtures
- Test data uses realistic but fake names and license numbers
- Never use real customer data in tests

## Git Workflow

### Branch Strategy
- `main` — production branch. Protected. Requires PR + CI pass.
- `feature/<name>` — feature branches. Created from main, merged via PR.
- `fix/<name>` — bug fix branches.
- Solo developer: still use PRs — they force a code review step (self-review) and keep commit history clean

### Commit Conventions
- Use conventional commits:
  - `feat: add staff credential CRUD`
  - `fix: correct alert delivery status logging`
  - `refactor: extract PDF template to separate component`
  - `test: add RLS isolation tests`
  - `chore: update dependencies`
- Commit messages are imperative mood: "add" not "added"
- One logical change per commit. If a commit does two things, split it.
- Never commit: `.env*.local`, `supabase/functions/.env`, API keys, secrets, database dumps

### PR Self-Review Checklist
Before merging any PR:
1. All tests pass (`npm run test:unit`, `npm run test:integration`)
2. TypeScript compiles without errors (`npx tsc --noEmit`)
3. No `console.log` in production code
4. No `any` types introduced
5. No secrets in committed code
6. RLS policies cover any new tables
7. Zod schemas cover any new inputs
8. Error states, loading states, empty states implemented for new UI
9. Mobile responsive at 375px
10. No new dependencies added without justification

> The PR Self-Review Checklist above is the operational review surface. Domain-specific standards (security, types, RLS, Zod, error handling, states) are covered in their respective sections above — do not re-list them here.

## Dependency Management

- Every new dependency must be justified — "what does this do that I cannot do with existing tools?"
- Avoid dependencies for things that are trivial in TypeScript (date formatting, string manipulation)
- Preferred dependencies are already in the stack: Clerk, Supabase, Resend, Polar, Sentry
- Run `npm audit` weekly. Fix high-severity vulnerabilities within 48 hours.
- Dependabot enabled for automated vulnerability alerts
- Lockfile (`package-lock.json`) is committed for reproducible builds
- Never install a dependency without checking its license (must be MIT, Apache 2.0, or BSD)

## Performance Expectations

- Dashboard page load: under 2 seconds on 4G mobile connection
- Supabase queries: under 500ms for any dashboard query (use indexes on frequently queried columns)
- Edge Function execution: under 5 seconds (Resend API call)
- PDF generation: under 3 seconds for a 20-staff clinic (client-side, browser-dependent)
- No N+1 queries — use Supabase's nested select syntax (`select('*, credentials()')`)
- Images are not optimized by Vercel (no `Image` component for uploaded documents — they are served from Supabase Storage)
- Lazy-load heavy client-side libraries (`react-pdf`) — only load when the reports page is visited

## Logging & Monitoring

- **Sentry:** all application errors (frontend + Edge Functions). Free tier: 5,000 errors/month.
- **Vercel Analytics:** page load performance and traffic. Free.
- **Supabase Dashboard:** database health, Edge Function logs, storage usage. Check weekly.
- **Resend Dashboard:** email delivery logs, bounce rate. Check weekly.
- **Zoho Mail:** business email (support@, hello@). Check weekly for customer inquiries.
- **Cloudflare Dashboard:** DNS health, security events, analytics. Check weekly.
- **Polar Dashboard:** subscription status, failed payments.
- No `console.log` in production code. Use `Sentry.captureException()` for errors, `Sentry.captureMessage()` for info.
- In development, `console.log` is acceptable for debugging but must be removed before commit.

## Environment Variables

All environment variables are defined in `.env.local` (gitignored). The template is `.env.local.example`.

```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
RESEND_API_KEY=
RESEND_WEBHOOK_SECRET=
FROM_EMAIL_ALERTS=ComplySpa Alerts <alerts@complyspa.com>
FROM_EMAIL_ESSENTIAL=ComplySpa <hello@complyspa.com>
POLAR_ACCESS_TOKEN=
POLAR_WEBHOOK_SECRET=
SENTRY_DSN=
NEXT_PUBLIC_APP_URL=https://complyspa.com
CRON_SECRET=
```

Rules:
- `NEXT_PUBLIC_*` variables are exposed to the browser. Never put secrets in these.
- `SUPABASE_SERVICE_ROLE_KEY` — ONLY imported in Edge Functions and server-only utilities. NEVER in Client Components.
- `CLERK_SECRET_KEY` — ONLY in server-side code. NEVER in `'use client'` files.
- All variables must have production values set in Vercel and Supabase before deployment.

## Development Workflow

### Local Setup

```bash
supabase start          # Start local Postgres + Auth + Storage + Edge Functions
npm run dev             # Start Next.js on localhost:3000
supabase functions serve # Start Edge Functions on localhost:8000
```

### Before Starting Work
1. `git pull` — ensure you are on the latest main
2. `supabase start` — ensure local database is running
3. `npm run dev` — ensure frontend is running
4. Review the task you are about to implement. Understand which files are affected. Check for existing patterns that solve the same problem.

### During Implementation
1. Write the database migration first (if new tables/columns are needed)
2. Run `supabase migration up` to apply locally
3. Write the Zod validation schema
4. Write the Supabase query/mutation
5. Write the UI component
6. Write the unit test
7. Test locally in the browser
8. Commit with a conventional commit message

### Before Committing
1. `npm run lint` — no linting errors
2. `npm run test:unit` — all unit tests pass
3. `npx tsc --noEmit` — no type errors
4. Self-review against the PR checklist (see Git Workflow section)

### When Stuck
1. Read the existing codebase for patterns — the answer is usually already there
2. Check the Supabase docs (via Context7) for Supabase-specific questions
3. Check the Clerk docs (via Context7) for auth-specific questions
4. Check the Next.js App Router docs (via Context7) for routing questions
5. Do not guess. If unsure, ask in the Claude Code session and explain the trade-offs.

## Refactoring Principles

- Refactor when: code duplication appears 3+ times, a function exceeds 50 lines, a component exceeds 200 lines, a file has more than 5 imports from unrelated modules
- Do NOT refactor when: the code works, tests pass, and there is no new feature requiring the change — "if it ain't broke, don't fix it"
- Refactoring commits are separate from feature commits — never mix a refactor with a feature change
- After refactoring, run all tests. If any test breaks, the refactor changed behavior — revert and reconsider.
- Never refactor during a bug fix. Fix the bug first, refactor later.

## Claude Code Behavior Guidelines

### Before Implementing Any Change
1. Read the relevant existing files to understand current patterns
2. Check if a similar feature already exists that can be extended
3. Identify all files that will be affected by the change
4. Consider edge cases: empty data, expired data, concurrent edits, unauthorized access
5. Consider security: does this change touch RLS, auth, webhooks, or file uploads?
6. Consider performance: will this query be slow at 300 customers? Does it need an index?
7. Plan the implementation in logical steps (database → validation → backend → frontend → test)
8. **Surface assumptions explicitly.** If a request is ambiguous, do not silently pick one interpretation and proceed — state the assumption and ask for clarification (Karpathy: "Think Before Coding").
9. If the change is significant (new feature, new table, new API), explain the plan before implementing

### During Implementation
1. Follow the conventions in this document exactly
2. Use existing UI components — do not create new buttons, tables, or inputs if generic ones exist
3. Write Zod schemas before writing the form or API handler
4. Write database queries with explicit column selection — never `select('*')`
5. Add error handling at every boundary (API call, database query, form submission)
6. Add loading states for all async operations
7. Add empty states for all list/table views
8. **Make surgical edits.** Only change the lines that fix the issue. No drive-by reformatting, quote-style changes, or type-hint additions while fixing a bug — those go in a separate refactor commit (Karpathy: "Surgical Changes").
9. **Prefer goal-driven tasks.** Reframe "fix the bug" as "write a test that reproduces it → make it pass → confirm no regressions" so work is verifiable, not open-ended (Karpathy: "Goal-Driven Execution").
10. Test in the browser after each logical step — do not write 500 lines and then test

## Production Deployment Checklist

Code-quality pre-checks (tests, tsc, lint, types, secrets, RLS, Zod, states, mobile, a11y) are covered by the PR Self-Review Checklist and are not repeated here.

- [ ] All env vars set in Vercel via MCP (read from env-production.txt)
- [ ] All env vars set in Supabase Edge Functions secrets via CLI
- [ ] Database migrations applied to production Supabase via CLI
- [ ] Edge Functions deployed to production Supabase (`send-credential-alert`)
- [ ] pg_cron enabled, 5 jobs verified (no daily-audit-overdue-check — Feature 4 removed)
- [ ] Code pushed to GitHub + repo verified (private, branch protection, secret scanning)
- [ ] ALL DNS records in Cloudflare via MCP: Vercel (A+CNAME) + Zoho (MX+SPF+DKIM) + Resend (DKIM+SPF) + DMARC
- [ ] Cloudflare optimized via MCP: DNSSEC, SSL Full (strict), HSTS, Always HTTPS, Security Medium, Bot Fight ON
- [ ] Vercel project created via MCP, domain added, primary set, SSL provisioned, deployed
- [ ] Clerk JWT template + Instance URL + redirect URLs configured via Clerk MCP
- [ ] Supabase third-party auth: Clerk → Supabase (manual — no API)
- [ ] Zoho Mail: domain verified, support@ + hello@ created, alerts@ alias → hello@
- [ ] Resend: domain added via MCP, DKIM in Cloudflare, domain verified, webhook set, hello@ added
- [ ] FROM_EMAIL_ALERTS and FROM_EMAIL_ESSENTIAL set in Vercel env vars
- [ ] All DNS verified: nslookup checks pass for MX, SPF, DKIM, DMARC
- [ ] All curl checks return 200 on complyspa.com
- [ ] Founder confirms sign-up → onboarding → dashboard works

## Deployment

Deployment is fully automated via MCP. See `C:\Users\PMLS\Desktop\Prompts\PHASE_7.8_PROMPT.md` for the complete step-by-step deployment procedure. The domain complyspa.com is purchased on Cloudflare Registrar. Deploy directly to the domain — no vercel.app staging.

### Complete Cloudflare DNS Table — complyspa.com

All records: **proxied = false (DNS only / gray cloud)**. Proxy breaks email DNS and Clerk auth.

```
SECTION A — VERCEL HOSTING
Type    Name    Value                       Proxied
A       @       76.76.21.21                false
CNAME   www     cname.vercel-dns.com       false

SECTION B — ZOHO MAIL (MX + SPF)
Type    Name    Value                                          Priority  Proxied
MX      @       mx.zoho.com                                   10        false
MX      @       mx2.zoho.com                                  20        false
MX      @       mx3.zoho.com                                  50        false
TXT     @       "v=spf1 include:zoho.com include:amazonses.com ~all"  —   false

SECTION C — ZOHO MAIL (DKIM — generated in Zoho Admin Console)
Type    Name            Value                    Proxied
TXT     (from Zoho)     (from Zoho — DKIM key)   false

SECTION D — RESEND (DKIM — 3 CNAME records, from Resend MCP)
Type    Name                          Value                       Proxied
CNAME   (from Resend)._domainkey      (from Resend).dkim.amazonses.com  false
CNAME   (from Resend)._domainkey      (from Resend).dkim.amazonses.com  false
CNAME   (from Resend)._domainkey      (from Resend).dkim.amazonses.com  false

SECTION E — RESEND (SPF)
Type    Name    Value                                     Priority  Proxied
MX      send    feedback-smtp.us-east-1.amazonses.com     10        false
TXT     send    "v=spf1 include:amazonses.com ~all"       —         false

SECTION F — DMARC (covers all email — Zoho + Resend)
Type    Name     Value                                                    Proxied
TXT     _dmarc   "v=DMARC1; p=none; rua=mailto:hello@complyspa.com"      false
```

### Cloudflare Proxy Warning

Do NOT enable Cloudflare proxy (orange cloud) on any DNS records. Cloudflare proxy interferes with:
- Clerk authentication (JWT cookies may not pass through)
- Vercel edge functions (double-proxying)
- Resend email DNS (MX/TXT must not be proxied)

If you want Cloudflare DDoS/WAF later: test on a staging subdomain first, research "Cloudflare with Clerk" and "Cloudflare with Vercel", add Clerk IP ranges to Cloudflare allowlist, monitor auth for 48 hours before enabling on primary domain.

## Architecture Decision Records

When a significant architectural decision is made, document it briefly in the commit message or PR description using this format:

```
Decision: [what was decided]
Context: [why this decision was needed]
Alternatives: [what else was considered and why it was rejected]
Consequences: [what trade-offs this introduces]
```

This creates a searchable history of architectural decisions without maintaining a separate ADR document.

## Domain Knowledge

### Med Spa Compliance Context
- This product tracks professional credentials (license numbers, expiration dates), NOT patient health records (PHI)
- The #1 industry risk is "staff performing services outside their license" (confirmed across HCP, NYC Council Report, MedSpa Standards, Reddit, AmSpa)
- State medical board inspections are complaint-driven, not routine — most med spas are never inspected
- The product stores professional credential data, not medical records — this is why we do not need a HIPAA BAA for Vercel or Supabase on day one
- Pre-loaded credential types are US-specific. The product supports custom types for international use

### Key Competitors
- HCP: $3,000/year, general healthcare compliance, not med-spa-specific
- ExpirationReminder: $49-$349/month, generic credential tracking
- MedSpa Standards: $197 one-time SOP templates (not software)
- AmSpa: 15,000+ members, sells SOPs and education (not software)
- Booking software (Zenoti, Mangomint, Boulevard, Vagaro): handles scheduling, NOT compliance tracking

### Why This Product Exists
- No med-spa-specific compliance tracking SaaS exists (confirmed via 3 competitor sweeps)
- Med spa owners track compliance manually ("winging it", "post-it notes", "excel spreadsheets")
- The #1 board citation is expired credentials and undocumented staff licensing — spreadsheet tracking fails silently

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

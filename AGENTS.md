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

**Tool selection rule:** Context7 for library/framework docs, Exa for general web search, Ponytail to keep code minimal, Impeccable for UI design/quality, Psychological Copywriting for public-facing copy. No overlap — pick the one matching the task.

## Project Overview

ComplySpa is a vertical SaaS product for medical spas globally, launching in the US market. It tracks staff credentials, sends automated expiration alerts, generates audit-ready compliance reports, and runs an inspection-readiness & mock-audit engine.

**Stack:** Next.js 14+ (App Router) · TypeScript · Tailwind CSS · shadcn/ui (component library) · Framer Motion (micro-interactions + page transitions) · React Three Fiber + Three.js (landing page hero 3D only) · Supabase (PostgreSQL, Edge Functions, Storage, pg_cron) · Clerk (Auth) · Vercel (Hosting) · Resend (Email) · Twilio (SMS) · Polar.sh (Payments) · Sentry (Errors)

**Architecture:** Two services only — Vercel (frontend) + Supabase (database, auth fallback, storage, crons, edge functions). No separate backend server. No Railway. No microservices. No message queues.

**Constraints:** Solo founder. Bootstrapped. Free-tier infrastructure until revenue justifies upgrades. No US LLC, no Stripe — Polar.sh is Merchant of Record. Product name "ComplySpa" is a placeholder — do not hardcode it in code, configs, or domain registrations.

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
        /audit/page.tsx           # Inspection-readiness & mock-audit engine
        /settings                 # Clinic settings, billing, users
        layout.tsx                # Dashboard layout with auth guard
        page.tsx                  # Main dashboard
      /api
        /polar/webhook/route.ts   # Polar billing webhook
        /resend/webhook/route.ts  # Email delivery status webhook
        /twilio/webhook/route.ts  # SMS delivery status webhook
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
      /audit/                     # audit-checklist, readiness-score, gap-tracker, readiness-report
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
        templates.tsx             # Email templates (alert, quarterly audit reminder)
        send.ts                   # Resend API wrapper
      /sms/
        send.ts                   # Twilio API wrapper
      /pdf/
        report-template.tsx       # react-pdf template for audit report
      /polar/
        client.ts                 # Polar SDK wrapper
        webhook.ts                # Webhook signature validation + event handler
      /audit/
        checklist.ts              # 7 first-look checklist definitions
        readiness.ts              # Readiness score + auto-fill logic from F1/F2
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
      send-audit-reminder/
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
- `/onboarding` — 5-step wizard: create clinic → add staff → enter credentials → set initial audit checklist → first win (surface expired credentials + run first readiness scan)

**Dashboard Pages (the product — built across Phases 2-8)**
- `/dashboard` — Main overview: status counts, expiring credentials, recent alerts, readiness score badge
- `/dashboard/staff` — Staff list table with status badges, add/edit/delete
- `/dashboard/staff/[id]` — Single staff profile with all credentials
- `/dashboard/staff/[id]/credentials` — Credential list for one staff member, add/edit/delete
- `/dashboard/credentials` — All credentials across all staff, filterable by type/status/staff
- `/dashboard/reports` — Generate audit-ready compliance report, download/email, report history
- `/dashboard/audit` — Inspection-readiness checklist, readiness score, gap remediation tracker, readiness report generation, audit history
- `/dashboard/settings` — Clinic profile, alert recipients, custom credential types, audit reminders
- `/dashboard/settings/billing` — Current plan, manage subscription via Polar portal
- `/dashboard/settings/users` — Invite manager/viewer, manage roles

Total: 15 pages (2 public, 2 auth, 1 onboarding, 10 dashboard). `/dashboard/audit` is Feature 4 (Inspection-Readiness & Mock-Audit Engine); `/dashboard/settings/billing` and `/dashboard/settings/users` are distinct pages under `/dashboard/settings`.

## Naming Conventions

| Element             | Convention           | Example                |
|---------------------|----------------------|------------------------|
| Files (components)  | PascalCase           | StaffForm.tsx          |
| Files (utilities)   | camelCase            | dateUtils.ts           |
| Files (pages)       | Next.js convention   | page.tsx, layout.tsx   |
| Directories         | lowercase-hyphenated | audit/                 |
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
- Seed data (credential types, audit checklist defaults) goes in the initial migration

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
- `clinic.trial_end_date`: `TIMESTAMPTZ`, set to `NOW() + 14 days` on clinic creation
- pg_cron job `daily-trial-expiry-check`: updates `plan` from `'trial'` to `'expired_trial'` when `trial_end_date < NOW()`
- pg_cron job `daily-inactive-cleanup`: updates `plan` from `'expired_trial'` to `'inactive'` when `trial_end_date < NOW() - 30 days`
- Polar webhook `subscription.active`: updates `plan` to paid tier (`solo`/`practice`/`multi_location`)
- Polar webhook `subscription.canceled`: updates `plan` to `'inactive'`
- Data is never deleted due to plan status — only access is gated

### Audit Engine Tables

```
AUDIT_RUNS
  id UUID PRIMARY KEY DEFAULT gen_random_uuid()
  clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE
  run_type TEXT CHECK (run_type IN ('quarterly', 'on_demand')) NOT NULL
  status TEXT CHECK (status IN ('in_progress', 'completed')) DEFAULT 'in_progress'
  readiness_score INTEGER CHECK (readiness_score >= 0 AND readiness_score <= 100)
  started_at TIMESTAMPTZ DEFAULT NOW()
  completed_at TIMESTAMPTZ
  created_by_user_id UUID REFERENCES users(id)
  created_at TIMESTAMPTZ DEFAULT NOW()

AUDIT_FINDINGS
  id UUID PRIMARY KEY DEFAULT gen_random_uuid()
  audit_run_id UUID REFERENCES audit_runs(id) ON DELETE CASCADE
  checklist_item TEXT NOT NULL
  status TEXT CHECK (status IN ('pass', 'fail', 'stale', 'manual_attest')) NOT NULL
  auto_filled BOOLEAN DEFAULT FALSE
  notes TEXT
  remediation_due_date TIMESTAMPTZ
  remediation_status TEXT CHECK (remediation_status IN ('open', 'in_progress', 'closed'))
  remediation_closed_at TIMESTAMPTZ
  created_at TIMESTAMPTZ DEFAULT NOW()
  updated_at TIMESTAMPTZ DEFAULT NOW()
```

RLS: both tables enforce `clinic_id`-based access.

pg_cron job `daily-audit-overdue-check`:
- Finds `practice`/`multi_location` clinics where last audit `completed_at < NOW() - 90 days`
- Triggers `send-audit-reminder` Edge Function
- Dashboard shows banner: "Audit overdue — last completed X days ago"

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
- Color tokens are defined in `tailwind.config.ts` and are non-negotiable. The palette is the output of an evidence-backed color audit (`complyspa-color-palette-report.md` on the Desktop, 14 sources). Do not introduce new tokens, revert to cold Tailwind defaults, or pick ad-hoc brand colors — each such change breaks trust signaling, WCAG accessibility, and brand identity simultaneously. Full source rationale: med-spa luxury convention + healthcare color psych + premium-SaaS craft + WCAG research.

#### Foundation — two brand colors only
- `--color-ink` = `#0F2A43` — Deep Spruce Navy. Hero backgrounds, primary text on light surfaces, dark pill buttons, footer, structural chrome. The single brand spine; never pair it with a second dark hue.
- `--color-action` = `#0F766E` — Authority Teal (`teal-700`). The ONLY filled-button / link / focus-ring / active-nav color. Not indigo, not violet, not Vercel-cobalt — teal was chosen to differentiate from the Stripe / Linear / Vercel / Jasper / Fellow indigo monoculture and to signal healthcare vertical without reverting to the med-spa pink cliché.

#### Warm-tinted neutrals (NOT cold slate / zinc)
- `--color-canvas` = `#FAF8F5` (warm bone) — page background
- `--color-surface` = `#FFFFFF` — elevated cards, dashboard panels, product screenshot frames
- `--color-hairline` = `#E5E1D8` — borders, dividers, input outlines. NEVER cold `#E5E7EB` (the Vercel / Lynchpin hairline); that reads as developer dashboard, not med-spa premium.
- `--color-text` = `#1A2421` — warm charcoal primary text. Never pure `#000`.
- `--color-text-muted` = `#5B6F6A` — sage-slate secondary text / metadata / helper copy
- `--color-input-border` = `#3D4A47` — focused input border
- `--color-cream-alt` = `#F2EDE4` — alternating section banding surface

#### Semantic status tier — WCAG AA, ALWAYS paired with icon + visible text label
Status colors are RESERVED for compliance state — the brand teal never borrows them. Pure yellow (`#FACC15` / `#F0E442`) is FORBIDDEN as a status background (fails WCAG at ~1.3:1 on white — "essentially invisible"). Amber-600 is mandatory for warning. Every status pill ships as `tint background + dark foreground text + icon + visible label` so the ~8% of male users with red-green color-vision deficiency can still read state (WCAG 1.4.1: Use of Color). Never color alone — the accessibility section already requires this for text; here it is anchored to specific tokens.

| Status | Strong | Tint Bg | Text on tint | Icon | Label |
|---|---|---|---|---|---|
| Valid / Active | `#16A34A` (`green-600`) | `#DCFCE7` (`green-100`) | `#15803D` (`green-700`) | ✓ check | "Valid" |
| Expiring / Warning | `#D97706` (`amber-600`) | `#FEF3C7` (`amber-100`) | `#92400E` (`amber-800`) | ▲ triangle | "Expiring" |
| Expired / Critical | `#DC2626` (`red-600`) | `#FEE2E2` (`red-100`) | `#991B1B` (`red-800`) | ✕ X | "Expired" |
| Unknown / Not tracked | `#6B7280` (`gray-500`) | `#F3F4F6` (`gray-100`) | `#374151` (`gray-700`) | — dash | "Unknown" |

The Tailwind defaults `green-500` / `yellow-500` / `red-500` are NOT used for status — they file contrast and perceptual-weight requirements.

#### Data visualization (audit-report charts, dashboard KPIs)
Brand-teal anchors the first series so charts read as ComplySpa, not a generic charting library. Never use red + green as the first two slots — that pairing is the most-cited color-blindness failure (WCAG 1.4.1, Okabe-Ito research). Prefer direct data labels over a legend; apply tabular figures (`font-feature-settings: "tnum"`) to every numeric cell.

| Slot | Hex | Use |
|---|---|---|
| 1 | `#0F766E` (brand teal) | Default series |
| 2 | `#EA580C` (`orange-600`) | High contrast with teal; CVD-safe pair |
| 3 | `#7C3AED` (`violet-600`) | Distinguishable from blue and red under deuteranopia |
| 4 | `#DB2777` (`pink-600`) | Distinct under all CVD conditions |
| 5 | `#2563EB` (`blue-600`) | "In progress / processing" convention |
| 6 | `#6B7280` (`gray-500`) | "Other" / low-priority bucket |

#### Dark theme — tokens DEFINED, UI toggle is POST-MVP
Dark-mode toggle is OUT of MVP scope — do not add `dark:` classes to UI surfaces. The tokens below ARE defined in `tailwind.config.ts` as a deferred design system, ready to ship when dark mode is prioritized. This preserves WCAG perceptual weight on near-black backgrounds (status mid-tones shift lighter and more saturated than their light-theme counterparts).

- Dark surface: `#0A1A24` (deeper navy ink)
- Text on dark: `#E6E9E5` (green-tinted off-white)
- Action on dark: `#14B8A6` (`teal-500` — brighter than `teal-700` for perceptual weight)
- Status-on-dark shifts to the `-400` variants:
  - Active `#4ADE80` · Warning `#FBBF24` · Critical `#F87171` · Unknown `#9CA3AF`
- Hairline on dark: `rgba(255,255,255,0.08)`

#### Responsive
- Mobile-first. Test at 375px (mobile), 768px (tablet), 1280px (desktop)

### Component Library
- Use shadcn/ui for all UI components (Button, Table, Badge, Dialog, Input, Select, Toast, Dropdown, Tabs, Card, Skeleton)
- Install: `npx shadcn@latest init`
- shadcn/ui components are copied into the project (not imported from a package) — they live in `src/components/ui/`
- Customize shadcn/ui components to match the product's design language (green/amber/red status system — see the Styling section for exact tokens, Inter font, generous whitespace, subtle shadows). Do not configure shadcn to use `yellow` for warning — amber is mandatory (pure yellow fails WCAG contrast on white)
- Do not install shadcn/ui components that are not needed — install only what each feature requires
- All UI must look enterprise-grade: clean typography, consistent spacing, professional color palette, no generic or amateur styling
- Use `lucide-react` for all icons (included with shadcn/ui)

### Animation & 3D Graphics

#### Framer Motion — used EVERYWHERE in the product
- Install: `npm install framer-motion`
- Use for: page transitions, list item enter/exit animations, card hover effects, loading skeletons, toast notifications, sidebar slide-in on mobile, dialog open/close, tab transitions, badge state changes (green→yellow→red), readiness score animation
- Keep animations subtle and fast: 200-400ms duration, ease-out easing
- Never block user interaction — animations are decorative, not functional
- Use `AnimatePresence` for route transitions in the dashboard layout
- Use `motion.div` for staggered list item entrance (staff table, credential list, audit checklist)
- Respect `prefers-reduced-motion`: wrap motion components in a check and disable animation for users who request it
- Every animation must have a purpose: feedback (button click), orientation (page transition), or visual hierarchy (staggered list). No decorative-only animation in the dashboard.

#### React Three Fiber + Three.js — LANDING PAGE ONLY
- Install: `npm install three @react-three/fiber @react-three/drei`
- Use for: landing page (`/`) hero section 3D background ONLY. Animated gradient mesh, particle field, or subtle 3D geometry that signals premium quality.
- DO NOT use Three.js or React Three Fiber in the dashboard, settings, reports, or audit pages. The dashboard is a productivity tool — 3D effects slow down page load and distract from data.
- Auth pages (`/sign-in`, `/sign-up`): subtle Framer Motion entrance animations only. No Three.js. Auth pages must load in under 1 second.
- The 3D hero must lazy-load: use `next/dynamic` with `ssr: false` to prevent server-side rendering of Three.js. Show a static fallback (gradient background) while loading.
- Keep the 3D scene lightweight: maximum 50MB bundle for Three.js + Drei. Use simple geometry, not complex models.
- The 3D scene must respect `prefers-reduced-motion`: render a static gradient instead of animated 3D.
- Performance budget: landing page must score >90 on Lighthouse despite the 3D hero. If it does not, simplify the scene.
- Color palette for 3D: use the brand tokens from the Styling section (--color-ink #0F2A43 for background, --color-action #0F766E for accent). Never use generic Three.js colors.

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
- Three.js 3D hero background ONLY — simple geometric composition (interlocking
  tetrahedra, compliance grid, or medical-precision lattice) in brand colors
  (#0F2A43 navy depth, #0F766E teal accents). Subtle rotation (0.002 rad/frame
  max). Not particles. Not orbiting spheres. Not glowing orbs.
- Three.js lazy-loaded via `next/dynamic` with `ssr: false`. Static gradient
  fallback (#0F2A43 → #FAF8F5) while loading.
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
- Three plan cards: Solo ($29/mo), Practice ($79/mo), Multi-Location ($149/mo).
- "Practice" card has subtle teal border highlight + "Most popular" badge.
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
- Colors: `#0F2A43` (navy depth), `#0F766E` (teal accent), `#FAF8F5` (bone
  — no 3D element in this color, it's the page background that the 3D fades to).

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
  and quarterly audit nudges must match the product's voice — direct, helpful,
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
- Used only for webhooks (Polar, Resend, Twilio) and server-side operations that cannot run in Edge Functions
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
- `solo`: email alerts only (no SMS), 5 staff, 50 credentials, 1 user, basic report, no audit engine
- `practice`: email + SMS, 15 staff, 300 credentials, 3 users, audit-ready report, MD tracking, inspection-readiness & mock-audit engine
- `multi_location`: all features, 50 staff, 1000 credentials, 5 locations, 10 users, API, white-label, audit engine per location

**Enforcement at THREE layers:**

Layer 1 — MIDDLEWARE (route-level):
- `plan='expired_trial'` → redirect to `/pricing`
- `plan='inactive'` → redirect to `/reactivate`
- `plan='solo'` → `/dashboard/audit` returns 403 (audit engine is Practice+ only)
- `plan='solo'` → `/dashboard/settings/users` returns 403 (1 user only)

Layer 2 — SERVER COMPONENT (feature-level):
- Before rendering SMS settings: if `plan='solo'`, show upgrade banner instead
- Before rendering audit report: if `plan='solo'`, show basic report only
- Before rendering audit engine: if `plan='solo'`, show upgrade CTA card

Layer 3 — DATABASE (data-level):
- Before inserting staff: count existing. If `>=` plan limit, reject with `PlanLimitError`
- Before inserting credentials: count existing. If `>=` plan limit, reject with `PlanLimitError`
- RLS does NOT enforce plan limits (RLS is for clinic isolation only)

## Email Responsibilities

### Clerk Handles (free, included in 10K MAU)
- Email verification (signup confirmation)
- Password reset emails
- Email change confirmation
- These are sent from Clerk's infrastructure — no Resend needed

### Resend Handles (free, 3,000 emails/month)
- Credential expiration alerts (90/60/30/7 days)
- Escalation alerts (credential expired 7+ days)
- Welcome email (after onboarding completes)
- Trial ending reminder (day 12 of 14-day trial)
- Trial expired notification (day 14)
- Subscription canceled confirmation
- Quarterly audit reminder email (when audit is overdue >90 days)
- These are sent from Edge Functions via the Resend API

## Testing Philosophy

### What to Test
- Unit tests (Vitest, every commit): Zod schemas, status calculation, readiness score + auto-fill logic, date utilities
- Integration tests (Vitest + local Supabase, every commit): CRUD operations, RLS enforcement, alert logging
- E2E tests (Playwright, before every release): Full onboarding flow, auth flows, billing (mock Polar), audit engine flow (run readiness scan, generate readiness report, remediation tracking), report generation, mobile viewport

### What NOT to Test Automated
- Email delivery (Resend) — tested manually, verified in Resend dashboard
- SMS delivery (Twilio) — tested manually, verified in Twilio console
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
- Preferred dependencies are already in the stack: Clerk, Supabase, Resend, Twilio, Polar, Sentry
- Run `npm audit` weekly. Fix high-severity vulnerabilities within 48 hours.
- Dependabot enabled for automated vulnerability alerts
- Lockfile (`package-lock.json`) is committed for reproducible builds
- Never install a dependency without checking its license (must be MIT, Apache 2.0, or BSD)

## Performance Expectations

- Dashboard page load: under 2 seconds on 4G mobile connection
- Supabase queries: under 500ms for any dashboard query (use indexes on frequently queried columns)
- Edge Function execution: under 5 seconds (Resend + Twilio API calls)
- PDF generation: under 3 seconds for a 20-staff clinic (client-side, browser-dependent)
- No N+1 queries — use Supabase's nested select syntax (`select('*, credentials()')`)
- Images are not optimized by Vercel (no `Image` component for uploaded documents — they are served from Supabase Storage)
- Lazy-load heavy client-side libraries (`react-pdf`) — only load when the reports page is visited

## Logging & Monitoring

- **Sentry:** all application errors (frontend + Edge Functions). Free tier: 5,000 errors/month.
- **Vercel Analytics:** page load performance and traffic. Free.
- **Supabase Dashboard:** database health, Edge Function logs, storage usage. Check weekly.
- **Resend Dashboard:** email delivery logs, bounce rate. Check weekly.
- **Twilio Console:** SMS delivery logs. Check weekly.
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
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=
POLAR_ACCESS_TOKEN=
POLAR_WEBHOOK_SECRET=
SENTRY_DSN=
NEXT_PUBLIC_APP_URL=
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

Provisioning items only — code-quality pre-checks (tests, tsc, lint, types, secrets, RLS, Zod, states, mobile, a11y) are covered by the PR Self-Review Checklist and are not repeated here.

- [ ] Environment variables set in Vercel production
- [ ] Environment variables set in Supabase production
- [ ] Database migrations applied to production Supabase
- [ ] Edge Functions deployed to production Supabase
- [ ] pg_cron jobs created in production Supabase
- [ ] Polar webhook URL points to production domain
- [ ] Resend sending domain verified (DKIM, SPF, DMARC)
- [ ] Twilio webhook URL points to production domain
- [ ] Clerk production URLs configured
- [ ] Clerk third-party auth configured in Supabase Dashboard: Authentication → Third-Party Auth → Clerk → paste domain (`moving-sheepdog-44.clerk.accounts.dev`)
- [ ] DNS configured (A record + CNAME to Vercel)

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
- Inspection-readiness & mock-audit engine is the fourth compliance feature. It mirrors the 7 documents state board inspectors ask for first, auto-fills from credential data (F1/F2), and produces a readiness report (reuses F3 infrastructure). The recommended best practice per MedSpa Standards, Weitz Morgan, and DocuHealth is recurring self-audits against the inspector's checklist.

### Key Competitors
- HCP: $3,000/year, general healthcare compliance, not med-spa-specific
- ExpirationReminder: $49-$349/month, generic credential tracking
- MedSpa Standards: $197 one-time SOP templates (not software)
- AmSpa: 15,000+ members, sells SOPs and education (not software)
- Booking software (Zenoti, Mangomint, Boulevard, Vagaro): handles scheduling, NOT compliance tracking or inspection-readiness

### Why This Product Exists
- No med-spa-specific compliance tracking SaaS exists (confirmed via 3 competitor sweeps)
- Med spa owners track compliance manually ("winging it", "post-it notes", "excel spreadsheets")
- The #1 board citation is the "ghost medical director" — agreement on paper with no evidence of active oversight; the recommended defense (MedSpa Standards, Weitz Morgan, DocuHealth) is recurring self-audits against the inspector's 7 first-look documents, which no incumbent automates

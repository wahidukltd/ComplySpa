# Graph Report - complyspa  (2026-07-22)

## Corpus Check
- 178 files · ~86,522 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 700 nodes · 1283 edges · 73 communities (42 shown, 31 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `70600bbd`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- onboarding.ts
- button.tsx
- app/page.tsx
- staff-form.tsx
- devDependencies
- alert-list.tsx
- helpers.ts
- compilerOptions
- components.json
- send-credential-alert/index.ts
- skeleton.tsx
- send.ts
- createClient
- dashboard-shell.tsx
- types/index.ts
- dependencies
- proxy.ts
- templates.tsx
- MockIntersectionObserver
- app/layout.tsx
- next.config.ts
- @clerk/nextjs
- clsx
- eslint.config.mjs
- @hookform/resolvers
- lucide-react
- next
- @polar-sh/sdk
- react
- react-dom
- react-hook-form
- @react-pdf/renderer
- @react-three/drei
- @react-three/fiber
- resend
- shadcn
- sonner
- @supabase/ssr
- @supabase/supabase-js
- svix
- tailwind-merge
- three
- tw-animate-css
- zod
- postcss.config.mjs
- tailwind.config.ts
- AGENTS.md
- Frontend Conventions
- Database Conventions

## God Nodes (most connected - your core abstractions)
1. `cn()` - 77 edges
2. `createClient()` - 61 edges
3. `compilerOptions` - 18 edges
4. `buttonVariants` - 16 edges
5. `Button()` - 16 edges
6. `PageHeader()` - 11 edges
7. `Input()` - 11 edges
8. `Label()` - 11 edges
9. `Skeleton()` - 11 edges
10. `getAuth()` - 11 edges

## Surprising Connections (you probably didn't know these)
- `SelectGroup()` --calls--> `cn()`  [EXTRACTED]
  src/components/ui/select.tsx → src/lib/utils/cn.ts
- `SelectLabel()` --calls--> `cn()`  [EXTRACTED]
  src/components/ui/select.tsx → src/lib/utils/cn.ts
- `SelectSeparator()` --calls--> `cn()`  [EXTRACTED]
  src/components/ui/select.tsx → src/lib/utils/cn.ts
- `SelectScrollUpButton()` --calls--> `cn()`  [EXTRACTED]
  src/components/ui/select.tsx → src/lib/utils/cn.ts
- `SelectScrollDownButton()` --calls--> `cn()`  [EXTRACTED]
  src/components/ui/select.tsx → src/lib/utils/cn.ts

## Import Cycles
- None detected.

## Communities (73 total, 31 thin omitted)

### Community 1 - "onboarding.ts"
Cohesion: 0.09
Nodes (19): OnboardingForm(), OnboardingPage(), OnboardingWizard(), STEPS, WizardProgress(), WizardStepDone(), completeInvitationSignup(), createClinic() (+11 more)

### Community 2 - "button.tsx"
Cohesion: 0.11
Nodes (32): CredentialRow, CredentialType, StaffRef, WizardStepCredentialsProps, ROLE_OPTIONS, StaffRow, AlertRecipient, AlertRecipients() (+24 more)

### Community 3 - "app/page.tsx"
Cohesion: 0.07
Nodes (29): jsonLd, metadata, metadata, pricingJsonLd, BenefitsSection(), ROWS, CTASection(), FAQS (+21 more)

### Community 4 - "staff-form.tsx"
Cohesion: 0.08
Nodes (39): EditStaffFormWrapper(), StaffMember, WizardStepCredentials(), Credential, CredentialFormProps, CredentialTypeOption, ROLES, StaffForm() (+31 more)

### Community 5 - "devDependencies"
Cohesion: 0.04
Nodes (47): eslint, eslint-config-next, jsdom, devDependencies, eslint, eslint-config-next, jsdom, @playwright/test (+39 more)

### Community 7 - "helpers.ts"
Cohesion: 0.08
Nodes (24): checkRateLimit(), POST(), webhookRateLimit, createAdminClient(), PolarWebhookPayload, polarWebhookSchema, ResendWebhookPayload, resendWebhookSchema (+16 more)

### Community 8 - "compilerOptions"
Cohesion: 0.07
Nodes (29): dom, dom.iterable, esnext, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules, src/**/*.ts (+21 more)

### Community 9 - "components.json"
Cohesion: 0.09
Nodes (21): aliases, components, hooks, lib, ui, utils, iconLibrary, menuAccent (+13 more)

### Community 10 - "send-credential-alert/index.ts"
Cohesion: 0.17
Nodes (12): ACTIVE_PLANS, buildAlertEmailHtml(), buildEscalationEmailHtml(), CredentialWithRelations, HTML_ESCAPE_MAP, htmlEscape(), json(), RequestBody (+4 more)

### Community 12 - "send.ts"
Cohesion: 0.22
Nodes (11): emailReportSchema, escapeHtml(), POST(), rateLimitMap, resend, sendEmail(), SendEmailParams, SendEmailResult (+3 more)

### Community 13 - "createClient"
Cohesion: 0.07
Nodes (48): AlertsPage(), CredentialRow, CredentialsTable(), STATUS_LABELS, STATUS_VARIANTS, SettingsPage(), Credential, EditCredentialFormWrapper() (+40 more)

### Community 19 - "types/index.ts"
Cohesion: 0.40
Nodes (4): AlertDeliveryStatus, ClinicPlan, CredentialStatus, UserRole

### Community 20 - "dependencies"
Cohesion: 0.29
Nodes (7): @base-ui/react, class-variance-authority, dependencies, @base-ui/react, class-variance-authority, @sentry/nextjs, @sentry/nextjs

### Community 21 - "proxy.ts"
Cohesion: 0.29
Nodes (4): config, isProtectedRoute, isPublicRoute, soloForbidden

### Community 23 - "templates.tsx"
Cohesion: 0.47
Nodes (4): AlertTemplateParams, buildAlertEmail(), buildEscalationEmail(), htmlEscape()

### Community 88 - "AGENTS.md"
Cohesion: 0.07
Nodes (27): ReportsPage(), Props, ReportGenerator(), ClinicUser, ROLE_STYLES, UserList(), UserListProps, Dialog() (+19 more)

### Community 89 - "Frontend Conventions"
Cohesion: 0.06
Nodes (48): CredentialsListPage(), StaffCredentialsPage(), StaffDetailPage(), StaffListPage(), StaffMember, StaffTableWrapper(), NotFound(), AlertListProps (+40 more)

### Community 91 - "Database Conventions"
Cohesion: 0.10
Nodes (19): 1. Security First, 2. Simplicity Over Cleverness, 3. Type Safety Is Non-Negotiable, 4. Production-Ready By Default, 5. Consistency Over Novelty, Database Conventions, Engineering Principles, Mid-Trial Upgrade (Subscribe During Trial) (+11 more)

## Knowledge Gaps
- **226 isolated node(s):** `Tooling that governs work in this repo`, `Project Overview`, `1. Security First`, `2. Simplicity Over Cleverness`, `3. Type Safety Is Non-Negotiable` (+221 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **31 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cn()` connect `Frontend Conventions` to `button.tsx`, `app/page.tsx`, `staff-form.tsx`, `skeleton.tsx`, `createClient`?**
  _High betweenness centrality (0.105) - this node is a cross-community bridge._
- **Why does `createClient()` connect `createClient` to `onboarding.ts`, `button.tsx`, `staff-form.tsx`, `send.ts`, `AGENTS.md`, `Frontend Conventions`?**
  _High betweenness centrality (0.069) - this node is a cross-community bridge._
- **Why does `dependencies` connect `dependencies` to `devDependencies`, `alert-list.tsx`, `@clerk/nextjs`, `clsx`, `@hookform/resolvers`, `lucide-react`, `next`, `@polar-sh/sdk`, `react`, `react-dom`, `react-hook-form`, `@react-pdf/renderer`, `@react-three/drei`, `@react-three/fiber`, `resend`, `shadcn`, `sonner`, `@supabase/ssr`, `@supabase/supabase-js`, `svix`, `tailwind-merge`, `three`, `tw-animate-css`, `zod`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **What connects `Tooling that governs work in this repo`, `Project Overview`, `1. Security First` to the rest of the system?**
  _226 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `onboarding.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.09090909090909091 - nodes in this community are weakly interconnected._
- **Should `button.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.10612244897959183 - nodes in this community are weakly interconnected._
- **Should `app/page.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.0673758865248227 - nodes in this community are weakly interconnected._
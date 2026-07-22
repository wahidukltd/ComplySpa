# Graph Report - complyspa  (2026-07-22)

## Corpus Check
- 193 files · ~93,927 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 772 nodes · 1574 edges · 75 communities (45 shown, 30 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `12a2d523`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- credentials-table.tsx
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
- class-variance-authority
- send-audit-reminder/index.ts
- dashboard-shell.tsx
- types/index.ts
- dependencies
- proxy.ts
- templates.tsx
- MockIntersectionObserver
- app/layout.tsx
- next.config.ts
- @clerk/nextjs
- actions/audit.ts
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
- credential-form.tsx
- AGENTS.md
- Frontend Conventions
- Database Conventions
- credentials.ts
- badge.tsx

## God Nodes (most connected - your core abstractions)
1. `cn()` - 94 edges
2. `createClient()` - 75 edges
3. `buttonVariants` - 24 edges
4. `Button()` - 24 edges
5. `compilerOptions` - 18 edges
6. `Card()` - 14 edges
7. `CardContent()` - 14 edges
8. `CardHeader()` - 13 edges
9. `CardTitle()` - 13 edges
10. `Input()` - 12 edges

## Surprising Connections (you probably didn't know these)
- `DashboardLayout()` --calls--> `createClient()`  [EXTRACTED]
  src/app/dashboard/layout.tsx → src/lib/supabase/server.ts
- `NavLink()` --calls--> `cn()`  [EXTRACTED]
  src/components/layout/sidebar.tsx → src/lib/utils/cn.ts
- `DialogOverlay()` --calls--> `cn()`  [EXTRACTED]
  src/components/ui/dialog.tsx → src/lib/utils/cn.ts
- `SelectGroup()` --calls--> `cn()`  [EXTRACTED]
  src/components/ui/select.tsx → src/lib/utils/cn.ts
- `SelectLabel()` --calls--> `cn()`  [EXTRACTED]
  src/components/ui/select.tsx → src/lib/utils/cn.ts

## Import Cycles
- None detected.

## Communities (75 total, 30 thin omitted)

### Community 0 - "credentials-table.tsx"
Cohesion: 0.16
Nodes (15): CredentialRow, CredentialsTable(), STATUS_LABELS, STATUS_VARIANTS, StaffMember, StaffTable(), StaffTableProps, DropdownMenu() (+7 more)

### Community 1 - "onboarding.ts"
Cohesion: 0.11
Nodes (16): OnboardingForm(), OnboardingPage(), OnboardingWizard(), completeInvitationSignup(), createClinic(), createClinicInternal(), createClinicOnboarding(), PlanLimitError (+8 more)

### Community 2 - "button.tsx"
Cohesion: 0.10
Nodes (35): STEPS, WizardProgress(), WizardStepChecklist(), WizardStepChecklistProps, WizardStepClinic(), CredentialRow, CredentialType, StaffRef (+27 more)

### Community 3 - "app/page.tsx"
Cohesion: 0.06
Nodes (40): CredentialsListPage(), DashboardPage(), StaffCredentialsPage(), NotFound(), jsonLd, metadata, metadata, pricingJsonLd (+32 more)

### Community 4 - "staff-form.tsx"
Cohesion: 0.11
Nodes (23): StaffMember, StaffListPage(), StaffMember, StaffTableWrapper(), ROLES, StaffForm(), StaffFormProps, StaffMember (+15 more)

### Community 5 - "devDependencies"
Cohesion: 0.04
Nodes (47): eslint, eslint-config-next, jsdom, devDependencies, eslint, eslint-config-next, jsdom, @playwright/test (+39 more)

### Community 6 - "alert-list.tsx"
Cohesion: 0.27
Nodes (11): AlertListProps, AlertLog, CATEGORIES, Table(), TableBody(), TableCaption(), TableCell(), TableFooter() (+3 more)

### Community 7 - "helpers.ts"
Cohesion: 0.08
Nodes (25): checkRateLimit(), POST(), webhookRateLimit, createAdminClient(), PolarWebhookPayload, polarWebhookSchema, ResendWebhookPayload, resendWebhookSchema (+17 more)

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
Nodes (51): AlertsPage(), SettingsPage(), Credential, EditCredentialFormWrapper(), EditCredentialPage(), NewCredentialFormWrapper(), NewCredentialPage(), EditStaffFormWrapper() (+43 more)

### Community 15 - "send-audit-reminder/index.ts"
Cohesion: 0.20
Nodes (7): HTML_ESCAPE_MAP, json(), RequestBody, sendEmailWithRetry(), SENTRY_DSN, sleep(), supabase

### Community 16 - "dashboard-shell.tsx"
Cohesion: 0.27
Nodes (6): DashboardLayout(), DashboardShell(), navItems, NavLink(), Sidebar(), Topbar()

### Community 19 - "types/index.ts"
Cohesion: 0.25
Nodes (7): AlertDeliveryStatus, AuditFindingStatus, AuditRunType, ClinicPlan, CredentialStatus, RemediationStatus, UserRole

### Community 20 - "dependencies"
Cohesion: 0.29
Nodes (7): @base-ui/react, motion, dependencies, @base-ui/react, motion, @sentry/nextjs, @sentry/nextjs

### Community 21 - "proxy.ts"
Cohesion: 0.29
Nodes (4): config, isProtectedRoute, isPublicRoute, soloForbidden

### Community 23 - "templates.tsx"
Cohesion: 0.47
Nodes (4): AlertTemplateParams, buildAlertEmail(), buildEscalationEmail(), htmlEscape()

### Community 35 - "actions/audit.ts"
Cohesion: 0.09
Nodes (39): AuditPage(), AuditChecklist(), Props, STATUS_BADGE, CompleteAuditButton(), DateCell(), GapTracker(), Props (+31 more)

### Community 81 - "credential-form.tsx"
Cohesion: 0.16
Nodes (14): Credential, CredentialFormProps, CredentialTypeOption, SelectContent(), SelectGroup(), SelectItem(), SelectLabel(), SelectScrollDownButton() (+6 more)

### Community 88 - "AGENTS.md"
Cohesion: 0.17
Nodes (14): ReportsPage(), Props, ReportGenerator(), createReport(), createReportSchema, getReportData(), getReportHistory(), C (+6 more)

### Community 89 - "Frontend Conventions"
Cohesion: 0.16
Nodes (13): CardAction(), CardFooter(), DropdownMenuCheckboxItem(), DropdownMenuContent(), DropdownMenuItem(), DropdownMenuLabel(), DropdownMenuRadioItem(), DropdownMenuSeparator() (+5 more)

### Community 91 - "Database Conventions"
Cohesion: 0.09
Nodes (20): 1. Security First, 2. Simplicity Over Cleverness, 3. Type Safety Is Non-Negotiable, 4. Production-Ready By Default, 5. Consistency Over Novelty, Database Conventions, Deploy Edge Functions, Engineering Principles (+12 more)

### Community 103 - "credentials.ts"
Cohesion: 0.16
Nodes (14): AlertList(), ClinicUser, ROLE_STYLES, UserList(), UserListProps, Dialog(), DialogContent(), DialogDescription() (+6 more)

### Community 107 - "badge.tsx"
Cohesion: 0.25
Nodes (6): StaffDetailPage(), DeliveryStatus, DeliveryStatusBadge(), DeliveryStatusBadgeProps, Badge(), badgeVariants

## Knowledge Gaps
- **246 isolated node(s):** `$schema`, `style`, `rsc`, `tsx`, `config` (+241 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **30 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cn()` connect `Frontend Conventions` to `button.tsx`, `app/page.tsx`, `staff-form.tsx`, `alert-list.tsx`, `credentials.ts`, `badge.tsx`, `skeleton.tsx`, `createClient`, `dashboard-shell.tsx`, `credential-form.tsx`?**
  _High betweenness centrality (0.104) - this node is a cross-community bridge._
- **Why does `createClient()` connect `createClient` to `credentials-table.tsx`, `onboarding.ts`, `button.tsx`, `app/page.tsx`, `actions/audit.ts`, `staff-form.tsx`, `badge.tsx`, `send.ts`, `dashboard-shell.tsx`, `AGENTS.md`?**
  _High betweenness centrality (0.082) - this node is a cross-community bridge._
- **Why does `Button()` connect `button.tsx` to `credentials-table.tsx`, `actions/audit.ts`, `staff-form.tsx`, `app/page.tsx`, `credentials.ts`, `credential-form.tsx`, `AGENTS.md`, `Frontend Conventions`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **What connects `$schema`, `style`, `rsc` to the rest of the system?**
  _246 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `onboarding.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.1111111111111111 - nodes in this community are weakly interconnected._
- **Should `button.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.10401002506265664 - nodes in this community are weakly interconnected._
- **Should `app/page.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.061952074810052604 - nodes in this community are weakly interconnected._
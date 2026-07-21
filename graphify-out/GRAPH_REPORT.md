# Graph Report - complyspa  (2026-07-21)

## Corpus Check
- 186 files · ~91,890 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 894 nodes · 1624 edges · 107 communities (75 shown, 32 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `e8194e4c`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Community 0
- Community 1
- Community 2
- Community 3
- Community 4
- Community 5
- Community 6
- Community 7
- Community 8
- Community 9
- Community 10
- Community 11
- Community 12
- Community 13
- Community 14
- Community 15
- Community 16
- Community 17
- Community 18
- Community 19
- Community 20
- Community 21
- Community 22
- Community 23
- Community 24
- Community 26
- Community 27
- Community 28
- Community 29
- Community 30
- Community 31
- Community 33
- Community 34
- Community 35
- Community 36
- Community 37
- Community 38
- Community 39
- Community 40
- Community 41
- Community 42
- Community 43
- Community 44
- Community 45
- Community 46
- Community 47
- Community 48
- Community 49
- Community 50
- Community 51
- Community 52
- Community 53
- Community 54
- Community 55
- Community 56
- Community 57
- Community 58
- Community 59
- Community 74
- Community 75
- AGENTS.md
- Frontend Conventions
- audit/page.tsx
- Database Conventions
- Public Pages & Marketing Conventions
- Engineering Principles
- Development Workflow
- Backend Conventions
- Testing Philosophy
- Authentication & Authorization
- Git Workflow
- Domain Knowledge
- Claude Code Behavior Guidelines
- Email Responsibilities
- edit-staff-form-wrapper.tsx
- credentials.ts
- onboarding/page.tsx
- validations/settings.ts
- 020_reconcile_plan_limits.sql

## God Nodes (most connected - your core abstractions)
1. `cn()` - 94 edges
2. `createClient()` - 45 edges
3. `buttonVariants` - 24 edges
4. `Button()` - 23 edges
5. `compilerOptions` - 18 edges
6. `Card()` - 14 edges
7. `CardContent()` - 14 edges
8. `CardHeader()` - 13 edges
9. `CardTitle()` - 13 edges
10. `Input()` - 12 edges

## Surprising Connections (you probably didn't know these)
- `EditCredentialPage()` --calls--> `createClient()`  [EXTRACTED]
  src/app/dashboard/staff/[id]/credentials/[credId]/edit/page.tsx → src/lib/supabase/server.ts
- `EditStaffPage()` --calls--> `createClient()`  [EXTRACTED]
  src/app/dashboard/staff/[id]/edit/page.tsx → src/lib/supabase/server.ts
- `NewStaffPage()` --calls--> `createClient()`  [EXTRACTED]
  src/app/dashboard/staff/new/page.tsx → src/lib/supabase/server.ts
- `NavLink()` --calls--> `cn()`  [EXTRACTED]
  src/components/layout/sidebar.tsx → src/lib/utils/cn.ts
- `DialogOverlay()` --calls--> `cn()`  [EXTRACTED]
  src/components/ui/dialog.tsx → src/lib/utils/cn.ts

## Import Cycles
- None detected.

## Communities (107 total, 32 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.07
Nodes (50): CredentialRow, CredentialsTable(), STATUS_LABELS, STATUS_VARIANTS, StaffDetailPage(), AlertListProps, AlertLog, DeliveryStatus (+42 more)

### Community 1 - "Community 1"
Cohesion: 0.19
Nodes (7): PlanLimitError, RlsViolationError, WebhookValidationError, getPlanLimits(), Plan, PLAN_LIMITS, PlanLimit

### Community 2 - "Community 2"
Cohesion: 0.08
Nodes (48): STEPS, WizardProgress(), WizardStepClinic(), CredentialRow, CredentialType, StaffRef, WizardStepCredentials(), WizardStepCredentialsProps (+40 more)

### Community 3 - "Community 3"
Cohesion: 0.07
Nodes (38): DashboardPage(), NotFound(), jsonLd, metadata, metadata, pricingJsonLd, PricingPage(), BenefitsSection() (+30 more)

### Community 4 - "Community 4"
Cohesion: 0.10
Nodes (23): ReportsPage(), Props, ReportGenerator(), createReport(), getReportData(), getReportHistory(), C, ComplianceReport() (+15 more)

### Community 5 - "Community 5"
Cohesion: 0.04
Nodes (47): eslint, eslint-config-next, jsdom, devDependencies, eslint, eslint-config-next, jsdom, @playwright/test (+39 more)

### Community 6 - "Community 6"
Cohesion: 0.14
Nodes (22): AuditChecklist(), Props, STATUS_BADGE, DateCell(), GapTracker(), Props, RemediationCell(), Props (+14 more)

### Community 7 - "Community 7"
Cohesion: 0.08
Nodes (22): POST(), createAdminClient(), PolarWebhookPayload, polarWebhookSchema, ResendWebhookPayload, resendWebhookSchema, subscriptionDataSchema, anonKeyJwt (+14 more)

### Community 8 - "Community 8"
Cohesion: 0.07
Nodes (29): dom, dom.iterable, esnext, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules, src/**/*.ts (+21 more)

### Community 9 - "Community 9"
Cohesion: 0.09
Nodes (21): aliases, components, hooks, lib, ui, utils, iconLibrary, menuAccent (+13 more)

### Community 10 - "Community 10"
Cohesion: 0.17
Nodes (12): ACTIVE_PLANS, buildAlertEmailHtml(), buildEscalationEmailHtml(), CredentialWithRelations, HTML_ESCAPE_MAP, htmlEscape(), json(), RequestBody (+4 more)

### Community 12 - "Community 12"
Cohesion: 0.22
Nodes (11): emailReportSchema, escapeHtml(), POST(), rateLimitMap, resend, sendEmail(), SendEmailParams, SendEmailResult (+3 more)

### Community 13 - "Community 13"
Cohesion: 0.09
Nodes (35): SettingsPage(), AlertRecipients(), ClinicProfileForm(), CustomCredentialTypes(), UserInviteForm(), ClinicUser, ROLE_STYLES, UserListProps (+27 more)

### Community 14 - "Community 14"
Cohesion: 0.35
Nodes (12): alert_logs, audit_reports, clinics, credential_types, credentials, staff_members, trigger_clinics_updated_at, trigger_credentials_updated_at (+4 more)

### Community 15 - "Community 15"
Cohesion: 0.20
Nodes (7): HTML_ESCAPE_MAP, json(), RequestBody, sendEmailWithRetry(), SENTRY_DSN, sleep(), supabase

### Community 16 - "Community 16"
Cohesion: 0.38
Nodes (4): navItems, NavLink(), Sidebar(), Topbar()

### Community 17 - "Community 17"
Cohesion: 0.29
Nodes (6): prevent_clerk_user_id_change(), prevent_clinic_id_change(), trigger_credentials_clinic_id_immutable, trigger_staff_members_clinic_id_immutable, trigger_users_clerk_user_id_immutable, trigger_users_clinic_id_immutable

### Community 18 - "Community 18"
Cohesion: 0.28
Nodes (5): clinics, credential_types, scan_expiring_credentials(), staff_members, trigger_credential_types_updated_at

### Community 19 - "Community 19"
Cohesion: 0.25
Nodes (7): AlertDeliveryStatus, AuditFindingStatus, AuditRunType, ClinicPlan, CredentialStatus, RemediationStatus, UserRole

### Community 20 - "Community 20"
Cohesion: 0.29
Nodes (7): @base-ui/react, class-variance-authority, dependencies, @base-ui/react, class-variance-authority, @sentry/nextjs, @sentry/nextjs

### Community 21 - "Community 21"
Cohesion: 0.29
Nodes (4): config, isProtectedRoute, isPublicRoute, soloForbidden

### Community 22 - "Community 22"
Cohesion: 0.38
Nodes (5): credential_audit, enforce_plan_limits(), trigger_credential_types_clinic_id_immutable, trigger_enforce_plan_limits_credentials, trigger_enforce_plan_limits_staff

### Community 23 - "Community 23"
Cohesion: 0.47
Nodes (4): AlertTemplateParams, buildAlertEmail(), buildEscalationEmail(), htmlEscape()

### Community 26 - "Community 26"
Cohesion: 0.60
Nodes (4): audit_findings, audit_runs, scan_audit_overdue(), trigger_audit_findings_updated_at

### Community 28 - "Community 28"
Cohesion: 0.67
Nodes (3): audit_credential_changes(), credential_audit, trigger_credential_audit

### Community 29 - "Community 29"
Cohesion: 0.67
Nodes (3): set_audit_report_author(), trigger_set_audit_report_author, users

### Community 30 - "Community 30"
Cohesion: 0.50
Nodes (3): alert_logs, audit_runs, trigger_audit_runs_updated_at

### Community 35 - "Community 35"
Cohesion: 0.17
Nodes (14): AlertsPage(), CredentialsListPage(), DashboardLayout(), NewCredentialFormWrapper(), NewCredentialPage(), StaffCredentialsPage(), StaffListPage(), StaffMember (+6 more)

### Community 88 - "AGENTS.md"
Cohesion: 0.12
Nodes (14): Architecture Decision Records, Dependency Management, Environment Variables, graphify, Logging & Monitoring, Naming Conventions, Page Inventory, Performance Expectations (+6 more)

### Community 89 - "Frontend Conventions"
Cohesion: 0.12
Nodes (16): Accessibility, Animation & 3D Graphics, Component Design, Component Library, Dark theme — tokens DEFINED, UI toggle is POST-MVP, Data visualization (audit-report charts, dashboard KPIs), Derived tokens (built from the five foundation colors), Foundation — warm spa palette (five colors only) (+8 more)

### Community 90 - "audit/page.tsx"
Cohesion: 0.20
Nodes (13): AuditPage(), AlertList(), CompleteAuditButton(), ReadinessReportDocument(), Props, ReadinessScore(), UserList(), completeAudit() (+5 more)

### Community 91 - "Database Conventions"
Cohesion: 0.29
Nodes (7): Audit Engine Tables, Database Conventions, Migrations, pg_cron, Row Level Security, Schema, Trial Lifecycle

### Community 92 - "Public Pages & Marketing Conventions"
Cohesion: 0.29
Nodes (7): Framer Motion on Public Pages — Rules, Landing Page (`src/app/page.tsx`), Pricing Page (`src/app/pricing/page.tsx`), Psychological Copywriting — Rules, Public Pages & Marketing Conventions, SEO & GEO Standards, Three.js on Public Pages — Rules

### Community 93 - "Engineering Principles"
Cohesion: 0.33
Nodes (6): 1. Security First, 2. Simplicity Over Cleverness, 3. Type Safety Is Non-Negotiable, 4. Production-Ready By Default, 5. Consistency Over Novelty, Engineering Principles

### Community 94 - "Development Workflow"
Cohesion: 0.33
Nodes (6): Before Committing, Before Starting Work, Development Workflow, During Implementation, Local Setup, When Stuck

### Community 95 - "Backend Conventions"
Cohesion: 0.40
Nodes (5): API Routes (Vercel), Backend Conventions, Edge Functions (Deno), Error Handling, Supabase Client Usage

### Community 96 - "Testing Philosophy"
Cohesion: 0.40
Nodes (5): Test Data, Test File Location, Testing Philosophy, What NOT to Test Automated, What to Test

### Community 97 - "Authentication & Authorization"
Cohesion: 0.50
Nodes (4): Authentication & Authorization, Clerk, Plan Enforcement, Route Protection

### Community 98 - "Git Workflow"
Cohesion: 0.50
Nodes (4): Branch Strategy, Commit Conventions, Git Workflow, PR Self-Review Checklist

### Community 99 - "Domain Knowledge"
Cohesion: 0.50
Nodes (4): Domain Knowledge, Key Competitors, Med Spa Compliance Context, Why This Product Exists

### Community 100 - "Claude Code Behavior Guidelines"
Cohesion: 0.67
Nodes (3): Before Implementing Any Change, Claude Code Behavior Guidelines, During Implementation

### Community 101 - "Email Responsibilities"
Cohesion: 0.67
Nodes (3): Clerk Handles (free, included in 10K MAU), Email Responsibilities, Resend Handles (free, 3,000 emails/month)

### Community 102 - "edit-staff-form-wrapper.tsx"
Cohesion: 0.18
Nodes (9): EditStaffFormWrapper(), StaffMember, EditStaffPage(), NewStaffPage(), StaffFormWrapper(), StaffForm(), addStaffMember(), updateStaffMember() (+1 more)

### Community 103 - "credentials.ts"
Cohesion: 0.25
Nodes (6): Credential, EditCredentialFormWrapper(), EditCredentialPage(), CredentialForm(), addCredential(), updateCredential()

### Community 104 - "onboarding/page.tsx"
Cohesion: 0.31
Nodes (7): OnboardingForm(), OnboardingPage(), OnboardingWizard(), completeInvitationSignup(), createClinic(), createClinicInternal(), createClinicOnboarding()

### Community 105 - "validations/settings.ts"
Cohesion: 0.29
Nodes (8): AlertRecipientInput, alertRecipientSchema, ClinicProfileInput, clinicProfileSchema, CustomCredentialTypeInput, customCredentialTypeSchema, InviteUserInput, inviteUserSchema

### Community 106 - "020_reconcile_plan_limits.sql"
Cohesion: 0.70
Nodes (4): enforce_plan_limits(), trigger_enforce_plan_limits_credentials, trigger_enforce_plan_limits_staff, trigger_enforce_plan_limits_users

## Knowledge Gaps
- **307 isolated node(s):** `Plan`, `PlanLimit`, `$schema`, `style`, `rsc` (+302 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **32 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cn()` connect `Community 0` to `Community 2`, `Community 3`, `Community 35`, `Community 11`, `Community 13`, `Community 16`?**
  _High betweenness centrality (0.066) - this node is a cross-community bridge._
- **Why does `createClient()` connect `Community 35` to `Community 0`, `Community 2`, `Community 3`, `Community 4`, `edit-staff-form-wrapper.tsx`, `credentials.ts`, `onboarding/page.tsx`, `Community 6`, `Community 12`, `Community 13`, `audit/page.tsx`?**
  _High betweenness centrality (0.032) - this node is a cross-community bridge._
- **Why does `Button()` connect `Community 2` to `Community 0`, `Community 3`, `Community 4`, `Community 6`, `Community 13`, `audit/page.tsx`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **What connects `Plan`, `PlanLimit`, `$schema` to the rest of the system?**
  _307 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.06521739130434782 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.07747747747747748 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.06516290726817042 - nodes in this community are weakly interconnected._
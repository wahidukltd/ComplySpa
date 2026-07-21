# Graph Report - complyspa  (2026-07-21)

## Corpus Check
- 193 files · ~93,876 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 857 nodes · 1213 edges · 119 communities (81 shown, 38 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `d84496f7`
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
- Community 81
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
- credentials.ts
- onboarding/page.tsx
- validations/settings.ts
- 020_reconcile_plan_limits.sql
- badge.tsx
- validations/webhook.ts
- resend/webhook/route.ts
- validations/clinic.ts
- 022_soft_delete_credentials_users.sql

## God Nodes (most connected - your core abstractions)
1. `cn()` - 74 edges
2. `createClient()` - 61 edges
3. `compilerOptions` - 18 edges
4. `getAuth()` - 10 edges
5. `scripts` - 10 edges
6. `Tables` - 8 edges
7. `Button()` - 8 edges
8. `Skeleton()` - 8 edges
9. `updateFinding()` - 7 edges
10. `createClient()` - 7 edges

## Surprising Connections (you probably didn't know these)
- `deleteCredential()` --calls--> `createClient()`  [EXTRACTED]
  src/lib/actions/credentials.ts → src/lib/supabase/server.ts
- `getReportHistory()` --calls--> `createClient()`  [EXTRACTED]
  src/lib/actions/reports.ts → src/lib/supabase/server.ts
- `NavLink()` --calls--> `cn()`  [EXTRACTED]
  src/components/layout/sidebar.tsx → src/lib/utils/cn.ts
- `CardDescription()` --calls--> `cn()`  [EXTRACTED]
  src/components/ui/card.tsx → src/lib/utils/cn.ts
- `CardAction()` --calls--> `cn()`  [EXTRACTED]
  src/components/ui/card.tsx → src/lib/utils/cn.ts

## Import Cycles
- None detected.

## Communities (119 total, 38 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.13
Nodes (22): CredentialRow, CredentialsTable(), STATUS_LABELS, STATUS_VARIANTS, AlertList(), AlertListProps, AlertLog, CATEGORIES (+14 more)

### Community 1 - "Community 1"
Cohesion: 0.19
Nodes (7): PlanLimitError, RlsViolationError, WebhookValidationError, getPlanLimits(), Plan, PLAN_LIMITS, PlanLimit

### Community 2 - "Community 2"
Cohesion: 0.07
Nodes (26): Credential, OnboardingForm(), OnboardingWizard(), STEPS, WizardProgress(), WizardStepChecklist(), WizardStepChecklistProps, CredentialRow (+18 more)

### Community 3 - "Community 3"
Cohesion: 0.08
Nodes (22): jsonLd, metadata, BenefitsSection(), ROWS, CTASection(), FAQS, FAQSection(), FEATURES (+14 more)

### Community 4 - "Community 4"
Cohesion: 0.17
Nodes (10): StaffMember, ROLES, StaffForm(), StaffFormProps, StaffMember, updateStaffMember(), CredentialInput, credentialSchema (+2 more)

### Community 5 - "Community 5"
Cohesion: 0.04
Nodes (47): eslint, eslint-config-next, jsdom, devDependencies, eslint, eslint-config-next, jsdom, @playwright/test (+39 more)

### Community 6 - "Community 6"
Cohesion: 0.15
Nodes (18): Props, Props, ReadinessReportDocument(), STATUS_COLORS, STATUS_LABELS, styles, Props, ReadinessScore() (+10 more)

### Community 7 - "Community 7"
Cohesion: 0.26
Nodes (9): anonKeyJwt, createJwt(), fetchAsUser(), getServiceClient(), patchAsUser(), projectIdMatch, serviceKeyJwt, service (+1 more)

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
Cohesion: 0.32
Nodes (7): resend, sendEmail(), SendEmailParams, SendEmailResult, sendEmailWithAttachment(), SendEmailWithAttachmentParams, sleep()

### Community 13 - "Community 13"
Cohesion: 0.06
Nodes (49): AlertsPage(), CredentialsListPage(), DashboardLayout(), SettingsPage(), EditCredentialPage(), NewCredentialPage(), StaffCredentialsPage(), EditStaffPage() (+41 more)

### Community 14 - "Community 14"
Cohesion: 0.35
Nodes (12): alert_logs, audit_reports, clinics, credential_types, credentials, staff_members, trigger_clinics_updated_at, trigger_credentials_updated_at (+4 more)

### Community 15 - "Community 15"
Cohesion: 0.20
Nodes (7): HTML_ESCAPE_MAP, json(), RequestBody, sendEmailWithRetry(), SENTRY_DSN, sleep(), supabase

### Community 16 - "Community 16"
Cohesion: 0.32
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
Cohesion: 0.13
Nodes (20): AuditPage(), AuditChecklist(), CompleteAuditButton(), DateCell(), GapTracker(), Props, RemediationCell(), completeAudit() (+12 more)

### Community 81 - "Community 81"
Cohesion: 0.14
Nodes (20): Input(), Label(), SelectContent(), SelectGroup(), SelectItem(), SelectLabel(), SelectScrollDownButton(), SelectScrollUpButton() (+12 more)

### Community 88 - "AGENTS.md"
Cohesion: 0.15
Nodes (14): Props, ReportGenerator(), createReport(), createReportSchema, getReportData(), getReportHistory(), C, ComplianceReport() (+6 more)

### Community 89 - "Frontend Conventions"
Cohesion: 0.12
Nodes (9): DropdownMenuCheckboxItem(), DropdownMenuContent(), DropdownMenuItem(), DropdownMenuLabel(), DropdownMenuRadioItem(), DropdownMenuSeparator(), DropdownMenuShortcut(), DropdownMenuSubContent() (+1 more)

### Community 91 - "Database Conventions"
Cohesion: 0.09
Nodes (20): 1. Security First, 2. Simplicity Over Cleverness, 3. Type Safety Is Non-Negotiable, 4. Production-Ready By Default, 5. Consistency Over Novelty, Database Conventions, Deploy Edge Functions, Engineering Principles (+12 more)

### Community 92 - "Public Pages & Marketing Conventions"
Cohesion: 0.28
Nodes (6): StaffMember, StaffMember, StaffTable(), StaffTableProps, deleteStaffMember(), Tables

### Community 93 - "Engineering Principles"
Cohesion: 0.22
Nodes (8): CompositeTypes, Constants, Database, DatabaseWithoutInternals, DefaultSchema, Enums, TablesInsert, TablesUpdate

### Community 94 - "Development Workflow"
Cohesion: 0.39
Nodes (5): FAQS, Accordion(), AccordionContent(), AccordionItem(), AccordionTrigger()

### Community 95 - "Backend Conventions"
Cohesion: 0.25
Nodes (6): execSql(), EXPECTED_CRON_FUNCTIONS, EXPECTED_CRON_JOBS, EXPECTED_FUNCTIONS, EXPECTED_IMMUTABILITY_TRIGGERS, EXPECTED_TABLES

### Community 98 - "Git Workflow"
Cohesion: 0.50
Nodes (4): emailReportSchema, escapeHtml(), POST(), rateLimitMap

### Community 103 - "credentials.ts"
Cohesion: 0.18
Nodes (6): DialogContent(), DialogDescription(), DialogFooter(), DialogHeader(), DialogOverlay(), DialogTitle()

### Community 104 - "onboarding/page.tsx"
Cohesion: 0.19
Nodes (12): STATUS_BADGE, PlanCards(), PLANS, Button(), buttonVariants, Card(), CardAction(), CardContent() (+4 more)

### Community 105 - "validations/settings.ts"
Cohesion: 0.29
Nodes (8): AlertRecipientInput, alertRecipientSchema, ClinicProfileInput, clinicProfileSchema, CustomCredentialTypeInput, customCredentialTypeSchema, InviteUserInput, inviteUserSchema

### Community 106 - "020_reconcile_plan_limits.sql"
Cohesion: 0.70
Nodes (4): enforce_plan_limits(), trigger_enforce_plan_limits_credentials, trigger_enforce_plan_limits_staff, trigger_enforce_plan_limits_users

### Community 107 - "badge.tsx"
Cohesion: 0.38
Nodes (5): DeliveryStatus, DeliveryStatusBadge(), DeliveryStatusBadgeProps, Badge(), badgeVariants

### Community 108 - "validations/webhook.ts"
Cohesion: 0.33
Nodes (5): PolarWebhookPayload, polarWebhookSchema, ResendWebhookPayload, resendWebhookSchema, subscriptionDataSchema

### Community 109 - "resend/webhook/route.ts"
Cohesion: 0.67
Nodes (3): checkRateLimit(), POST(), webhookRateLimit

## Knowledge Gaps
- **274 isolated node(s):** `Tooling that governs work in this repo`, `Project Overview`, `1. Security First`, `2. Simplicity Over Cleverness`, `3. Type Safety Is Non-Negotiable` (+269 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **38 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cn()` connect `Community 81` to `Community 0`, `credentials.ts`, `onboarding/page.tsx`, `badge.tsx`, `Community 11`, `Community 16`, `Frontend Conventions`, `Development Workflow`?**
  _High betweenness centrality (0.069) - this node is a cross-community bridge._
- **Why does `createClient()` connect `Community 13` to `Community 0`, `Community 2`, `Community 35`, `Community 6`, `AGENTS.md`?**
  _High betweenness centrality (0.044) - this node is a cross-community bridge._
- **Why does `Button()` connect `onboarding/page.tsx` to `Community 0`, `Community 35`, `credentials.ts`, `Community 81`, `AGENTS.md`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **What connects `Tooling that governs work in this repo`, `Project Overview`, `1. Security First` to the rest of the system?**
  _274 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.13333333333333333 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.07195121951219512 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.07563025210084033 - nodes in this community are weakly interconnected._
# Graph Report - .  (2026-07-21)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 794 nodes · 1567 edges · 88 communities (55 shown, 33 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `03c376dc`
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

## God Nodes (most connected - your core abstractions)
1. `cn()` - 94 edges
2. `createClient()` - 74 edges
3. `buttonVariants` - 24 edges
4. `Button()` - 23 edges
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
- `POST()` --calls--> `createClient()`  [EXTRACTED]
  src/app/api/reports/email/route.ts → src/lib/supabase/server.ts
- `POST()` --calls--> `createAdminClient()`  [EXTRACTED]
  src/app/api/resend/webhook/route.ts → src/lib/supabase/admin.ts

## Import Cycles
- None detected.

## Communities (88 total, 33 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.05
Nodes (61): CredentialRow, CredentialsTable(), STATUS_LABELS, STATUS_VARIANTS, CredentialsListPage(), StaffCredentialsPage(), StaffDetailPage(), AlertListProps (+53 more)

### Community 1 - "Community 1"
Cohesion: 0.06
Nodes (58): AlertsPage(), SettingsPage(), Credential, EditCredentialFormWrapper(), EditCredentialPage(), NewCredentialFormWrapper(), NewCredentialPage(), EditStaffFormWrapper() (+50 more)

### Community 2 - "Community 2"
Cohesion: 0.09
Nodes (39): STEPS, WizardProgress(), WizardStepClinic(), CredentialRow, CredentialType, StaffRef, WizardStepCredentials(), WizardStepCredentialsProps (+31 more)

### Community 3 - "Community 3"
Cohesion: 0.07
Nodes (38): DashboardPage(), NotFound(), jsonLd, metadata, metadata, pricingJsonLd, PricingPage(), BenefitsSection() (+30 more)

### Community 4 - "Community 4"
Cohesion: 0.06
Nodes (37): ReportsPage(), Props, ReportGenerator(), ClinicUser, ROLE_STYLES, UserList(), UserListProps, Dialog() (+29 more)

### Community 5 - "Community 5"
Cohesion: 0.04
Nodes (47): eslint, eslint-config-next, jsdom, devDependencies, eslint, eslint-config-next, jsdom, @playwright/test (+39 more)

### Community 6 - "Community 6"
Cohesion: 0.11
Nodes (32): AuditPage(), AuditChecklist(), Props, STATUS_BADGE, CompleteAuditButton(), DateCell(), GapTracker(), Props (+24 more)

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
Cohesion: 0.24
Nodes (9): OnboardingForm(), OnboardingPage(), OnboardingWizard(), completeInvitationSignup(), createClinic(), createClinicInternal(), createClinicOnboarding(), CreateClinicInput (+1 more)

### Community 14 - "Community 14"
Cohesion: 0.35
Nodes (12): alert_logs, audit_reports, clinics, credential_types, credentials, staff_members, trigger_clinics_updated_at, trigger_credentials_updated_at (+4 more)

### Community 15 - "Community 15"
Cohesion: 0.20
Nodes (7): HTML_ESCAPE_MAP, json(), RequestBody, sendEmailWithRetry(), SENTRY_DSN, sleep(), supabase

### Community 16 - "Community 16"
Cohesion: 0.27
Nodes (6): DashboardLayout(), DashboardShell(), navItems, NavLink(), Sidebar(), Topbar()

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

## Knowledge Gaps
- **231 isolated node(s):** `$schema`, `style`, `rsc`, `tsx`, `config` (+226 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **33 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cn()` connect `Community 0` to `Community 1`, `Community 2`, `Community 3`, `Community 4`, `Community 11`, `Community 16`?**
  _High betweenness centrality (0.085) - this node is a cross-community bridge._
- **Why does `createClient()` connect `Community 1` to `Community 0`, `Community 2`, `Community 3`, `Community 4`, `Community 6`, `Community 12`, `Community 13`, `Community 16`?**
  _High betweenness centrality (0.069) - this node is a cross-community bridge._
- **Why does `Button()` connect `Community 2` to `Community 0`, `Community 3`, `Community 4`, `Community 6`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **What connects `$schema`, `style`, `rsc` to the rest of the system?**
  _231 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.05465765501028504 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.059720869847452125 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.09424603174603174 - nodes in this community are weakly interconnected._
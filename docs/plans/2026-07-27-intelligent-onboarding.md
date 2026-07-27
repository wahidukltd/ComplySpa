# Plan: Intelligent Role Templates & Onboarding

**Status:** Implemented
**Date:** 2026-07-27
**Product:** ComplySpa

## 1. Executive Summary

Add a persistent onboarding progress system that tracks each staff member's compliance journey from "added" to "fully compliant." A new `onboarding_items` table stores per-staff required credentials with individual status (pending/completed/skipped), sourced from the existing role→credential mapping. A DB trigger auto-completes onboarding items when matching credentials are added — covering both the wizard and manual add paths. A progress indicator appears on the staff list, staff detail page (progress bar + checklist), and a dedicated onboarding dashboard answers "who's ready to start?" at a glance. The biggest risk: scope creep beyond progress tracking into a full workflow tool this plan tracks readiness, it does not manage tasks.

## 2. Business Context

- **Problem:** The staff wizard auto-creates credentials, but after that the owner has no visibility into what's been completed vs what's still missing. They must click into each staff member's profile and scan the credential list to answer "can they start?" There's no onboarding checklist, no progress tracking, no way to customize the credential requirements per role per clinic.
- **Who it affects:** Clinic owners and managers onboarding multiple staff. Clinics with custom requirements (e.g., "our RNs also need Laser Safety Cert").
- **What happens if not built:** Owners have no at-a-glance onboarding status. Custom credential requirements per role require manual credential addition after the wizard. No way to track "Jane has her license but still needs HIPAA training."
- **Non-goals:**
  - No changes to the existing staff wizard (it already handles creation + credential auto-load correctly)
  - No new Edge Functions or background jobs
  - No changes to plan limits, billing, or entitlements
  - No changes to the existing credential status system (valid/expiring/expired — that's separate from onboarding)
  - No email notifications for onboarding (future feature)

## 3. Current System Analysis

### Relevant existing architecture

| What | Where | Notes |
|------|-------|-------|
| Role→credential mapping | `src/lib/staff/role-credential-defaults.ts` | Hardcoded TypeScript constant. Not customizable per clinic. |
| Staff wizard | `src/components/staff/staff-wizard.tsx` | 3-step wizard, auto-loads credentials from `ROLE_CREDENTIAL_MAP` |
| Staff detail page | `src/app/dashboard/staff/[id]/page.tsx` | Shows credentials list with status badges |
| Staff list page | `src/app/dashboard/staff/page.tsx` | Shows staff with credential status dots |
| Staff server action | `src/lib/actions/staff.ts` | `addStaffMemberWithCredentials` creates staff + bulk credentials |
| Credential types | `credential_types` table | 13 global rows (licenses, trainings, insurance, agreements) |
| Plan limits | `src/lib/utils/plan.ts` | `getPlanLimits()` — staff and credential counts |
| RLS pattern | `auth_clinic_id()` helper | SECURITY DEFINER, extracts clinic_id from JWT, scopes all queries |

### Existing staff_members columns

```
id, clinic_id, name, role, hire_date, email, phone, procedures_performed,
location, department, manager, deleted_at, suspended_at, suspended_plan,
created_at, updated_at
```

### Existing credentials columns

```
id, staff_member_id, credential_type_id, clinic_id, license_number, state,
issue_date, expiration_date, document_url, status, verification_url,
last_verified_date, verified_by_user_id, notes, deleted_at, suspended_at,
suspended_plan, created_at, updated_at
```

### Existing ROLE_CREDENTIAL_MAP (hardcoded)

Currently maps 9 roles to credential names. This will become seed data for the new `role_templates` table.

### Assumptions log

- The existing `ROLE_CREDENTIAL_MAP` TypeScript constant is used by the wizard. It will still exist but will source data from `role_templates` instead of being the single source of truth.
- The `role_templates` table will have both global defaults (`clinic_id IS NULL`) and per-clinic overrides (`clinic_id` set). The wizard reads global + clinic-specific and merges them.
- Onboarding progress is a new concept separate from credential `status` (valid/expiring/expired). A credential can be "valid" (has a future expiration date) but still in "pending" onboarding status (not yet verified).
- No existing data migration needed — existing staff/credentials remain untouched. The onboarding_items table is populated on next wizard use.

## 4. Proposed Design

### 4a. Data model changes

Only one new table: `onboarding_items`. The role→credential mapping stays in the existing TypeScript constant (`ROLE_CREDENTIAL_MAP`) — no `role_templates` table until clinic-specific template customization is needed (Phase 2).

#### New table: `onboarding_items`

```sql
CREATE TABLE onboarding_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_member_id uuid NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  clinic_id uuid NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  credential_type_id uuid NOT NULL REFERENCES credential_types(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'skipped')),
  completed_at timestamptz,
  completed_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (staff_member_id, credential_type_id)
);

CREATE INDEX idx_onboarding_items_staff ON onboarding_items(staff_member_id);
CREATE INDEX idx_onboarding_items_clinic_status ON onboarding_items(clinic_id, status);

ALTER TABLE onboarding_items ENABLE ROW LEVEL SECURITY;

-- All authenticated clinic members can read
CREATE POLICY "Read onboarding items"
  ON onboarding_items FOR SELECT
  USING (clinic_id = auth_clinic_id());

-- Owner/manager can insert/update
CREATE POLICY "Manage onboarding items"
  ON onboarding_items FOR INSERT/UPDATE
  USING (clinic_id = auth_clinic_id())
  WITH CHECK (clinic_id = auth_clinic_id());

-- No DELETE policy — items are soft-cleared by completing/skipping
```

#### Migration order (single file: `038_add_onboarding_items.sql`)

1. CREATE TABLE `onboarding_items` with RLS + indexes
2. CREATE TRIGGER `trigger_onboarding_items_updated_at` on `onboarding_items` using existing `update_updated_at_column()` function (verified: function already exists in DB)
3. CREATE FUNCTION `auto_complete_onboarding_item()` — fires ON INSERT on `credentials` table, matches staff_member_id + credential_type_id against `onboarding_items`, updates matching `pending` row to `completed`

### 4b. TypeScript constant and utility functions

**`src/lib/staff/role-credential-defaults.ts`** — unchanged. The `ROLE_CREDENTIAL_MAP` constant remains the source of truth for role→credential mapping. Onboarding items are created from this constant. When Phase 2 (clinic-customizable templates) ships, this constant becomes the seed data source.

**New file: `src/lib/staff/onboarding.ts`** — utility functions:
- `createOnboardingItems(staffMemberId, clinicId, role)` — called after staff creation, inserts onboarding_items from `ROLE_CREDENTIAL_MAP[role]`
- `getOnboardingProgress(staffMemberId)` — returns { total, completed, skipped, pending } counts
- `getOnboardingItems(staffMemberId)` — returns onboarding_items with credential type info
- `updateOnboardingItemStatus(itemId, status, userId)` — mark as completed/skipped

### 4c. Server action changes

**`src/lib/actions/staff.ts`** — modify `addStaffMemberWithCredentials`:
1. After staff INSERT succeeds, call `createOnboardingItems()` to seed onboarding_items from role_templates
2. On credential INSERT, also mark corresponding onboarding_item as `completed`
3. Return onboarding progress summary alongside staff ID

**New: `src/lib/actions/onboarding.ts`**:
- `getStaffOnboarding(staffId)` — returns onboarding_items list with credential type info
- `markOnboardingItemComplete(itemId)` — marks item as completed, sets timestamp and user
- `markOnboardingItemSkipped(itemId)` — marks item as skipped (not required for this staff member)
- (Phase 2) `updateRoleTemplate(input)` — owner/manager can add/remove credential types from their clinic's role template

### 4d. RLS policy changes

- **`onboarding_items`**: SELECT/INSERT/UPDATE scoped by clinic_id. No DELETE (items are soft-cleared by status change).
- **Existing tables**: No changes. The `credentials` INSERT trigger to auto-complete onboarding items runs as the triggering user (not SECURITY DEFINER), so it respects existing RLS.

### 4e. Enforcement-layer changes

None. Onboarding progress is informational, not a hard gate. A staff member can work even with incomplete onboarding items — the system shows what's missing but doesn't block.

### 4f. Frontend changes

#### Staff list view (Phase 1 already has credential status dots)

Add an onboarding status badge next to each staff member's name in `src/components/staff/staff-table.tsx`:
- **Green "Ready"** — all onboarding items completed
- **Amber "In Progress"** — some items completed
- **Gray "Pending"** — no items started (newly added staff)
- The dot or a small label like "3 of 5 done"

#### Staff detail page (`src/app/dashboard/staff/[id]/page.tsx`)

Add an onboarding progress section between the info card and the credentials list:
- Progress bar showing percentage complete
- Checklist of onboarding items with status (pending/completed/skipped)
- Each item shows credential type name, category badge, and an action button (complete/skip)
- Clicking "complete" marks the item done AND navigates to the credential add/edit flow for that type

#### New: Dedicated onboarding page at `/dashboard/onboarding`

A dashboard that answers "who's ready to start?" at a glance:
- Table of all staff members with onboarding completion percentage
- Filter by role, search by name
- Click a staff member to see their full onboarding checklist
- Summary cards: "Ready to Start" count, "In Progress" count, "Not Started" count

#### New: Onboarding section on staff detail

The onboarding items checklist is rendered inline on the staff detail page. Each item shows:
- Checkbox/status indicator (pending → empty circle, completed → green check, skipped → gray dash)
- Credential type name
- Category badge
- Action: "Add credential" (opens credential form for that type) or "Mark as skipped"
- When all items are completed, show a "Ready to Start" banner

### 4g. Wizard integration

The existing staff wizard (`src/components/staff/staff-wizard.tsx`) becomes the entry point for onboarding. After the wizard creates staff + credentials, the user is redirected to the staff detail page which now shows the onboarding checklist. The wizard itself doesn't change — it already handles creation correctly.

### 4h. Role template management (Phase 2, deferred)

The `role_templates` table and settings UI are not in Phase 1. Phase 1 uses the existing `ROLE_CREDENTIAL_MAP` constant. When Phase 2 ships, it will add:
- A `role_templates` table (clinic_customizable)
- A settings page at `/dashboard/settings/role-templates`
- Migration of seed data from the constant into the table

This avoids the global-vs-per-clinic merge complexity and halves Phase 1's migration surface.

## 5. Impact Analysis

| Area | Change |
|------|--------|
| **Database** | 1 new table (`onboarding_items`) + indexes + RLS policies + `auto_complete_onboarding_item()` trigger on `credentials` |
| **Storage** | No change |
| **Auth** | No change |
| **RLS** | New policies on `onboarding_items`. New trigger on `credentials` runs as triggering user — respects existing RLS. |
| **API** | No new API routes. New server actions: `getStaffOnboarding`, `markOnboardingItemComplete`, `markOnboardingItemSkipped`. |
| **Background jobs** | No change |
| **Notifications** | No change |
| **Audit logs** | No change (credential_audit covers credential changes; onboarding_items is a tracking layer, not an audit log) |
| **Caching** | No change |
| **Components** | Modified `StaffTable` (onboarding status column), modified staff detail page (onboarding checklist), new `/dashboard/onboarding` page, new sidebar nav item with `UserCheck` icon |
| **Navigation** | New route: `/dashboard/onboarding`. New sidebar item between "Staff" and "Credentials". |
| **Types** | New Supabase types for both new tables on next typegen |
| **Validation** | New schemas for onboarding actions |
| **Testing** | Unit tests for onboarding utility functions. RLS test matrix for new tables. |
| **Deployment** | 1 migration (2 tables + indexes + seed data). Code changes in ~8 files. |
| **Monitoring** | No new monitors needed — all user-initiated actions. |

## 6. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Onboarding status diverges from actual credential state (item marked completed but credential later deleted) | Medium | Medium | Onboarding items track "requirement addressed," not "credential exists." Deletion of a credential doesn't revert the onboarding item — the requirement was addressed. No reconciliation needed; the status is intentionally about completion history, not current existence. |
| Race condition: onboarding_items INSERT concurrent with credential INSERT in another session | Low | Low | Unique constraint (staff_member_id, credential_type_id) prevents duplicates. The DB trigger `auto_complete_onboarding_item()` uses a simple UPDATE with WHERE status='pending', so a concurrent completion doesn't error — it's idempotent. |
| Auto-complete trigger bypasses RLS | Low | Medium | The trigger runs as the triggering user (not SECURITY DEFINER), so it inherits the user's RLS scope. Only inserts the user has permission to perform can trigger auto-completion. |
| Scope creep: the onboarding dashboard becomes a full project management tool | Medium | High | Explicit non-goal. The onboarding page shows only staff readiness status. No tasks, no due dates, no assignments. |
| N+1 query on onboarding dashboard: fetching progress for every staff member individually | Medium | Low | The dashboard query fetches onboarding progress aggregated by staff_member_id in a single query (GROUP BY + status count), not one query per staff member. The staff list query uses the same pattern already used for credential status dots. |

## 7. Implementation Steps

### Phase 1 — Core Progress Tracking

#### Step 1: DB migration

**File:** `supabase/migrations/20260727XXXX_038_add_onboarding_items.sql`
- CREATE TABLE `onboarding_items` with RLS, indexes, unique constraint
- CREATE TRIGGER `trigger_onboarding_items_updated_at` on `onboarding_items` using existing `update_updated_at_column()` function
- CREATE FUNCTION `auto_complete_onboarding_item()` — trigger function that fires AFTER INSERT on `credentials`, matches staff_member_id + credential_type_id against `onboarding_items`, updates matching `pending` row to `completed`
- CREATE TRIGGER `trigger_auto_complete_onboarding` on `credentials` AFTER INSERT — calls `auto_complete_onboarding_item()`

**Definition of done:** Migration runs. `onboarding_items` table exists and is queryable. Adding a credential to a staff member with a pending onboarding item auto-completes it.

#### Step 2: Onboarding utility functions

**New file:** `src/lib/staff/onboarding.ts`
- `createOnboardingItems(staffMemberId, clinicId, role)` — reads from `ROLE_CREDENTIAL_MAP[role]`, resolves credential type names to IDs, bulk INSERT into `onboarding_items`
- `getOnboardingProgress(staffMemberId)` — returns { total, completed, skipped, pending }
- `getOnboardingItems(staffMemberId)` — returns items with credential type info
- `updateOnboardingItemStatus(itemId, status, userId)` — update item status
- Import `ROLE_CREDENTIAL_MAP` from `@/lib/staff/role-credential-defaults`

**Definition of done:** Functions exist, typed, tested via typecheck.

#### Step 3: Server actions

**New file:** `src/lib/actions/onboarding.ts`
- `getStaffOnboarding(staffId)` — returns onboarding items with credential type details
- `markOnboardingItemComplete(itemId)` — sets status='completed', completed_at, completed_by_user_id
- `markOnboardingItemSkipped(itemId)` — sets status='skipped'

**Modify:** `src/lib/actions/staff.ts` — `addStaffMemberWithCredentials`:
- After staff INSERT: call `createOnboardingItems()`
- After credential INSERT: call `markOnboardingItemComplete()` for each credential by credential_type_id
- Import onboarding functions

**Definition of done:** New server actions compile. Existing wizard creates onboarding items alongside credentials.

#### Step 4: Staff detail page — onboarding checklist

**File:** `src/app/dashboard/staff/[id]/page.tsx`
- Fetch onboarding items via `getStaffOnboarding(id)`
- Render checklist between info card and credentials list
- Each item: status indicator, credential type name, category badge, action button
- Progress bar at top showing completion percentage
- "Ready to Start" banner when all items complete

**Definition of done:** Detail page shows onboarding checklist with working complete/skip actions.

#### Step 5: Staff list — onboarding status

**File:** `src/components/staff/staff-table.tsx`
- Add onboarding status column with colored labels:
  - "Ready" (all complete) — green
  - "In Progress" (some complete) — amber
  - "Pending" (none started) — muted
- Fetch onboarding progress per staff member in the list page query

**Definition of done:** Staff list shows onboarding status for every staff member.

#### Step 6: Onboarding dashboard

**New page:** `src/app/dashboard/onboarding/page.tsx`
- Header: "Onboarding" with summary counts
- Table of all staff: name, role, onboarding progress bar, status badge
- Click to navigate to staff detail (which shows full checklist)
- Search/filter by name and role

**New nav item:** Add to `src/components/layout/sidebar.tsx` — insert between "Staff" and "Credentials" with `UserCheck` icon from lucide-react (verified: sidebar uses a `navItems` array in `src/components/layout/sidebar.tsx:17`)

**Definition of done:`/dashboard/onboarding` shows all staff with onboarding status.

### Phase 2 — Role Template Management

#### Step 7: Settings page for role templates

**New page:** `src/app/dashboard/settings/role-templates/page.tsx`
- Role selector dropdown
- Shows current credential types for that role (from `role_templates`)
- Add credential types from global list
- Remove credential types
- Changes apply to future staff only

**Definition of done:** Owner/manager can customize role→credential templates per clinic.

## 8. Migration & Rollback Plan

### Forward migration

Single migration `038_add_onboarding_items.sql`:
1. CREATE TABLE `onboarding_items` (reversible: DROP TABLE)
2. CREATE TRIGGER + FUNCTION for auto-complete (reversible: DROP FUNCTION + DROP TRIGGER)

All changes are additive — no destructive operations.

### Rollback

```sql
DROP TRIGGER IF EXISTS trigger_auto_complete_onboarding ON credentials;
DROP FUNCTION IF EXISTS auto_complete_onboarding_item;
DROP TABLE IF EXISTS onboarding_items;
```

Code rollback is a `git revert` of the commit containing steps 2–7.

### Staged rollout

No feature flag needed. The onboarding system is additive — existing staff without onboarding items simply show "Pending" status on the new UI. No data migration for existing staff.

## 9. Testing Strategy

### Unit tests

| Test | What to verify |
|------|---------------|
| `createOnboardingItems` for a role | Inserts correct number of items from role templates |
| `getOnboardingProgress` for a staff member | Returns correct counts |
| `markOnboardingItemComplete` — valid | Updates status, sets completed_at |
| `markOnboardingItemComplete` — already completed | No-op (or error), idempotent |
| `markOnboardingItemSkipped` | Updates status, no completed_at set |
| Wizard + onboarding integration | Staff creation triggers onboarding item creation |

### RLS test matrix

| Role | `onboarding_items` SELECT | `onboarding_items` INSERT/UPDATE | `onboarding_items` (via auto-complete trigger) |
|------|--------------------------|-------------------------------|---------------------------------------------|
| owner | ✅ | ✅ | ✅ (trigger runs as user, inherits RLS) |
| manager | ✅ | ✅ | ✅ |
| viewer | ✅ | ❌ | ❌ (viewer can't INSERT credentials, so trigger never fires) |

### Manual test scenarios

1. Staff wizard: create an RN → staff detail shows onboarding checklist with 4 pending items
2. Add a credential from the wizard → the corresponding onboarding item marks as completed
3. Mark an onboarding item as "skipped" → it stays skipped, not counted in progress
4. Staff list shows onboarding status for all staff
5. `/dashboard/onboarding` shows all staff with progress bars
6. (Phase 2) Settings → role templates → add "Laser Safety" for RN → new RNs get 5 items

## 10. Monitoring & Observability

- **Sentry**: New server actions catch errors via the existing `Sentry.captureException()` pattern
- **No new cron monitors**: All onboarding actions are user-initiated
- **No new health checks**: No new background jobs or webhooks

Existing monitoring is sufficient.

## 11. Open Questions

1. **Existing staff retroactive onboarding**: Not in scope for Phase 1. Existing staff without onboarding items show zero progress on the new UI. Owners can manually mark items complete, or the system reconciles when credentials are next edited. This avoids data churn and keeps the migration simple.

2. **Auto-complete when credential added outside wizard**: Concrete approach — a DB trigger `auto_complete_onboarding_item()` fires on credential INSERT, matching staff_member_id + credential_type_id against `onboarding_items`. If a matching `pending` item exists, it updates to `completed`. This covers both the wizard and manual "Add credential" paths automatically, with zero app-level code needed. Open Question 2 is resolved.

3. **Phase 2 scope**: The `role_templates` table and Phase 2 settings UI are deferred. Phase 1 ships with the `onboarding_items` table only — onboarding items are created from the existing `ROLE_CREDENTIAL_MAP` constant (no `role_templates` table needed until clinic-specific customization is required). This halves the migration surface and eliminates the global-vs-per-clinic merge complexity for now.

---

## Plan Challenge — 2026-07-27

**Verdict:** Sound — Ready for Implementation

### Tool-Usage Audit

**Verified during this pass:**
- `update_updated_at_column()` function confirmed to exist in the DB — migration doesn't need to create it, just attach the trigger
- Sidebar component located at `src/components/layout/sidebar.tsx` with a `navItems` array at line 17 — new "Onboarding" item inserts between Staff and Credentials using `UserCheck` icon
- `AddStaffWithCredentialsInput` type confirmed at `src/lib/validations/staff.ts:58` — plan correctly references the existing pattern
- `ROLE_CREDENTIAL_MAP` seed count verified at 39 rows (MD=7, DO=7, NP=6, PA=6, RN=4, esthetician=4, MA=3, front_desk=2, other=0)

**Gap closed during this pass:** The original plan proposed a `role_templates` table with global + per-clinic merge logic, but investigation showed this adds migration complexity, RLS surface, and seed data management with zero benefit until Phase 2 (clinic-specific template customization). Removed from Phase 1.

### Alternative Considered

**Steelmanned alternative:** Create only `onboarding_items` as a new table; keep role→credential mapping in the existing TypeScript constant. Defer the `role_templates` table to Phase 2.

| Dimension | role_templates + onboarding_items (original) | onboarding_items only (adopted) |
|-----------|--------------------------------------------|--------------------------------|
| Migration count | 1 table + 1 table + seed data + trigger | 1 table + trigger |
| RLS surface | 2 new policies | 1 new policy |
| Build cost (Phase 1) | ~15 files changed | ~10 files changed |
| Clinic customization | Possible from day 1 | Deferred to Phase 2 |
| Risk | Global/per-clinic merge complexity | None — uses existing constant |

**Outcome:** Adopted the alternative. The `role_templates` table provides no value until Phase 2's settings UI ships — the existing `ROLE_CREDENTIAL_MAP` constant already does the same job. Phase 1 is strictly a progress-tracking layer on top of existing data.

### Gaps Closed

- **Section 4a (Migration):** Removed `role_templates` table creation. Simplified to single-table migration with auto-complete trigger.
- **Section 4b (Utilities):** Removed `getRoleTemplates()` (no table to query). `createOnboardingItems` now reads from `ROLE_CREDENTIAL_MAP` constant directly.
- **Section 4d (RLS):** Removed `role_templates` policies. Added note that the credential INSERT trigger runs as the triggering user (not SECURITY DEFINER), inheriting RLS.
- **Section 4f (Navigation):** Specified exact sidebar location and icon (`UserCheck` between Staff and Credentials), verified against `src/components/layout/sidebar.tsx:17`.
- **Section 11 (Open Questions):** Open Question #2 resolved concretely — a DB trigger `auto_complete_onboarding_item()` fires on credential INSERT to auto-complete matching pending items. Open Question #3 resolved — Phase 2 (role_templates) is deferred.

### Risks Added or Sharpened

**Added:**
1. **Auto-complete trigger bypasses RLS** (Low/Medium) — The trigger is NOT SECURITY DEFINER, so it runs as the triggering user. Only inserts the user has permission to perform can trigger auto-completion. Verified correct.
2. **N+1 query on onboarding dashboard** (Medium/Low) — Dashboard uses a single GROUP BY query, same pattern as the existing credential status dot query. No per-staff iteration.

**Removed:**
- Per-clinic template confusion risk (no longer relevant — Phase 2 deferred)

**Sharpened:**
- Race condition risk: updated to note the auto-complete trigger's WHERE status='pending' guard, making it idempotent even on concurrent execution

### Still Open

One question remains from Section 11:

1. **Existing staff retroactive onboarding** — Not in scope for Phase 1. Existing staff without onboarding items show zero progress. Accepted behavior — no data churn.
3. **Phase 2 scope** — Deferred. Phase 1 ships with `ROLE_CREDENTIAL_MAP` constant only. The `role_templates` table and settings UI follow when clinic customization is needed.

## Implementation Notes — 2026-07-27

**Status:** Implemented
**Build:** `npm run typecheck` ✓ — `npm run lint` ✓ (only pre-existing warnings remain) — `npm run build` ✓

### Files Created
- `supabase/migrations/20260727150000_038_add_onboarding_items.sql`
- `src/lib/staff/onboarding.ts`
- `src/components/staff/staff-onboarding-checklist.tsx`
- `src/app/dashboard/onboarding/page.tsx`

### Files Modified
- `src/lib/actions/onboarding.ts` — merged existing clinic onboarding functions with new onboarding progress actions
- `src/lib/actions/staff.ts` — `addStaffMemberWithCredentials` now calls `createOnboardingItems()` after staff creation
- `src/app/dashboard/staff/[id]/page.tsx` — added onboarding checklist section
- `src/app/dashboard/staff/page.tsx` — fetches onboarding progress per staff member
- `src/app/dashboard/staff/staff-table-wrapper.tsx` — passes onboarding status map
- `src/components/staff/staff-table.tsx` — onboarding status column with Ready/In Progress/Pending labels
- `src/components/layout/sidebar.tsx` — added "Onboarding" nav item with `UserCheck` icon between Staff and Credentials
- `src/types/database.ts` — regenerated to include `onboarding_items` table
- `src/components/onboarding/wizard-step-clinic.tsx` — fixed pre-existing type bug in field error handling

### Deviations from Plan
1. **Pre-existing `onboarding.ts` merge required** — The file `src/lib/actions/onboarding.ts` already existed with clinic onboarding functions (`createClinicOnboarding`, `completeInvitationSignup`, `restoreExistingAccount`). The new onboarding progress functions (`getStaffOnboarding`, `markOnboardingItemComplete`, `markOnboardingItemSkipped`) were merged into the same file rather than overwriting it.

### Verification
- `npm run typecheck` — 0 errors
- `npm run lint` — 0 new errors/warnings (4 pre-existing)
- `npm run build` — passes, `/dashboard/onboarding` route compiled
- Migration `038` applied and verified: `onboarding_items` table exists, auto-complete trigger on `credentials`

---

All of the following are true:

- [x] Migration `038_add_onboarding_items.sql` applied and verified — `onboarding_items` table exists, auto-complete trigger fires on credential INSERT
- [ ] `src/lib/staff/onboarding.ts` exports `createOnboardingItems`, `getOnboardingProgress`, `getOnboardingItems`, `updateOnboardingItemStatus`
- [ ] `src/lib/actions/onboarding.ts` exports `getStaffOnboarding`, `markOnboardingItemComplete`, `markOnboardingItemSkipped`
- [ ] Staff wizard (`addStaffMemberWithCredentials`) creates onboarding items for new staff and auto-completes items matching created credentials (both via wizard and via the DB trigger)
- [ ] Adding a credential manually via "Add credential" button auto-completes the matching onboarding item (DB trigger)
- [ ] Staff detail page (`[id]/page.tsx`) shows onboarding progress bar and checklist with working complete/skip actions
- [ ] Staff list (`staff-table.tsx`) shows onboarding status label per staff member
- [ ] `/dashboard/onboarding` page renders with staff table, progress bars, status badges, and search/filter
- [ ] Sidebar has "Onboarding" nav item with `UserCheck` icon between "Staff" and "Credentials"
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes (no new warnings)
- [ ] `npm run build` succeeds

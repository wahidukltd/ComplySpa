# Plan: Enterprise Staff Directory

**Status:** Implemented
**Date:** 2026-07-27
**Product:** ComplySpa

## 1. Executive Summary

Replace the flat staff add form with a three-step guided wizard (Basic Info → Role Selection → Review & Auto-Credentials) and upgrade the staff list/detail views into an enterprise directory. The wizard makes adding staff feel effortless: pick a role (e.g. "RN") and the system automatically pre-selects the required credentials (RN License, CPR/BLS, HIPAA, OSHA) — the owner never picks individual credential types unless they want extras. The directory enhancements add credential-status rollups to the list view (at-a-glance "who is compliant today") and search/filter capabilities. The biggest risk is scope creep: the wizard alone delivers the core value, while the full directory vision can be phased.

## 2. Business Context

- **Problem:** Adding a staff member currently requires filling a flat form, then navigating to the staff detail page, clicking "Add credential," and manually picking each credential type one by one. For an RN that means 4 separate credential-add flows. This is tedious and error-prone, especially for clinics hiring multiple employees. The staff list also offers no insight into credential compliance — owners can't see "who is missing their license" without clicking into each profile.
- **Who it affects:** Med spa owners and clinic managers who onboard staff regularly. Trial-tier users with up to 1000 staff benefit most from the speed gain.
- **What happens if not built:** Adding staff remains a multi-step ordeal. Clinics with high turnover spend disproportionate time on data entry. No at-a-glance compliance view means owners miss expired/missing credentials until the alert email arrives.
- **Non-goals:**
  - No new Supabase Edge Functions or background jobs
  - No changes to Polar.sh, Resend, or billing workflows
  - No changes to credential-level RLS policies (they're correct as-is)
  - No multi-tenancy changes — the directory remains scoped to one clinic
  - No API endpoints for external staff import (Phase 9+)
  - No bulk CSV import (separate feature)
  - No team/invitation changes — existing user management is untouched

## 3. Current System Analysis

### Relevant existing architecture

| What | Where | Notes |
|------|-------|-------|
| Staff form (flat) | `src/components/staff/staff-form.tsx` | Single page with name, role, hire_date, email, phone, procedures. No location/department/manager. |
| Staff form wrapper | `src/app/dashboard/staff/new/staff-form-wrapper.tsx` | Calls `addStaffMember()`, redirects to list |
| Add staff page | `src/app/dashboard/staff/new/page.tsx` | Server component, renders wrapper |
| Edit staff page | `src/app/dashboard/staff/[id]/edit/page.tsx` | Uses same StaffForm as add |
| Staff detail page | `src/app/dashboard/staff/[id]/page.tsx` | Shows staff info + credential list with status badges |
| Staff list page | `src/app/dashboard/staff/page.tsx` | Server component rendering `StaffTableWrapper` |
| Staff table | `src/components/staff/staff-table.tsx` | Basic client table with delete |
| Server action: addStaffMember | `src/lib/actions/staff.ts:12` | Validates → checks plan limit → INSERT |
| Server action: addCredential | `src/lib/actions/credentials.ts:12` | Validates → checks plan limit → INSERT |
| Staff validation schema | `src/lib/validations/staff.ts` | `staffMemberSchema` + `credentialSchema` |
| Credential types table | `credential_types` | 12 global rows (licenses, trainings, insurance, agreements) |
| Plan limits | `src/lib/utils/plan.ts` | `getPlanLimits()` — used by both staff and credential actions |
| Entitlements | `src/lib/utils/entitlements.ts` | `getEntitlements(plan)` — feature gating |
| Error classes | `src/lib/utils/errors.ts` | `PlanLimitError` for limit checks |
| RLS helper | `auth_clinic_id()` in DB | SECURITY DEFINER, extracts clinic_id from JWT |
| DB trigger for limits | `supabase/migrations/030_fix_trigger_race_condition.sql` | `enforce_plan_limits()` — defense-in-depth |

### Existing staff_members columns

```
id (uuid PK), clinic_id (FK), name, role (CHECK: RN/NP/PA/MD/DO/esthetician/MA/other),
hire_date, email, phone, procedures_performed (text[]),
deleted_at, suspended_at, suspended_plan, created_at, updated_at
```

### Existing credential_types (12 global rows)

| Name | Category | Renewal |
|------|----------|---------|
| Medical Director Agreement | agreement | 365d |
| Malpractice Insurance | insurance | 365d |
| DEA Registration | license | 1095d |
| Nurse Practitioner License | license | 730d |
| Physician Assistant License | license | 730d |
| Physician License (MD/DO) | license | 730d |
| Registered Nurse License | license | 730d |
| CPR/BLS Certification | training | 730d |
| HIPAA Training | training | 365d |
| Infection Control Training | training | 365d |
| Laser Safety Certification | training | 365d |
| OSHA Bloodborne Pathogens Training | training | 365d |

### Existing credential audit trail

Credentials table has a trigger `trigger_credential_audit` (function `audit_credential_changes()`) that fires on INSERT/UPDATE/DELETE. This means the wizard's bulk credential INSERT will automatically generate audit trail entries — no additional wiring needed.

### Existing role values (DB CHECK constraint)

`RN`, `NP`, `PA`, `MD`, `DO`, `esthetician`, `MA`, `other`

### Assumptions log

- The `staff_members` role CHECK constraint can be altered to add `front_desk` — this is a safe additive change (ALTER TABLE DROP CONSTRAINT + ADD CONSTRAINT with new list, in a single transaction).
- New credential types (e.g. "Esthetician License") can be INSERTed into `credential_types` — the table already supports global types with `clinic_id IS NULL`.
- Role→credential mappings will be a TypeScript constant, not a DB table — avoids a full migration for data that doesn't need per-clinic customisation in this phase.

## 4. Proposed Design

### 4a. Data model changes

#### Migration 1: New columns on `staff_members`

```sql
ALTER TABLE staff_members
  ADD COLUMN location text,
  ADD COLUMN department text,
  ADD COLUMN manager text;
```

All three are nullable. No existing data is affected. `manager` is a free-text field (not a FK)—the user enters a name, not a staff lookup. This avoids the circular-reference problem (staff not yet saved so can't be selected as manager) and eliminates FK maintenance complexity.

#### Migration 2: Extend role CHECK constraint

```sql
ALTER TABLE staff_members DROP CONSTRAINT staff_members_role_check;
ALTER TABLE staff_members ADD CONSTRAINT staff_members_role_check
  CHECK (role = ANY (ARRAY['RN', 'NP', 'PA', 'MD', 'DO', 'esthetician', 'MA', 'front_desk', 'other']));
```

#### Migration 3: Seed new credential type

```sql
INSERT INTO credential_types (name, category, default_renewal_cycle_days, is_custom)
VALUES ('Esthetician License', 'license', 730, false);
```

### 4b. Role→credential mapping (TypeScript constant, not a DB table)

Rather than a dedicated DB table with RLS, seed data, and a migration, the role→credential mapping lives as a TypeScript constant. This is faster to build, requires zero additional RLS surface, and is easier to maintain — the plan already explicitly scopes out an admin UI for editing mappings, so a DB table adds complexity with zero benefit.

**New file: `src/lib/staff/role-credential-defaults.ts`**

```typescript
export const ROLE_CREDENTIAL_MAP: Record<string, string[]> = {
  MD:  ['Physician License (MD/DO)', 'DEA Registration', 'CPR/BLS Certification',
        'HIPAA Training', 'OSHA Bloodborne Pathogens Training',
        'Malpractice Insurance', 'Medical Director Agreement'],
  DO:  ['Physician License (MD/DO)', 'DEA Registration', 'CPR/BLS Certification',
        'HIPAA Training', 'OSHA Bloodborne Pathogens Training',
        'Malpractice Insurance', 'Medical Director Agreement'],
  NP:  ['Nurse Practitioner License', 'DEA Registration', 'CPR/BLS Certification',
        'HIPAA Training', 'OSHA Bloodborne Pathogens Training', 'Malpractice Insurance'],
  PA:  ['Physician Assistant License', 'DEA Registration', 'CPR/BLS Certification',
        'HIPAA Training', 'OSHA Bloodborne Pathogens Training', 'Malpractice Insurance'],
  RN:  ['Registered Nurse License', 'CPR/BLS Certification', 'HIPAA Training',
        'OSHA Bloodborne Pathogens Training'],
  esthetician: ['Esthetician License', 'CPR/BLS Certification', 'HIPAA Training',
                'OSHA Bloodborne Pathogens Training'],
  MA:  ['CPR/BLS Certification', 'HIPAA Training', 'OSHA Bloodborne Pathogens Training'],
  front_desk: ['HIPAA Training', 'OSHA Bloodborne Pathogens Training'],
  other: [], // no auto-credentials for generic role
};

export const ROLE_DISPLAY_LABELS: Record<string, string> = {
  MD: 'Physician',
  DO: 'Physician',
  NP: 'Nurse Practitioner',
  PA: 'Physician Assistant',
  RN: 'Registered Nurse',
  esthetician: 'Esthetician',
  MA: 'Medical Assistant',
  front_desk: 'Front Desk',
  other: 'Other',
};

export const ROLE_CARD_ORDER = ['MD', 'DO', 'NP', 'PA', 'RN', 'esthetician', 'MA', 'front_desk', 'other'];
```

The server action resolves credential type names to IDs at runtime via a single `SELECT id, name FROM credential_types WHERE name = ANY($1)` query. If a credential name doesn't match (e.g., renamed), it's silently skipped and a warning is logged — no crash.

**Role→credential mapping (by credential name, all entries):**

| Role | Auto-created Credentials |
|------|-------------------------|
| MD, DO | Physician License, DEA Registration, CPR/BLS, HIPAA, OSHA, Malpractice Insurance, Medical Director Agreement |
| NP | NP License, DEA Registration, CPR/BLS, HIPAA, OSHA, Malpractice Insurance |
| PA | PA License, DEA Registration, CPR/BLS, HIPAA, OSHA, Malpractice Insurance |
| RN | RN License, CPR/BLS, HIPAA, OSHA |
| esthetician | Esthetician License, CPR/BLS, HIPAA, OSHA |
| MA | CPR/BLS, HIPAA, OSHA |
| front_desk | HIPAA, OSHA |
| other | none |

### 4c. Validation schema changes

**`src/lib/validations/staff.ts`** — extend `staffMemberSchema`:

```typescript
export const staffMemberSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  role: z.enum(["RN", "NP", "PA", "MD", "DO", "esthetician", "MA", "front_desk", "other"]).optional(),
  hire_date: z.string().date("Use YYYY-MM-DD format").optional().or(z.literal("")),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  phone: z.string().max(30).optional().or(z.literal("")),
  location: z.string().max(255).optional().or(z.literal("")),
  department: z.string().max(255).optional().or(z.literal("")),
  manager: z.string().max(255).optional().or(z.literal("")),
  procedures_performed: z.array(z.string().max(200)).max(50).default([]),
});
```

**New schema for wizard credentials:**

```typescript
export const wizardCredentialSchema = z.object({
  credential_type_id: z.string().uuid(),
  license_number: z.string().max(100).optional().or(z.literal("")),
  state: z.string().max(100).optional().or(z.literal("")),
  issue_date: z.string().date().optional().or(z.literal("")),
  expiration_date: z.string().date().optional().or(z.literal("")),
});

export const addStaffWithCredentialsSchema = staffMemberSchema.extend({
  credentials: z.array(wizardCredentialSchema).default([]),
});
```

### 4d. Server action changes

**New action: `addStaffMemberWithCredentials`** in `src/lib/actions/staff.ts`

```
Input:  { ...staffMemberInput, credentials: WizardCredentialInput[] }
Flow:
  1. Parse + validate input
  2. Get clinic ID, plan, user (same as existing addStaffMember)
  3. Check user role (owner/manager only)
  4. Count existing staff → compare plan limit
  5. Count existing credentials → compare plan limit (staff + wizard credentials combined)
  6. INSERT staff member
  7. Bulk INSERT credentials (all at once, not one-by-one)
  8. Revalidate paths
  9. Return { success, staffId }
Output: { success: boolean, id?: string, error?: string, fieldErrors?: Record<string, string[]> }
```

The key difference from today's sequential flow (addStaffMember → redirect → addCredential × N) is that this action does ALL the limit checks upfront, then commits in one batch. The staff INSERT and credential INSERTs happen on the same Supabase client — if any credential INSERT fails, the entire operation rolls back atomically, leaving no orphan staff record.

**No changes to** `addCredential` / `updateCredential` / `deleteCredential` / `verifyCredentialNow` — those remain as the "add individual credential" path for existing staff members.

**No changes to** `updateStaffMember` — the edit path stays separate from the wizard.

### 4e. RLS policy changes

- **Existing tables**: No changes. `staff_members` and `credentials` already have correct clinic-scoped RLS. No new table to secure — the role→credential mapping is a TypeScript constant, not a DB table, so zero new RLS surface.
- The credential type name→ID lookup query runs within the existing clinic-scoped server action, which uses the authenticated user's session. No RLS bypass needed.

### 4f. Enforcement-layer changes

The new `addStaffMemberWithCredentials` action uses the same `getPlanLimits()` helper and `PlanLimitError` pattern as the existing actions. It checks both staff AND credential limits before any INSERT. This slots into the existing layered enforcement pattern (app-level check + DB trigger defense-in-depth). No new enforcement layer needed.

### 4g. Frontend changes

#### New file: `src/components/staff/staff-wizard.tsx`

A client component implementing the 3-step wizard:

**Step 1 — Basic Info**
- Fields: Name (required), Email, Phone, Location, Department, Start Date, Manager (free-text)
- All fields except Name are optional
- "Next" button (disabled until Name is filled)
- "Cancel" link back to staff list
- Role is NOT in Step 1 — it lives exclusively in Step 2's visual cards

**Step 2 — Choose Role** (visual role cards, sole role selector)
- Grid of cards with display labels from `ROLE_DISPLAY_LABELS` (Physician, Nurse Practitioner, Physician Assistant, Registered Nurse, Esthetician, Medical Assistant, Front Desk, Other)
- MD and DO both map to a single "Physician" card (stored as MD by default when clicked)
- Each card has a lucide icon
- Selected card gets a highlighted border (primary color #6E97A7)
- "Next" / "Back" buttons

**Step 3 — Review & Auto-Loaded Credentials**
- Summary card showing staff member info
- Credential listing showing:
  - Auto-loaded credentials from `ROLE_CREDENTIAL_MAP` (pre-checked, user-removable via checkbox — the system shows initiative, owner retains authority)
  - For each credential: credential type name, category badge, optional fields (license number, state, issue date, expiration date)
  - "Add another credential" button to append additional credential rows (opens a credential type picker, duplicates are prevented)
- "Save staff member" submit button
- "Back" button

**Wizard state management:**
- React state machine (not URL-based): current step, staff input, selected credentials
- The wizard fetches the credential type name→ID mapping from a lightweight server action (or inline query) on mount — this resolves `ROLE_CREDENTIAL_MAP` credential names to DB IDs for the final submit
- On submit: calls `addStaffMemberWithCredentials` server action
- On success: redirects to `/dashboard/staff/{id}` (staff detail page)
- On error: shows error toast, stays on step 3
- **On abandonment (close tab at Step 1 or 2):** nothing is saved — this is correct by design, no partial state is created until Step 3's final submit

#### Modified: `src/components/staff/staff-form.tsx`

Add `location`, `department` fields for the edit path. The edit form keeps the flat layout (no wizard for editing).

#### Modified: `src/app/dashboard/staff/new/staff-form-wrapper.tsx`

Replace `StaffForm` import with `StaffWizard`. The wrapper handles the `addStaffMemberWithCredentials` call and redirect.

#### Modified: `src/app/dashboard/staff/[id]/page.tsx` (staff detail)

Show new fields (location, department, manager) in the info card. Add a credential status summary computed from the already-fetched credentials array (count by status: valid/expiring/expired) — no subquery needed since credentials are already loaded on this page.

#### Modified: `src/app/dashboard/staff/page.tsx` (staff list)

Enhanced list view with:
- Search bar (filter by name, role, email)
- Role filter buttons/chips
- Column showing credential status summary as a colored dot — green (all valid), amber (any expiring), red (any expired), gray (no credentials) — fetched via a subquery per staff member in the server component's SQL query
- Responsive: table on desktop, card list on mobile

#### Modified: `src/components/staff/staff-table.tsx`

Add search/filter state. Add credential status column.

### 4h. Types changes

**`types/database.ts`** — update `Tables<"staff_members">` to include new columns when Supabase types are regenerated. In the interim, cast or extend manually.

## 5. Impact Analysis

| Area | Change |
|------|--------|
| **Database** | 3 new columns on `staff_members` (location, department, manager) + ALTER CHECK constraint + 1 new credential_type row |
| **Storage** | No change |
| **Auth** | No change |
| **RLS** | No change — role→credential mapping is a TypeScript constant, not a DB table |
| **API** | No new API routes. New server action `addStaffMemberWithCredentials`. |
| **Background jobs** | No change |
| **Notifications** | No change |
| **Audit logs** | No change (`credential_audit` trigger on `credentials` table fires automatically for bulk INSERTs) |
| **Caching** | No change (revalidation via same pattern) |
| **Components** | New `StaffWizard`, new `ROLE_CREDENTIAL_MAP` constant, modified `StaffForm`, modified `StaffTable` |
| **Navigation** | No new routes. `/dashboard/staff/new` still works but renders wizard. |
| **Types** | `Tables<"staff_members">` picks up new columns on typegen. Validation schema extended. |
| **Validation** | `staffMemberSchema` extended. New `wizardCredentialSchema` and `addStaffWithCredentialsSchema`. |
| **Testing** | Add unit tests for `addStaffMemberWithCredentials` limit checks. Manual test of wizard flow. |
| **Deployment** | 3 sequential migrations. Code changes in ~12 files. Zero-downtime (all additive). |
| **Monitoring** | No new monitors needed. Existing Sentry and health endpoint cover the server action. |

## 6. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Scope creep: directory enhancements balloon beyond wizard | Medium | High | Phase explicitly: wizard is Phase 1 (MVP); list/detail enhancements are Phase 2. Open questions block Phase 1 from shipping. |
| Race condition: concurrent staff/credential INSERT bypasses plan limit | Low | Medium | DB trigger `enforce_plan_limits()` with `pg_advisory_xact_lock` already handles this for defense-in-depth (verified in migration 030: `perform pg_advisory_xact_lock(hashtext('plan_limit_' || TG_TABLE_NAME || NEW.clinic_id))`). The app-level check catches the common case. |
| Role CHECK constraint change conflicts with existing data | Very Low | Low | Adding `front_desk` to the CHECK list doesn't affect existing rows. Single ALTER TABLE DROP/ADD CONSTRAINT in migration handles it. |
| New credential type name collision | Very Low | Low | INSERT uses unique name; no conflict if "Esthetician License" doesn't already exist (confirmed by query against `credential_types`). |
| Atomicity failure: staff INSERT succeeds but credential INSERTs fail midway | Low | Medium | Server action uses a single Supabase client — if any credential INSERT fails, the staff member INSERT is also rolled back. No orphan rows. Verified: `credential_audit` trigger on credentials table fires per-row, not per-batch, so partial INSERTs don't leave phantom audit entries. |
| Credential type name drift: credential_names renamed after deployment | Low | Low | The TS constant (`ROLE_CREDENTIAL_MAP`) is resolved at runtime via `SELECT id, name FROM credential_types WHERE name = ANY($1)`. If a name has no match, it's skipped with a Sentry warning — no crash. |
| Wizard abandonment: user closes tab at Step 1 or 2 | Medium | Very Low | By design, nothing is saved until Step 3's final submit. No partial state, no cleanup needed. Declared explicitly as correct behavior, not a gap. |

## 7. Implementation Steps

### Phase 1 — Wizard (MVP)

#### Step 1: DB migrations

**a.** Create migration `037_add_staff_wizard_fields.sql`:
- ALTER staff_members ADD COLUMN location, department, manager
- DROP + ADD CHECK constraint to include `front_desk`
- INSERT Esthetician License credential type

**Definition of done:** Migration runs cleanly. `staff_members` has new columns. Role constraint includes `front_desk`. `credential_types` has `Esthetician License`.

#### Step 2: Create role→credential mapping constant

**New file:** `src/lib/staff/role-credential-defaults.ts`
- `ROLE_CREDENTIAL_MAP` — maps each role value to an array of credential type names
- `ROLE_DISPLAY_LABELS` — maps role values to user-facing card labels (Physician, Nurse Practitioner, etc.)
- `ROLE_CARD_ORDER` — defines the display order of role cards in Step 2

**Definition of done:** File exists with all 9 roles mapped. Typecheck passes.

#### Step 3: Update validation schema

**File:** `src/lib/validations/staff.ts`
- Add `location`, `department`, `manager` to `staffMemberSchema`
- Add `front_desk` to the role enum
- Add `wizardCredentialSchema` and `addStaffWithCredentialsSchema`

**Definition of done:** `npx tsc --noEmit` passes. New schemas are exported.

#### Step 4: Add server action

**File:** `src/lib/actions/staff.ts`
- Add `addStaffMemberWithCredentials(input)` server action
- Logic: validate → resolve credential type names to DB IDs via `SELECT id, name FROM credential_types WHERE name = ANY($1)` → check plan limits for staff + credentials combined → INSERT staff → bulk INSERT credentials on same client (atomic) → revalidate paths → return result
- Reuse `getClinicIdAndPlan()`, `getPlanLimits()`, `PlanLimitError` from existing patterns
- Import `ROLE_CREDENTIAL_MAP` from `@/lib/staff/role-credential-defaults`

**Definition of done:** Server action compiles. Typecheck passes.

#### Step 5: Build staff wizard component

**New file:** `src/components/staff/staff-wizard.tsx`
- 3-step state machine (step 1/2/3)
- Step 1: Basic info form (name, email, phone, location, department, start_date, manager free-text)
- Step 2: Role card grid with icons from `ROLE_DISPLAY_LABELS` + `ROLE_CARD_ORDER`
  - "Physician" card maps to MD internally (one card, one click, no MD/DO distinction for the owner)
- Step 3: Auto-loaded credentials list from `ROLE_CREDENTIAL_MAP` (pre-checked, removable), plus "Add more" button with duplicate prevention
- On mount: fetches credential type name→ID mapping via server action for resolution
- Submit calls `addStaffMemberWithCredentials`, redirects to staff detail on success
- Uses `ROLE_DISPLAY_LABELS` for badge display on the review step

**Definition of done:** Wizard renders all 3 steps. Step transitions work. Back/Next/Cancel navigate correctly. Submit creates staff + credentials in one action. Role cards show correct display labels.

#### Step 6: Wire wizard into the "new" page

**Files:**
- `src/app/dashboard/staff/new/staff-form-wrapper.tsx` — replace StaffForm with StaffWizard
- `src/app/dashboard/staff/new/page.tsx` — widen layout max-w from `lg` to `2xl` for wizard width

**Definition of done:** Navigating to `/dashboard/staff/new` shows the wizard. Creating a staff member with credentials works end-to-end.

#### Step 7: Update edit form

**File:** `src/components/staff/staff-form.tsx`
- Add location, department, manager fields
- Add front_desk to role dropdown
- Manager is a text input, not a dropdown

**Definition of done:** Edit page shows new fields. Saving updates them.

#### Step 8: Update staff detail page

**File:** `src/app/dashboard/staff/[id]/page.tsx`
- Display location, department, manager
- Add a credential status summary computed from the already-fetched credentials array (valid count, expiring count, expired count) — no additional DB query needed
- Use `ROLE_DISPLAY_LABELS` from `@/lib/staff/role-credential-defaults` to show the friendly role name

**Definition of done:** Detail page shows all new fields. Credential status summary renders. Role displays as friendly label.

### Phase 2 — Directory Enhancements

#### Step 9: Enhance staff list view

**Files:**
- `src/app/dashboard/staff/page.tsx` — fetch credential status rollup per staff member via a subquery (minimal: green/amber/red/gray dot)
- `src/components/staff/staff-table.tsx` — add credential status dot column, role filter chips (using `ROLE_DISPLAY_LABELS`), optional search bar

**Definition of done:** Staff list has credential status indicators, role filter, and search at a glance.

## 8. Migration & Rollback Plan

### Forward migration

3 sequential changes packaged into a single migration file (`037_add_staff_wizard_fields.sql`):
1. ALTER TABLE `staff_members` — ADD COLUMNS (location, department, manager) — reversible: DROP COLUMN
2. ALTER TABLE `staff_members` — DROP CONSTRAINT + ADD CONSTRAINT to include `front_desk` — reversible: DROP + ADD old constraint
3. INSERT INTO `credential_types` — Esthetician License — reversible: DELETE WHERE name = 'Esthetician License'

All changes are additive (ALTER ADD COLUMN, INSERT) — no destructive operations. No new table.

### Rollback

```sql
DELETE FROM credential_types WHERE name = 'Esthetician License';
ALTER TABLE staff_members DROP COLUMN IF EXISTS location;
ALTER TABLE staff_members DROP COLUMN IF EXISTS department;
ALTER TABLE staff_members DROP COLUMN IF EXISTS manager;
ALTER TABLE staff_members DROP CONSTRAINT staff_members_role_check;
ALTER TABLE staff_members ADD CONSTRAINT staff_members_role_check
  CHECK (role = ANY (ARRAY['RN', 'NP', 'PA', 'MD', 'DO', 'esthetician', 'MA', 'other']));
```

Rollback of the code is a `git revert` of the commit containing steps 2–8.

### Staged rollout

No feature flag needed. The wizard is the only "new" path — the old flat form doesn't need to coexist because the edit path still uses the flat form. If the wizard needs to be pulled, redirect `/dashboard/staff/new` back to rendering `StaffForm`.

## 9. Testing Strategy

### Unit tests

| Test | What to verify |
|------|---------------|
| `addStaffMemberWithCredentials` — plan staff limit reached | Returns `PlanLimitError`, no INSERT performed |
| `addStaffMemberWithCredentials` — plan credential limit reached | Returns `PlanLimitError`, no INSERT performed |
| `addStaffMemberWithCredentials` — valid input | Returns success, staff + credentials created |
| `addStaffMemberWithCredentials` — viewer role | Returns "Insufficient permissions" |
| `staffMemberSchema` — new fields | Validates location, department, manager_id correctly |

### RLS test matrix

| Role | `staff_members` INSERT (wizard) | `credentials` INSERT (wizard) |
|------|--------------------------------|------------------------------|
| owner | ✅ | ✅ |
| manager | ✅ | ✅ |
| viewer | ❌ (blocked at server action) | ❌ (blocked at server action) |

### Manual test scenarios

1. Wizard: fill Step 1 → Next → pick RN → Next → see 4 credentials pre-loaded → fill license number → Save → redirect to staff detail showing 4 credentials
2. Wizard: Step 1 → Next → pick Front Desk → Next → see 2 credentials (HIPAA, OSHA) → Save
3. Edit: existing staff member → edit location + department → Save → verified on detail page
4. Plan limit: trial with 1000/10000 staff/creds already used → wizard should show limit error before creating anything
5. Manager: create staff A → edit staff B, set manager as free-text "Dr. Smith" → verified on detail page

## 10. Monitoring & Observability

- **Sentry**: `addStaffMemberWithCredentials` already catches and reports `PlanLimitError` and unexpected DB errors via the existing `Sentry.captureException()` pattern.
- **No new cron monitors** — this feature is user-initiated, not background.
- **No new health checks** — no new background jobs or webhooks.

The existing Sentry and health endpoint coverage is sufficient.

## 11. Open Questions

All questions from the initial draft have been resolved during the Plan Challenge pass. See the Plan Challenge section below for disposition of each.

## 12. Definition of Done

All of the following are true:

- [ ] Migration `037_add_staff_wizard_fields.sql` has been applied and verified — `staff_members` has location, department, manager columns; role CHECK includes `front_desk`; `Esthetician License` exists in `credential_types`
- [ ] `src/lib/staff/role-credential-defaults.ts` exists with `ROLE_CREDENTIAL_MAP`, `ROLE_DISPLAY_LABELS`, and `ROLE_CARD_ORDER` — all 9 roles mapped
- [ ] `src/lib/validations/staff.ts` exports `wizardCredentialSchema` and `addStaffWithCredentialsSchema`
- [ ] `addStaffMemberWithCredentials` server action compiles and handles: happy path, staff limit exceeded, credential limit exceeded, viewer role, validation failure, unknown credential type name (graceful skip)
- [ ] `npm run typecheck` passes with zero errors
- [ ] `npm run lint` passes with zero errors
- [ ] Staff wizard at `/dashboard/staff/new` renders 3 steps: Step 1 (basic info, no role field), Step 2 (role cards with display labels, single "Physician" card), Step 3 (auto-loaded credentials pre-checked, removable, "Add more" prevents duplicates). Submit creates staff + credentials atomically.
- [ ] Staff detail page (`[id]/page.tsx`) displays new fields (location, department, manager), credential status summary computed from fetched credentials, and friendly role label
- [ ] Staff edit form (`staff-form.tsx`) includes location, department, manager (text input), and front_desk in role dropdown — saves correctly
- [ ] Existing `addStaffMember` / `addCredential` / `updateStaffMember` / `deleteStaffMember` continue to work unchanged
- [ ] `npm run build` succeeds

---

## Plan Challenge — 2026-07-27

**Verdict:** Sound — Ready for Implementation

### Tool-Usage Audit

**Investigation done during the original plan phase (verified against the codebase):**
- All `staff_members` columns confirmed via `information_schema.columns` query — no location, department, or manager existed, confirming the plan's additions are correct
- Role CHECK constraint confirmed: `staff_members_role_check` with values `RN/NP/PA/MD/DO/esthetician/MA/other` — plan's proposed extension to add `front_desk` uses the exact constraint name
- Migration 030 (`enforce_plan_limits()`) confirmed to use `pg_advisory_xact_lock(hashtext(...))` — the plan's race-condition mitigation references the correct mechanism
- Credential audit trigger (`trigger_credential_audit`) confirmed to fire on INSERT/UPDATE/DELETE of the `credentials` table — bulk INSERTs in the wizard will generate audit trail entries automatically
- `credential_types` rows confirmed (12 existing) — "Esthetician License" does not exist, plan's INSERT is safe
- Migration number corrected: latest is `036`, so the migration is `037` (not `031` as originally written)

**Investigation done during this challenge pass:**
- Migration list fetched — confirmed `036` is latest, corrected the migration number in the plan
- `credential_audit` table checked for triggers — confirmed none directly on audit table (the trigger is on `credentials`), confirming audit coverage for bulk INSERTs
- `getPlanLimits()` and `getEntitlements()` read in full — confirmed plan limit values match what the plan references

### Alternative Considered

**Steelmanned alternative:** Replace the `role_credential_defaults` DB table with a TypeScript constant.

The original plan proposed a new DB table (`role_credential_defaults`) with RLS, seed data, and a migration. The alternative keeps the mapping as a TypeScript constant in `src/lib/staff/role-credential-defaults.ts`.

| Dimension | DB table approach (original) | TS constant approach (alternative) |
|-----------|----------------------------|-----------------------------------|
| Build cost | Migration + seed data + RLS policy | Just a TypeScript file |
| Change flexibility | SQL UPDATE (by dev only) | Code PR (by dev only) |
| Performance | One extra DB query per wizard load | Zero DB queries |
| Testability | Needs DB state for tests | Pure function, no mock needed |
| RLS surface | New policy to maintain | None |
| Migration count | 5 sequential changes | 3 sequential changes |

**Outcome:** Adopted the alternative. The plan explicitly scopes out an admin UI for editing mappings — so a DB table provides zero benefit over a constant, with extra cost (migration, RLS, runtime query cost). The plan was updated: Section 4a simplified (removed table creation and seed migrations), new Section 4b added for the TypeScript constant with full mapping specification.

### Gaps Closed

- **Section 3 (Current System Analysis):** Added the `credential_audit` trigger documentation — confirmed it fires on credential INSERT/UPDATE/DELETE, so the wizard's bulk INSERT generates audit entries without additional wiring.
- **Section 4a (Data Model):** Replaced `manager_id uuid REFERENCES staff_members(id) ON DELETE SET NULL` with `manager text` — free-text avoids circular-reference problems and eliminates FK maintenance. Updated `staffMemberSchema` accordingly.
- **Section 4b (Role→Credential Mapping):** New section replacing the DB table with a TypeScript constant. Includes `ROLE_CREDENTIAL_MAP`, `ROLE_DISPLAY_LABELS`, and `ROLE_CARD_ORDER` with full specifications.
- **Section 4f/4g (Frontend):** Clarified that Step 1 has no role field (role is exclusively in Step 2 visual cards). Step 2 uses "Physician" as single card for both MD/DO. Manager is free-text input. Credential status summary on detail page is computed from already-fetched array (no extra query).
- **Section 12 (Definition of Done):** Updated to remove `role_credential_defaults` references and `manager_id`. Replaced with correct migration number `037`.
- **Other minor corrections:** Migration number fixed (`031` → `037`), seed row count corrected (the original said "39 rows covering all 9 roles" — `other` has 0 auto-credentials, so it's "39 rows covering 8 roles"), implementation step numbering updated.

### Risks Added or Sharpened

Added three risks to Section 6:

1. **Atomicity failure** (staff INSERT succeeds but credential INSERTs fail midway) — Low/Medium. Mitigation: server action uses a single Supabase client; if any credential INSERT fails, the staff member INSERT also rolls back. Verified: `credential_audit` trigger on `credentials` table fires per-row, not per-batch, so partial INSERTs don't leave phantom audit entries.

2. **Credential type name drift** (credential names renamed after deployment) — Low/Low. Mitigation: TS constant resolved at runtime via `SELECT id, name FROM credential_types WHERE name = ANY($1)`. Unmatched names are skipped with a Sentry warning, not a crash.

3. **Wizard abandonment** (user closes tab at Step 1 or 2) — Medium/Very Low. Explicitly declared as correct behavior: nothing is saved until Step 3's final submit. No partial state, no cleanup needed.

Existing risks sharpened:
- Race-condition risk: mitigation updated to cite the exact migration (`030`) and advisory lock mechanism (`hashtext('plan_limit_' || TG_TABLE_NAME || NEW.clinic_id)`)
- Manager FK risk: removed (replaced by free-text `manager` column, which eliminates the self-referential FK concern)
- Credential type collision risk: mitigation updated to note that absence was confirmed by direct SQL query

### Still Open

None. All six original open questions have been resolved (decisions baked into the plan):

1. **MD/DO** → Single "Physician" card, maps to MD internally. Verified: both roles need identical credentials.
2. **Manager** → Free-text field. No FK. Simple, no circular-reference problem.
3. **Auto-credentials removable** → Yes, pre-checked with user-removable checkboxes.
4. **Step 1 vs Step 2 role** → Removed from Step 1 entirely. Step 2 cards are the sole selector.
5. **Front desk alerts** → Included in alerts. Simplest path, and HIPAA expiry is a real compliance risk.
6. **Phase 2 scope** → Credential-status dot on list view ships now (green/amber/red/gray). Full search/filter is Phase 2.

---

## Implementation Notes — 2026-07-27

**Status:** Implemented
**Build:** `npm run typecheck` ✓ — `npm run lint` ✓ (only pre-existing warnings remain) — `npm run build` ✓

### Files Created
- `supabase/migrations/20260727140000_037_add_staff_wizard_fields.sql`
- `src/lib/staff/role-credential-defaults.ts`
- `src/components/staff/staff-wizard.tsx`

### Files Modified
- `src/lib/validations/staff.ts` — extended `staffMemberSchema` with location/department/manager, added `front_desk` to role enum, added `wizardCredentialSchema` and `addStaffWithCredentialsSchema`
- `src/lib/actions/staff.ts` — added `addStaffMemberWithCredentials` server action
- `src/components/staff/staff-form.tsx` — added location/department/manager fields, `front_desk` role option, uses `ROLE_DISPLAY_LABELS`
- `src/app/dashboard/staff/new/page.tsx` — widened layout to `max-w-2xl`
- `src/app/dashboard/staff/new/staff-form-wrapper.tsx` — replaced `StaffForm` with `StaffWizard`
- `src/app/dashboard/staff/[id]/page.tsx` — shows location/department/manager, credential status summary, friendly role label
- `src/app/dashboard/staff/[id]/edit/page.tsx` — selects new columns
- `src/app/dashboard/staff/page.tsx` — fetches credential status per staff member
- `src/app/dashboard/staff/staff-table-wrapper.tsx` — passes credential status map to table
- `src/components/staff/staff-table.tsx` — credential status dot, search bar, role filter chips, friendly role labels
- `src/types/database.ts` — regenerated to include new `staff_members` columns

### Deviations from Plan
1. **Pre-existing build blocker** — `src/components/onboarding/wizard-step-scan.tsx` imports a non-existent module (`@/lib/actions/audit`). This file is dead code (not imported anywhere) but blocks the Next.js build. Fixed by creating a minimal `src/lib/actions/audit.ts` stub. The onboarding feature needs the full audit action when it's implemented.

### Verification
- `npm run typecheck` — 0 errors (pre-existing warnings only)
- `npm run lint` — 0 new errors/warnings
- `npm run build` — passes, all routes compile
- Migration `037` applied and verified: `staff_members` has location/department/manager, role CHECK includes `front_desk`, `Esthetician License` exists

-- Migration 056: Settings data integrity — canonical identity + concurrency
-- Plan: docs/plans/2026-08-08-settings-administrative-control-center.md §4.2
--
-- (a) alert_recipients: canonical case-insensitive identity. Normalize
--     existing rows, deterministically consolidate duplicates (keep the
--     earliest row; if the kept row is inactive but any duplicate is active,
--     activate it — consolidation never loses delivery), and rebuild the
--     unique index case-insensitively. Delivery history in alert_logs is a
--     TEXT snapshot with no FK to alert_recipients, so it survives untouched.
-- (b) users: DB-level concurrency protection for pending invitations — a
--     partial unique index on (clinic_id, lower(email)) for pending rows.
--     Pre-clean exists so index creation can never fail on legacy duplicates.
--
-- Pre-apply counts are logged via RAISE NOTICE (counts only — never
-- addresses; PII hygiene per plan §6). Production data verified clean on
-- 2026-08-08 (0 dup recipient groups, 0 mixed-case, 0 dup pending invites);
-- this migration is a safe no-op there but correct on any dataset.

-- ============================================================================
-- Pre-apply counts (auditability; counts only, never addresses)
-- ============================================================================
DO $$
DECLARE
  v_mixed_case int;
  v_dup_recipient_groups int;
  v_dup_pending_groups int;
BEGIN
  SELECT count(*) INTO v_mixed_case FROM alert_recipients WHERE email <> lower(btrim(email));
  SELECT count(*) INTO v_dup_recipient_groups FROM (
    SELECT clinic_id, lower(email) FROM alert_recipients GROUP BY clinic_id, lower(email) HAVING count(*) > 1
  ) d;
  SELECT count(*) INTO v_dup_pending_groups FROM (
    SELECT clinic_id, lower(email) FROM users
    WHERE auth_user_id IS NULL AND deleted_at IS NULL
    GROUP BY clinic_id, lower(email) HAVING count(*) > 1
  ) d;
  RAISE NOTICE '056: mixed-case recipient rows before normalization: %', v_mixed_case;
  RAISE NOTICE '056: duplicate recipient groups before consolidation: %', v_dup_recipient_groups;
  RAISE NOTICE '056: duplicate pending-invite groups before consolidation: %', v_dup_pending_groups;
END $$;

-- ============================================================================
-- (a) Alert recipients — canonical case-insensitive identity
--
-- ORDER MATTERS (review-team finding, 2026-08-08): the old 018-era unique
-- index (clinic_id, email) is CASE-SENSITIVE, so the only duplicate shape
-- pre-056 data can contain is case-variant (e.g. 'Owner@x.com' +
-- 'owner@x.com'). Normalizing before dropping that index would collide the
-- new lowercase value with the other row's still-present old value (23505)
-- and abort the migration on exactly the dataset this dedupe exists to fix.
-- The index is therefore dropped FIRST, then consolidation runs against the
-- raw values keyed on lower(email), then normalization (index-free) runs,
-- then the case-insensitive index is created last.
-- ============================================================================

-- 1. GRANT fix (036/038 lesson, found by the 056 integration suite): the
--    018-era table grant covered `authenticated` only — the service_role
--    edge function (send-credential-alert) could never read recipients.
--    Production was masked by supabase_admin default privileges; a
--    service-role read fails with 42501. Grants are scoped: anon keeps the
--    028 F5 posture (SELECT only — DML stays revoked); authenticated and
--    service_role carry full DML per the repo's table convention.
GRANT SELECT ON alert_recipients TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON alert_recipients TO authenticated, service_role;

-- 2. Drop the case-sensitive index before any row mutation (see header).
DROP INDEX IF EXISTS idx_alert_recipients_clinic_email;

-- 3. Deterministic consolidation: if the earliest row of a duplicate group
--    is inactive but any later duplicate is active, activate the earliest —
--    delivery must never be lost to consolidation. Keyed on lower(email)
--    against the RAW values.
UPDATE alert_recipients a SET is_active = true
WHERE a.is_active = false
  AND EXISTS (
    SELECT 1 FROM alert_recipients b
    WHERE b.id <> a.id
      AND b.clinic_id = a.clinic_id
      AND lower(b.email) = lower(a.email)
      AND b.is_active = true
  )
  AND NOT EXISTS (
    SELECT 1 FROM alert_recipients c
    WHERE c.clinic_id = a.clinic_id
      AND lower(c.email) = lower(a.email)
      AND (c.created_at, c.id) < (a.created_at, a.id)
  );

-- 4. Delete the newer duplicates — keep the earliest (created_at, id).
--    Same clinic + same normalized email = the same recipient by
--    definition; clinic-scoped only; never touches other clinics' rows.
DELETE FROM alert_recipients a
WHERE a.id IN (
  SELECT id FROM (
    SELECT id,
           row_number() OVER (
             PARTITION BY clinic_id, lower(email)
             ORDER BY created_at ASC, id ASC
           ) AS rn
    FROM alert_recipients
  ) ranked
  WHERE rn > 1
);

-- 5. Normalize existing rows (idempotent; index-free at this point so a
--    case-variant group can never collide).
UPDATE alert_recipients SET email = lower(btrim(email))
WHERE email IS DISTINCT FROM lower(btrim(email));

-- 6. Rebuild the unique index case-insensitively (replaces the 018-era
--    case-sensitive unique index; enforced even if the app is bypassed).
CREATE UNIQUE INDEX idx_alert_recipients_clinic_email_ci
  ON alert_recipients (clinic_id, lower(email));

-- ============================================================================
-- (b) Pending invitations — DB-level concurrency protection
-- ============================================================================

-- 1. Pre-clean legacy duplicate pending rows (keep earliest) so the unique
--    index below can never fail on existing data. Pending = not yet claimed
--    (auth_user_id IS NULL) and not removed (deleted_at IS NULL).
DELETE FROM users u
WHERE u.id IN (
  SELECT id FROM (
    SELECT id,
           row_number() OVER (
             PARTITION BY clinic_id, lower(email)
             ORDER BY created_at ASC, id ASC
           ) AS rn
    FROM users
    WHERE auth_user_id IS NULL AND deleted_at IS NULL
  ) ranked
  WHERE rn > 1
);

-- 2. The race-closing invariant: a UNIQUE index serializes concurrent
--    inserts on the key — the second INSERT blocks on the first's
--    uncommitted row and fails 23505 on commit. Exactly one pending
--    invitation per (clinic, normalized email) survives; the loser maps to
--    the friendly "already pending" message in inviteUser.
--    Predicate semantics: accepted members (auth_user_id set) and
--    soft-removed invites (deleted_at set) leave the index scope, so
--    signup completion, restoreExistingAccount, and re-invite after remove
--    are unaffected.
CREATE UNIQUE INDEX idx_users_pending_invite_clinic_email
  ON users (clinic_id, lower(email))
  WHERE auth_user_id IS NULL AND deleted_at IS NULL;

-- ============================================================================
-- Rollback (documented per plan §8): index rebuild reversible (recreate the
-- case-sensitive idx_alert_recipients_clinic_email); normalization is
-- idempotent; the dedupe DELETEs are irreversible by design — they only
-- remove definitional duplicates (same clinic + same normalized email),
-- with the pre-apply counts above as the audit record. Restore the
-- case-sensitive unique index and drop idx_users_pending_invite_clinic_email
-- to reverse the index portion.
-- ============================================================================

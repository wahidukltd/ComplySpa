-- Migration 050: Report pipeline hardening — effective-plan entitlements + ephemeral reports
-- 1. clinics.trial_plan — authoritative selected plan while plan='trial'
-- 2. Drop audit_reports (ephemeral report model — owner decision 2026-08-04)
-- 3. create_clinic_for_user gains required p_trial_plan

-- ============================================================================
-- 1. clinics.trial_plan
-- ============================================================================

ALTER TABLE clinics ADD COLUMN IF NOT EXISTS trial_plan TEXT;

-- Legacy rows never recorded a plan choice; backfill EVERY NULL row (trial,
-- expired_trial, inactive, paid) so SET NOT NULL can never fail on a populated
-- DB — the value is dormant whenever plan != 'trial', and 'practice' matches
-- the plan's legacy-backfill decision (preserves the audit report experience).
UPDATE clinics SET trial_plan = 'practice' WHERE trial_plan IS NULL;

ALTER TABLE clinics ALTER COLUMN trial_plan SET NOT NULL;
ALTER TABLE clinics ADD CONSTRAINT clinics_trial_plan_check CHECK (trial_plan IN ('solo', 'practice'));

-- ============================================================================
-- 2. Drop audit_reports (policies → trigger → function → indexes → table)
--    Reports are ephemeral: generated, previewed, downloaded, emailed — never stored.
-- ============================================================================

DROP POLICY IF EXISTS "audit_reports_select_own" ON audit_reports;
DROP POLICY IF EXISTS "audit_reports_insert_own" ON audit_reports;

DROP TRIGGER IF EXISTS trigger_set_audit_report_author ON audit_reports;
DROP FUNCTION IF EXISTS set_audit_report_author();

DROP INDEX IF EXISTS idx_audit_reports_clinic_id;
DROP INDEX IF EXISTS idx_audit_reports_generated_at;
DROP INDEX IF EXISTS idx_audit_reports_generated_by_user_id;

DROP TABLE IF EXISTS audit_reports;

-- ============================================================================
-- 3. create_clinic_for_user — required p_trial_plan (DROP first: CREATE OR
--    REPLACE cannot add params; same pattern as 025/042)
-- ============================================================================

DROP FUNCTION IF EXISTS create_clinic_for_user(TEXT, TEXT, TEXT, TEXT, TEXT);

CREATE FUNCTION create_clinic_for_user(
  p_user_id TEXT,
  p_email TEXT,
  p_name TEXT,
  p_address TEXT DEFAULT NULL,
  p_state TEXT DEFAULT NULL,
  p_trial_plan TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinic_id UUID;
  v_existing_id UUID;
BEGIN
  -- Required, never defaulted: NULL and invalid values both reject.
  IF p_trial_plan IS NULL OR p_trial_plan NOT IN ('solo', 'practice') THEN
    RAISE EXCEPTION 'trial_plan must be solo or practice';
  END IF;

  -- Length caps (defensive; the app schema already bounds these).
  IF p_name IS NULL OR length(p_name) > 255 THEN
    RAISE EXCEPTION 'clinic name must be 255 characters or fewer';
  END IF;
  IF p_email IS NULL OR length(p_email) > 254 THEN
    RAISE EXCEPTION 'invalid email';
  END IF;

  -- Session binding: an authenticated caller may only create a clinic for
  -- THEIR OWN auth user id (the app passes the session user). Service-role
  -- and postgres callers (no JWT) are unaffected — auth.uid() is NULL there.
  IF auth.uid() IS NOT NULL AND auth.uid()::text IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'p_user_id must match the authenticated user';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('create_clinic_' || p_user_id));

  SELECT clinic_id INTO v_existing_id FROM users WHERE auth_user_id = p_user_id;
  IF FOUND THEN RETURN v_existing_id; END IF;

  INSERT INTO clinics (name, address, state, trial_plan)
  VALUES (p_name, p_address, p_state, p_trial_plan) RETURNING id INTO v_clinic_id;

  INSERT INTO users (clinic_id, email, role, auth_user_id)
  VALUES (v_clinic_id, p_email, 'owner', p_user_id)
  ON CONFLICT (auth_user_id) DO NOTHING;

  IF NOT FOUND THEN
    DELETE FROM clinics WHERE id = v_clinic_id;
    SELECT clinic_id INTO v_clinic_id FROM users WHERE auth_user_id = p_user_id;
  END IF;

  RETURN v_clinic_id;
END;
$$;

-- Re-assert grants explicitly (DROP clears them; hosted pg_default_acl grants
-- EXECUTE to anon/authenticated/service_role at CREATE time — pin both
-- directions, 047/049 pattern: revoke the roles explicitly, then grant back).
REVOKE EXECUTE ON FUNCTION create_clinic_for_user(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION create_clinic_for_user(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION create_clinic_for_user(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- ============================================================================
-- 4. DB-layer limits resolve trial via trial_plan (defense-in-depth parity)
--    The app resolves trial → selected plan (solo 5/50/1, practice 15/300/3).
--    The BEFORE INSERT trigger and reconcile RPC must enforce the SAME limits
--    or a bypassed app check would let a trial exceed its evaluated plan.
-- ============================================================================

CREATE OR REPLACE FUNCTION enforce_plan_limits()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_plan TEXT;
  v_trial_plan TEXT;
  v_count INTEGER;
  v_limit INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('plan_limit_' || TG_TABLE_NAME || NEW.clinic_id));

  SELECT plan, trial_plan INTO v_plan, v_trial_plan FROM clinics WHERE id = NEW.clinic_id;
  IF v_plan IS NULL THEN
    RAISE EXCEPTION 'Clinic not found' USING ERRCODE = 'P0002';
  END IF;

  -- Trial is a state on the selected plan: limits come from trial_plan.
  IF v_plan = 'trial' THEN
    IF v_trial_plan = 'solo' THEN v_plan := 'solo';
    ELSIF v_trial_plan = 'practice' THEN v_plan := 'practice';
    ELSE v_plan := 'inactive';
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'staff_members' THEN
    v_limit := CASE v_plan
      WHEN 'solo' THEN 5
      WHEN 'practice' THEN 15
      ELSE 0
    END;
    SELECT COUNT(*) INTO v_count FROM staff_members WHERE clinic_id = NEW.clinic_id AND deleted_at IS NULL;
  ELSIF TG_TABLE_NAME = 'credentials' THEN
    v_limit := CASE v_plan
      WHEN 'solo' THEN 50
      WHEN 'practice' THEN 300
      ELSE 0
    END;
    SELECT COUNT(*) INTO v_count FROM credentials WHERE clinic_id = NEW.clinic_id AND deleted_at IS NULL;
  ELSIF TG_TABLE_NAME = 'users' THEN
    v_limit := CASE v_plan
      WHEN 'solo' THEN 1
      WHEN 'practice' THEN 3
      ELSE 0
    END;
    SELECT COUNT(*) INTO v_count FROM users WHERE clinic_id = NEW.clinic_id AND deleted_at IS NULL;
  ELSE
    RETURN NEW;
  END IF;

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'Plan limit reached for %. % of % allowed', TG_TABLE_NAME, v_count, v_limit
      USING ERRCODE = 'ND0MV';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION enforce_plan_limits() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION enforce_plan_limits() FROM PUBLIC;

CREATE OR REPLACE FUNCTION reconcile_clinic_plan(
  p_clinic_id UUID,
  p_plan TEXT
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit INTEGER;
  v_active_count INTEGER;
  v_suspended_count INTEGER;
BEGIN
  -- Trial is a state on the selected plan: reconcile against trial_plan limits.
  IF p_plan = 'trial' THEN
    SELECT trial_plan INTO p_plan FROM clinics WHERE id = p_clinic_id;
    IF p_plan IS NULL OR p_plan NOT IN ('solo', 'practice') THEN
      p_plan := 'inactive';
    END IF;
  END IF;

  -- Staff members
  v_limit := CASE p_plan
    WHEN 'solo' THEN 5
    WHEN 'practice' THEN 15
    ELSE 0
  END;

  SELECT COUNT(*) INTO v_active_count
  FROM staff_members
  WHERE clinic_id = p_clinic_id
    AND deleted_at IS NULL
    AND suspended_at IS NULL;

  SELECT COUNT(*) INTO v_suspended_count
  FROM staff_members
  WHERE clinic_id = p_clinic_id
    AND deleted_at IS NULL
    AND suspended_at IS NOT NULL;

  -- Restore suspended staff (newest first) if the plan can accommodate them
  IF v_active_count < v_limit AND v_suspended_count > 0 THEN
    UPDATE staff_members
    SET suspended_at = NULL, suspended_plan = NULL
    WHERE id IN (
      SELECT id FROM staff_members
      WHERE clinic_id = p_clinic_id
        AND deleted_at IS NULL
        AND suspended_at IS NOT NULL
      ORDER BY created_at DESC
      LIMIT LEAST(v_limit - v_active_count, v_suspended_count)
    );
    -- Cascade: restore credentials of newly restored staff
    UPDATE credentials
    SET suspended_at = NULL, suspended_plan = NULL
    WHERE staff_member_id IN (
      SELECT id FROM staff_members
      WHERE clinic_id = p_clinic_id
        AND deleted_at IS NULL
        AND suspended_at IS NULL
    )
    AND clinic_id = p_clinic_id
    AND deleted_at IS NULL
    AND suspended_at IS NOT NULL;
  END IF;

  -- Suspend excess staff (oldest first)
  IF v_active_count > v_limit THEN
    UPDATE staff_members
    SET suspended_at = NOW(), suspended_plan = p_plan
    WHERE id IN (
      SELECT id FROM staff_members
      WHERE clinic_id = p_clinic_id
        AND deleted_at IS NULL
        AND suspended_at IS NULL
      ORDER BY created_at ASC
      LIMIT v_active_count - v_limit
    );
    -- Cascade: suspend all credentials of newly suspended staff
    UPDATE credentials
    SET suspended_at = NOW(), suspended_plan = p_plan
    WHERE staff_member_id IN (
      SELECT id FROM staff_members
      WHERE clinic_id = p_clinic_id
        AND deleted_at IS NULL
        AND suspended_at IS NOT NULL
    )
    AND clinic_id = p_clinic_id
    AND deleted_at IS NULL
    AND suspended_at IS NULL;
  END IF;

  -- Remaining standalone credentials (those whose parent staff was NOT
  -- suspended by the cascade above, but exceed the credential limit)
  v_limit := CASE p_plan
    WHEN 'solo' THEN 50
    WHEN 'practice' THEN 300
    ELSE 0
  END;

  SELECT COUNT(*) INTO v_active_count
  FROM credentials
  WHERE clinic_id = p_clinic_id
    AND deleted_at IS NULL
    AND suspended_at IS NULL;

  SELECT COUNT(*) INTO v_suspended_count
  FROM credentials
  WHERE clinic_id = p_clinic_id
    AND deleted_at IS NULL
    AND suspended_at IS NOT NULL;

  IF v_active_count < v_limit AND v_suspended_count > 0 THEN
    UPDATE credentials
    SET suspended_at = NULL, suspended_plan = NULL
    WHERE id IN (
      SELECT id FROM credentials
      WHERE clinic_id = p_clinic_id
        AND deleted_at IS NULL
        AND suspended_at IS NOT NULL
        -- Only credentials of ACTIVE staff may be restored. Without this
        -- scope, this branch un-does the staff-suspension cascade above: after
        -- the cascade drops the active-credential count, this restore fires
        -- and re-activates the very credentials the cascade just suspended
        -- (inherited 033 defect, caught by the 050 DB-parity test).
        AND staff_member_id IN (
          SELECT id FROM staff_members
          WHERE clinic_id = p_clinic_id
            AND deleted_at IS NULL
            AND suspended_at IS NULL
        )
      ORDER BY created_at DESC
      LIMIT LEAST(v_limit - v_active_count, v_suspended_count)
    );
  END IF;

  IF v_active_count > v_limit THEN
    UPDATE credentials
    SET suspended_at = NOW(), suspended_plan = p_plan
    WHERE id IN (
      SELECT id FROM credentials
      WHERE clinic_id = p_clinic_id
        AND deleted_at IS NULL
        AND suspended_at IS NULL
      ORDER BY created_at ASC
      LIMIT v_active_count - v_limit
    );
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION reconcile_clinic_plan(UUID, TEXT) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION reconcile_clinic_plan(UUID, TEXT) FROM PUBLIC;

-- Fix reconciliation to cascade staff suspension/restoration to their credentials.
-- When a staff member is suspended, all their credentials are also suspended.
-- When restored, all their credentials restore too.
--
-- Also adds reconciliation calls to check_trial_expiry() and
-- cleanup_inactive_clinics() so cron transitions also reconcile.

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
  -- ── Staff members ──
  v_limit := CASE p_plan
    WHEN 'trial' THEN 1000
    WHEN 'solo' THEN 5
    WHEN 'practice' THEN 15
    WHEN 'multi_location' THEN 50
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

  -- ── Remaining standalone credentials (those whose parent staff was NOT
  -- suspended by the cascade above, but exceed the credential limit) ──
  v_limit := CASE p_plan
    WHEN 'trial' THEN 10000
    WHEN 'solo' THEN 50
    WHEN 'practice' THEN 300
    WHEN 'multi_location' THEN 1000
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

-- Fix check_trial_expiry to call reconciliation after plan change
CREATE OR REPLACE FUNCTION check_trial_expiry()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM clinics WHERE plan = 'trial' AND trial_end_date < NOW() LOOP
    UPDATE clinics SET plan = 'expired_trial' WHERE id = r.id;
    PERFORM reconcile_clinic_plan(r.id, 'expired_trial');
  END LOOP;
END;
$$;

-- Fix cleanup_inactive_clinics to call reconciliation after plan change
CREATE OR REPLACE FUNCTION cleanup_inactive_clinics()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM clinics WHERE plan = 'expired_trial' AND trial_end_date < NOW() - INTERVAL '30 days' LOOP
    UPDATE clinics SET plan = 'inactive' WHERE id = r.id;
    PERFORM reconcile_clinic_plan(r.id, 'inactive');
  END LOOP;
END;
$$;

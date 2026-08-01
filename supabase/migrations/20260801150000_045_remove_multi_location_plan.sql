-- 045: Remove the Multi-Location plan end-to-end (see plan
-- 2026-08-01-remove-multi-location-plan.md). Follow-up to 001/010/015/020/
-- 028/029/030/031/032/033/036. Re-creates every DB function that referenced
-- the plan (latest bodies, multi branches removed) and narrows the plan CHECK.

-- 0. Safety guard: any environment that still has a multi_location row maps
-- it to practice BEFORE the constraint narrows (idempotent; zero rows in
-- production as of 2026-08-01). Capture the affected ids first so section 8
-- can reconcile exactly those clinics against practice limits.
CREATE TEMP TABLE _mapped_multi_clinics AS
  SELECT id FROM clinics WHERE plan = 'multi_location';
UPDATE clinics SET plan = 'practice' WHERE plan = 'multi_location';

-- 1. Narrow the plan CHECK constraint (001:19).
ALTER TABLE clinics DROP CONSTRAINT IF EXISTS clinics_plan_check;
ALTER TABLE clinics
  ADD CONSTRAINT clinics_plan_check
  CHECK (plan IN ('trial', 'expired_trial', 'inactive', 'solo', 'practice'));

-- 2. enforce_plan_limits() — latest body (030) minus the multi CASE branches.
CREATE OR REPLACE FUNCTION enforce_plan_limits()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_plan TEXT;
  v_count INTEGER;
  v_limit INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('plan_limit_' || TG_TABLE_NAME || NEW.clinic_id));

  SELECT plan INTO v_plan FROM clinics WHERE id = NEW.clinic_id;
  IF v_plan IS NULL THEN
    RAISE EXCEPTION 'Clinic not found' USING ERRCODE = 'P0002';
  END IF;

  IF TG_TABLE_NAME = 'staff_members' THEN
    v_limit := CASE v_plan
      WHEN 'trial' THEN 1000
      WHEN 'solo' THEN 5
      WHEN 'practice' THEN 15
      ELSE 0
    END;
    SELECT COUNT(*) INTO v_count FROM staff_members WHERE clinic_id = NEW.clinic_id AND deleted_at IS NULL;
  ELSIF TG_TABLE_NAME = 'credentials' THEN
    v_limit := CASE v_plan
      WHEN 'trial' THEN 10000
      WHEN 'solo' THEN 50
      WHEN 'practice' THEN 300
      ELSE 0
    END;
    SELECT COUNT(*) INTO v_count FROM credentials WHERE clinic_id = NEW.clinic_id AND deleted_at IS NULL;
  ELSIF TG_TABLE_NAME = 'users' THEN
    v_limit := CASE v_plan
      WHEN 'trial' THEN 100
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

-- 3. reconcile_clinic_plan() — latest body (033) minus the multi CASEs.
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
  -- Staff members
  v_limit := CASE p_plan
    WHEN 'trial' THEN 1000
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
    WHEN 'trial' THEN 10000
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

-- 4. update_clinic_subscription() — latest body (036) with the multi plan
-- removed from both guard lists.
CREATE OR REPLACE FUNCTION update_clinic_subscription(
  p_clinic_id UUID,
  p_plan TEXT,
  p_polar_subscription_id TEXT DEFAULT NULL,
  p_cancel_at_period_end BOOLEAN DEFAULT FALSE,
  p_polar_customer_id TEXT DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_current_plan TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('update_subscription_' || p_clinic_id));

  SELECT plan INTO v_current_plan FROM clinics WHERE id = p_clinic_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Clinic not found' USING ERRCODE = 'P0002';
  END IF;

  -- Only block non-webhook callers (no subscription context) from downgrading
  -- a paid plan to expired_trial. Subscriptions with a real subscription_id
  -- (e.g. subscription.revoked events) are always allowed.
  IF p_plan = 'expired_trial'
     AND v_current_plan IN ('solo', 'practice')
     AND p_polar_subscription_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE clinics SET
    plan = p_plan,
    trial_end_date = CASE WHEN p_plan IN ('solo', 'practice') THEN NULL ELSE trial_end_date END,
    polar_subscription_id = COALESCE(p_polar_subscription_id, polar_subscription_id),
    polar_customer_id = COALESCE(p_polar_customer_id, polar_customer_id),
    cancel_at_period_end = p_cancel_at_period_end
  WHERE id = p_clinic_id;
END;
$$;

-- 5. update_clinic_subscription 4-arg overload — latest body (031, which
-- extended the 029 version with trial_end_date handling) minus the multi plan.
-- The webhook's subscription.canceled path calls this 4-arg overload, so the
-- old 029/031 body (which still referenced multi_location) must be replaced too.
CREATE OR REPLACE FUNCTION update_clinic_subscription(
  p_clinic_id UUID,
  p_plan TEXT,
  p_polar_subscription_id TEXT DEFAULT NULL,
  p_cancel_at_period_end BOOLEAN DEFAULT FALSE
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_current_plan TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('update_subscription_' || p_clinic_id));

  SELECT plan INTO v_current_plan FROM clinics WHERE id = p_clinic_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Clinic not found' USING ERRCODE = 'P0002';
  END IF;

  -- Only block non-webhook callers (no subscription context) from downgrading
  -- a paid plan to expired_trial. Subscriptions with a real subscription_id
  -- (e.g. subscription.revoked events) are always allowed.
  IF p_plan = 'expired_trial'
     AND v_current_plan IN ('solo', 'practice')
     AND p_polar_subscription_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE clinics SET
    plan = p_plan,
    trial_end_date = CASE WHEN p_plan IN ('solo', 'practice') THEN NULL ELSE trial_end_date END,
    polar_subscription_id = COALESCE(p_polar_subscription_id, polar_subscription_id),
    cancel_at_period_end = p_cancel_at_period_end
  WHERE id = p_clinic_id;
END;
$$;

-- 6. scan_expiring_credentials() � TRUE latest body (034, which added the
-- suspended-resource filters after 028) minus the multi plan. Suspended
-- staff/credentials must never trigger expiration alerts after a downgrade.
CREATE OR REPLACE FUNCTION scan_expiring_credentials()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  record RECORD;
  edge_function_url TEXT;
  anon_key TEXT;
  cron_secret TEXT;
BEGIN
  edge_function_url := current_setting('app.edge_function_url', true);
  anon_key := current_setting('app.supabase_anon_key', true);
  cron_secret := current_setting('app.cron_secret', true);

  IF edge_function_url IS NULL OR edge_function_url = '' THEN
    RAISE WARNING 'app.edge_function_url not set, skipping credential scan';
    RETURN;
  END IF;

  IF anon_key IS NULL OR anon_key = '' THEN
    RAISE WARNING 'app.supabase_anon_key not set, skipping credential scan';
    RETURN;
  END IF;

  IF cron_secret IS NULL OR cron_secret = '' THEN
    RAISE WARNING 'app.cron_secret not set, skipping credential scan';
    RETURN;
  END IF;

  edge_function_url := rtrim(edge_function_url, '/') || '/send-credential-alert';

  FOR record IN
    SELECT c.id, c.clinic_id,
           ((c.expiration_date AT TIME ZONE 'UTC')::DATE - CURRENT_DATE) AS days_before
    FROM credentials c
    INNER JOIN staff_members sm ON c.staff_member_id = sm.id
    INNER JOIN clinics cl ON c.clinic_id = cl.id
    WHERE c.expiration_date IS NOT NULL
      AND c.deleted_at IS NULL
      AND c.suspended_at IS NULL
      AND ((c.expiration_date AT TIME ZONE 'UTC')::DATE - CURRENT_DATE) IN (90, 60, 30, 7)
      AND sm.deleted_at IS NULL
      AND sm.suspended_at IS NULL
      AND cl.plan IN ('trial', 'solo', 'practice')
      AND NOT EXISTS (
        SELECT 1 FROM alert_logs al
        WHERE al.credential_id = c.id
          AND al.days_before_expiration = ((c.expiration_date AT TIME ZONE 'UTC')::DATE - CURRENT_DATE)
          AND (al.sent_at AT TIME ZONE 'UTC')::DATE = CURRENT_DATE
      )
  LOOP
    PERFORM net.http_post(
      url := edge_function_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', anon_key,
        'x-cron-secret', cron_secret
      ),
      body := jsonb_build_object(
        'credential_id', record.id,
        'clinic_id', record.clinic_id,
        'days_before', record.days_before
      ),
      timeout_milliseconds := 10000
    );
  END LOOP;
END;
$$;

-- 7. scan_escalation_alerts() � TRUE latest body (034) minus the multi plan.
CREATE OR REPLACE FUNCTION scan_escalation_alerts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  record RECORD;
  edge_function_url TEXT;
  anon_key TEXT;
  cron_secret TEXT;
BEGIN
  edge_function_url := COALESCE(
    NULLIF(current_setting('app.edge_function_url', true), ''),
    'http://host.docker.internal:54321/functions/v1'
  );
  anon_key := current_setting('app.supabase_anon_key', true);
  cron_secret := current_setting('app.cron_secret', true);

  IF cron_secret IS NULL OR cron_secret = '' THEN
    RAISE WARNING 'app.cron_secret not set, skipping escalation scan';
    RETURN;
  END IF;

  IF anon_key IS NULL OR anon_key = '' THEN
    RAISE WARNING 'app.supabase_anon_key not set, skipping escalation scan';
    RETURN;
  END IF;

  edge_function_url := rtrim(edge_function_url, '/') || '/send-credential-alert';

  FOR record IN
    SELECT c.id AS credential_id, c.clinic_id
    FROM credentials c
    INNER JOIN staff_members sm ON c.staff_member_id = sm.id
    INNER JOIN clinics cl ON c.clinic_id = cl.id
    WHERE c.status = 'expired'
      AND c.deleted_at IS NULL
      AND c.suspended_at IS NULL
      AND (c.expiration_date AT TIME ZONE 'UTC')::DATE < (CURRENT_DATE - 7)
      AND sm.deleted_at IS NULL
      AND sm.suspended_at IS NULL
      AND cl.plan IN ('trial', 'solo', 'practice')
      AND NOT EXISTS (
        SELECT 1 FROM alert_logs al
        WHERE al.credential_id = c.id
          AND al.alert_type = 'email'
          AND al.days_before_expiration < 0
          AND (al.sent_at AT TIME ZONE 'UTC')::DATE > CURRENT_DATE - 8
      )
  LOOP
    PERFORM net.http_post(
      url := edge_function_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', anon_key,
        'x-cron-secret', cron_secret
      ),
      body := jsonb_build_object(
        'credential_id', record.credential_id,
        'clinic_id', record.clinic_id,
        'days_before', -7
      ),
      timeout_milliseconds := 10000
    );
  END LOOP;
END;
$$;

-- 8. Post-guard reconciliation: clinics that were actually on multi_location
-- (captured in section 0 before the guard UPDATE) get reconciled against
-- practice limits so excess staff/credentials are suspended deterministically.
-- No-op when zero rows.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM _mapped_multi_clinics LOOP
    PERFORM reconcile_clinic_plan(r.id, 'practice');
  END LOOP;
END;
$$;

DROP TABLE _mapped_multi_clinics;
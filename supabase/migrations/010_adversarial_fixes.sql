-- Adversarial review fixes (Phase 2 audit)
-- Security: RPC hardening, plan limit enforcement, schema integrity

-- 1. Revoke PUBLIC EXECUTE on create_clinic_for_user (C-1: unrestricted RPC)
REVOKE EXECUTE ON FUNCTION create_clinic_for_user(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_clinic_for_user(TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;

-- 2. Replace create_clinic_for_user with input validation + savepoint safety (C-1/H-2/H-3)
CREATE OR REPLACE FUNCTION create_clinic_for_user(
  p_clerk_sub TEXT,
  p_email TEXT,
  p_name TEXT,
  p_address TEXT DEFAULT NULL,
  p_state TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinic_id UUID;
  v_existing_id UUID;
BEGIN
  IF p_clerk_sub IS NULL OR length(trim(p_clerk_sub)) = 0 THEN
    RAISE EXCEPTION 'clerk_user_id cannot be empty';
  END IF;
  IF p_email IS NULL OR length(trim(p_email)) = 0 THEN
    RAISE EXCEPTION 'email cannot be empty';
  END IF;
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'Clinic name cannot be empty';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('create_clinic_' || p_clerk_sub));

  SELECT clinic_id INTO v_existing_id FROM users WHERE clerk_user_id = p_clerk_sub;
  IF FOUND THEN
    RETURN v_existing_id;
  END IF;

  INSERT INTO clinics (name, address, state, plan, trial_end_date)
  VALUES (p_name, p_address, p_state, 'trial', NOW() + INTERVAL '14 days')
  RETURNING id INTO v_clinic_id;

  BEGIN
    INSERT INTO users (clinic_id, email, role, clerk_user_id)
    VALUES (v_clinic_id, p_email, 'owner', p_clerk_sub);
  EXCEPTION WHEN OTHERS THEN
    DELETE FROM clinics WHERE id = v_clinic_id;
    RAISE;
  END;

  RETURN v_clinic_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION create_clinic_for_user(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_clinic_for_user(TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;

-- 3. credential_audit.changed_by SET NOT NULL (H-4)
ALTER TABLE credential_audit ALTER COLUMN changed_by SET NOT NULL;

-- 4. Plan limit enforcement triggers (CRITICAL-3: DB-level plan limits)
CREATE OR REPLACE FUNCTION enforce_plan_limits()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_plan TEXT;
  v_count INTEGER;
  v_limit INTEGER;
BEGIN
  SELECT plan INTO v_plan FROM clinics WHERE id = NEW.clinic_id;
  IF v_plan IS NULL THEN
    RAISE EXCEPTION 'Clinic not found' USING ERRCODE = 'P0002';
  END IF;

  IF TG_TABLE_NAME = 'staff_members' THEN
    v_limit := CASE v_plan
      WHEN 'trial' THEN 5
      WHEN 'solo' THEN 5
      WHEN 'practice' THEN 15
      WHEN 'multi_location' THEN 50
      ELSE 0
    END;
    SELECT COUNT(*) INTO v_count FROM staff_members WHERE clinic_id = NEW.clinic_id AND deleted_at IS NULL;
  ELSIF TG_TABLE_NAME = 'credentials' THEN
    v_limit := CASE v_plan
      WHEN 'trial' THEN 50
      WHEN 'solo' THEN 50
      WHEN 'practice' THEN 300
      WHEN 'multi_location' THEN 1000
      ELSE 0
    END;
    SELECT COUNT(*) INTO v_count FROM credentials WHERE clinic_id = NEW.clinic_id;
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

REVOKE EXECUTE ON FUNCTION enforce_plan_limits() FROM PUBLIC;

DROP TRIGGER IF EXISTS trigger_enforce_plan_limits_staff ON staff_members;
DROP TRIGGER IF EXISTS trigger_enforce_plan_limits_credentials ON credentials;

CREATE TRIGGER trigger_enforce_plan_limits_staff
  BEFORE INSERT ON staff_members
  FOR EACH ROW EXECUTE FUNCTION enforce_plan_limits();

CREATE TRIGGER trigger_enforce_plan_limits_credentials
  BEFORE INSERT ON credentials
  FOR EACH ROW EXECUTE FUNCTION enforce_plan_limits();

-- 5. credential_types clinic_id immutability trigger (M-3)
DROP TRIGGER IF EXISTS trigger_credential_types_clinic_id_immutable ON credential_types;
CREATE TRIGGER trigger_credential_types_clinic_id_immutable
  BEFORE UPDATE ON credential_types
  FOR EACH ROW EXECUTE FUNCTION prevent_clinic_id_change();

-- 6. Composite index for alert_logs idempotency subquery (H-1)
CREATE INDEX IF NOT EXISTS idx_alert_logs_cred_days_sent
  ON alert_logs(credential_id, days_before_expiration, sent_at DESC);

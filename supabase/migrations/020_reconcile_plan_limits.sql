-- Reconcile PLAN_LIMITS.trial between app and DB trigger.
-- The app-layer PLAN_LIMITS constant sets trial to 1000 staff / 10000 credentials
-- to allow generous limits during the 14-day trial period. The DB trigger was
-- inadvertently set to 5/50 (matching solo). This migration updates the trigger
-- to match PLAN_LIMITS so trial users don't hit an opaque DB error before the
-- app-layer limit.

-- Also adds a BEFORE INSERT trigger on users table for defense-in-depth
-- on user count enforcement (no trigger existed previously).

-- Drops redundant single-column index subsumed by composite idx_staff_members_clinic_id_deleted.
DROP INDEX IF EXISTS idx_staff_members_deleted_at;

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
      WHEN 'trial' THEN 1000
      WHEN 'solo' THEN 5
      WHEN 'practice' THEN 15
      WHEN 'multi_location' THEN 50
      ELSE 0
    END;
    SELECT COUNT(*) INTO v_count FROM staff_members WHERE clinic_id = NEW.clinic_id AND deleted_at IS NULL;
  ELSIF TG_TABLE_NAME = 'credentials' THEN
    v_limit := CASE v_plan
      WHEN 'trial' THEN 10000
      WHEN 'solo' THEN 50
      WHEN 'practice' THEN 300
      WHEN 'multi_location' THEN 1000
      ELSE 0
    END;
    SELECT COUNT(*) INTO v_count FROM credentials WHERE clinic_id = NEW.clinic_id;
  ELSIF TG_TABLE_NAME = 'users' THEN
    v_limit := CASE v_plan
      WHEN 'trial' THEN 100
      WHEN 'solo' THEN 1
      WHEN 'practice' THEN 3
      WHEN 'multi_location' THEN 10
      ELSE 0
    END;
    SELECT COUNT(*) INTO v_count FROM users WHERE clinic_id = NEW.clinic_id;
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

-- Drop and recreate staff/credential triggers (idempotent — reuses updated function)
DROP TRIGGER IF EXISTS trigger_enforce_plan_limits_staff ON staff_members;
DROP TRIGGER IF EXISTS trigger_enforce_plan_limits_credentials ON credentials;

CREATE TRIGGER trigger_enforce_plan_limits_staff
  BEFORE INSERT ON staff_members
  FOR EACH ROW EXECUTE FUNCTION enforce_plan_limits();

CREATE TRIGGER trigger_enforce_plan_limits_credentials
  BEFORE INSERT ON credentials
  FOR EACH ROW EXECUTE FUNCTION enforce_plan_limits();

-- Add user count enforcement trigger (defense-in-depth for inviteUser + completeInvitationSignup)
DROP TRIGGER IF EXISTS trigger_enforce_plan_limits_users ON users;

CREATE TRIGGER trigger_enforce_plan_limits_users
  BEFORE INSERT ON users
  FOR EACH ROW EXECUTE FUNCTION enforce_plan_limits();

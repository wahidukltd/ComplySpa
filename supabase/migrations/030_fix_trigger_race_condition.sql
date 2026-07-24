-- Fix: Add pg_advisory_xact_lock to enforce_plan_limits() to prevent
-- concurrent inserts from bypassing count-based plan limits.
--
-- Two concurrent INSERTs could both pass the count check before either
-- commits, resulting in count exceeding the plan limit.
--
-- Advisory lock key: hashtext('plan_limit_' || TG_TABLE_NAME || NEW.clinic_id)

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
    SELECT COUNT(*) INTO v_count FROM credentials WHERE clinic_id = NEW.clinic_id AND deleted_at IS NULL;
  ELSIF TG_TABLE_NAME = 'users' THEN
    v_limit := CASE v_plan
      WHEN 'trial' THEN 100
      WHEN 'solo' THEN 1
      WHEN 'practice' THEN 3
      WHEN 'multi_location' THEN 10
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

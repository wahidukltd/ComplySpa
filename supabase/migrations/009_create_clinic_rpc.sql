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
  PERFORM pg_advisory_xact_lock(hashtext('create_clinic_' || p_clerk_sub));

  SELECT clinic_id INTO v_existing_id FROM users WHERE clerk_user_id = p_clerk_sub;
  IF FOUND THEN
    RETURN v_existing_id;
  END IF;

  INSERT INTO clinics (name, address, state)
  VALUES (p_name, p_address, p_state)
  RETURNING id INTO v_clinic_id;

  INSERT INTO users (clinic_id, email, role, clerk_user_id)
  VALUES (v_clinic_id, p_email, 'owner', p_clerk_sub)
  ON CONFLICT (clerk_user_id) DO NOTHING;

  IF NOT FOUND THEN
    DELETE FROM clinics WHERE id = v_clinic_id;
    SELECT clinic_id INTO v_clinic_id FROM users WHERE clerk_user_id = p_clerk_sub;
  END IF;

  RETURN v_clinic_id;
END;
$$;

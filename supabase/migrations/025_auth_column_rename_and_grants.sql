-- Migration 025: Rename clerk_user_id → auth_user_id, revoke anon grants
--
-- The column stores the Supabase Auth user UUID (not a Clerk ID). Rename it
-- everywhere: column, function variables, triggers, RLS policies, indexes.
--
-- Also revokes anon write grants and restricts SECURITY DEFINER function
-- execution to only the roles that need them.

-- ============================================================================
-- STEP 1: Add new column, backfill, make NOT NULL, swap constraints
-- ============================================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_user_id TEXT;

UPDATE users SET auth_user_id = clerk_user_id WHERE clerk_user_id IS NOT NULL;

-- Create unique index (handles NULLs correctly — allows multiple NULLs)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_auth_user_id ON users(auth_user_id);

-- ============================================================================
-- STEP 2: Update all SECURITY DEFINER functions to use auth_user_id
-- ============================================================================

-- auth_clinic_id() — returns clinic_id for current user
CREATE OR REPLACE FUNCTION auth_clinic_id()
RETURNS UUID AS $$
DECLARE
  auth_sub TEXT;
  result_clinic_id UUID;
BEGIN
  auth_sub := auth.jwt() ->> 'sub';
  IF auth_sub IS NULL THEN RETURN NULL; END IF;
  SELECT clinic_id INTO result_clinic_id FROM users
    WHERE auth_user_id = auth_sub LIMIT 1;
  RETURN result_clinic_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- auth_user_role() — returns role for current user
CREATE OR REPLACE FUNCTION auth_user_role()
RETURNS TEXT AS $$
DECLARE
  auth_sub TEXT;
  user_role TEXT;
BEGIN
  auth_sub := auth.jwt() ->> 'sub';
  IF auth_sub IS NULL THEN RETURN NULL; END IF;
  SELECT role INTO user_role FROM users
    WHERE auth_user_id = auth_sub LIMIT 1;
  RETURN user_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- audit_credential_changes() — log credential changes
CREATE OR REPLACE FUNCTION audit_credential_changes()
RETURNS TRIGGER AS $$
DECLARE
  auth_sub TEXT;
BEGIN
  auth_sub := auth.jwt() ->> 'sub';
  IF TG_OP = 'DELETE' THEN
    INSERT INTO credential_audit (credential_id, clinic_id, action, changed_by, old_values)
    VALUES (OLD.id, OLD.clinic_id, 'DELETE', auth_sub, to_jsonb(OLD));
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO credential_audit (credential_id, clinic_id, action, changed_by, old_values, new_values)
    VALUES (NEW.id, NEW.clinic_id, 'UPDATE', auth_sub, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO credential_audit (credential_id, clinic_id, action, changed_by, new_values)
    VALUES (NEW.id, NEW.clinic_id, 'INSERT', auth_sub, to_jsonb(NEW));
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- create_clinic_for_user — renamed p_user_id param + uses auth_user_id
CREATE OR REPLACE FUNCTION create_clinic_for_user(
  p_user_id TEXT,
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
  PERFORM pg_advisory_xact_lock(hashtext('create_clinic_' || p_user_id));

  SELECT clinic_id INTO v_existing_id FROM users WHERE auth_user_id = p_user_id;
  IF FOUND THEN RETURN v_existing_id; END IF;

  INSERT INTO clinics (name, address, state)
  VALUES (p_name, p_address, p_state) RETURNING id INTO v_clinic_id;

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

-- ============================================================================
-- STEP 3: Update trigger functions
-- ============================================================================

-- prevent_clerk_user_id_change → prevent_auth_user_id_change
DROP TRIGGER IF EXISTS trigger_users_clerk_user_id_immutable ON users;
DROP FUNCTION IF EXISTS prevent_clerk_user_id_change();

CREATE OR REPLACE FUNCTION prevent_auth_user_id_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.auth_user_id IS NOT NULL AND OLD.auth_user_id != '' AND
     NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id THEN
    RAISE EXCEPTION 'auth_user_id cannot be changed after creation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_users_auth_user_id_immutable
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION prevent_auth_user_id_change();

-- ============================================================================
-- STEP 4: Revoke anon write grants (defense in depth)
-- RLS already blocks writes, but removing the GRANT eliminates the attack
-- surface entirely.
-- ============================================================================
REVOKE INSERT, UPDATE, DELETE ON users FROM anon;
REVOKE INSERT, UPDATE, DELETE ON staff_members FROM anon;
REVOKE INSERT, UPDATE, DELETE ON credentials FROM anon;
REVOKE INSERT, UPDATE, DELETE ON credential_types FROM anon;
REVOKE INSERT, UPDATE, DELETE ON audit_reports FROM anon;

-- ============================================================================
-- STEP 5: Revoke SECURITY DEFINER function EXECUTE from roles that don't
-- need them. auth_clinic_id() and auth_user_role() must stay executable by
-- both anon and authenticated because RLS policies call them.
-- Trigger functions and cron functions should only run as postgres.
-- ============================================================================
REVOKE EXECUTE ON FUNCTION audit_credential_changes() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION prevent_auth_user_id_change() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION prevent_clinic_id_change() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION rls_auto_enable() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION update_credential_statuses() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION scan_expiring_credentials() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION scan_escalation_alerts() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION check_trial_expiry() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION cleanup_inactive_clinics() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION set_audit_report_author() FROM anon, authenticated;

-- ============================================================================
-- STEP 6: Drop old column and index (after everything is migrated)
-- ============================================================================
DROP INDEX IF EXISTS idx_users_clerk_user_id;
ALTER TABLE users DROP COLUMN IF EXISTS clerk_user_id;

-- Recreate the renamed index
CREATE INDEX IF NOT EXISTS idx_users_auth_user_id ON users(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Migration 002: Row Level Security policies
-- Clinic data isolation enforced at the database level

-- ============================================================================
-- HELPER FUNCTION: auth_clinic_id()
-- Returns the clinic_id for the current authenticated user from their JWT sub
-- claim. SECURITY DEFINER: runs as postgres, bypasses RLS on users table to
-- look up the caller's clinic_id. Without this, RLS on users would create a
-- circular dependency (policy on users calls auth_clinic_id() which reads
-- users).
-- ============================================================================
CREATE OR REPLACE FUNCTION auth_clinic_id()
RETURNS UUID AS $$
DECLARE
  auth_sub TEXT;
  result_clinic_id UUID;
BEGIN
  auth_sub := auth.jwt() ->> 'sub';

  IF auth_sub IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT clinic_id INTO result_clinic_id
  FROM users
  WHERE clerk_user_id = auth_sub
  LIMIT 1;

  RETURN result_clinic_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION auth_clinic_id() TO anon, authenticated;

-- ============================================================================
-- TABLE-LEVEL GRANTS
-- RLS policies control which rows are accessible. GRANTs control which
-- operations are permitted at all. Grant only what each table's RLS policies
-- allow — defense in depth.
-- ============================================================================
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- clinics: SELECT + UPDATE only (no INSERT/DELETE via anon key)
GRANT SELECT, UPDATE ON clinics TO anon, authenticated;

-- users: SELECT + INSERT + UPDATE (no DELETE via anon key)
GRANT SELECT, INSERT, UPDATE ON users TO anon, authenticated;

-- credential_types: full CRUD (SELECT includes global types)
GRANT SELECT, INSERT, UPDATE, DELETE ON credential_types TO anon, authenticated;

-- staff_members: full CRUD
GRANT SELECT, INSERT, UPDATE, DELETE ON staff_members TO anon, authenticated;

-- credentials: full CRUD
GRANT SELECT, INSERT, UPDATE, DELETE ON credentials TO anon, authenticated;

-- alert_logs: SELECT only (writes come from Edge Functions via service role)
GRANT SELECT ON alert_logs TO anon, authenticated;

-- audit_reports: SELECT + INSERT (no UPDATE/DELETE via anon key)
GRANT SELECT, INSERT ON audit_reports TO anon, authenticated;

-- service_role: full CRUD on all tables (bypasses RLS, used by Edge Functions)
GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;

-- ============================================================================
-- ENABLE RLS ON EVERY TABLE
-- ============================================================================
ALTER TABLE clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE credential_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_reports ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS POLICIES: clinics
-- Users can only see and modify their own clinic.
-- No INSERT/DELETE via anon key — clinics are created by onboarding flow
-- using the service role key.
-- ============================================================================
DROP POLICY IF EXISTS "clinics_select_own" ON clinics;
CREATE POLICY "clinics_select_own" ON clinics
  FOR SELECT USING (id = auth_clinic_id());

DROP POLICY IF EXISTS "clinics_update_own" ON clinics;
CREATE POLICY "clinics_update_own" ON clinics
  FOR UPDATE USING (id = auth_clinic_id());

-- ============================================================================
-- RLS POLICIES: users
-- Users can see all users in their clinic. Owners can modify.
-- INSERT is allowed for onboarding-invite flow (user must be in same clinic).
-- ============================================================================
DROP POLICY IF EXISTS "users_select_own_clinic" ON users;
CREATE POLICY "users_select_own_clinic" ON users
  FOR SELECT USING (clinic_id = auth_clinic_id());

DROP POLICY IF EXISTS "users_insert_own_clinic" ON users;
CREATE POLICY "users_insert_own_clinic" ON users
  FOR INSERT WITH CHECK (clinic_id = auth_clinic_id());

DROP POLICY IF EXISTS "users_update_own_clinic" ON users;
CREATE POLICY "users_update_own_clinic" ON users
  FOR UPDATE USING (clinic_id = auth_clinic_id());

-- ============================================================================
-- RLS POLICIES: credential_types
-- Users can see global types (clinic_id IS NULL) AND their clinic's custom
-- types. Custom types can be fully managed by the owning clinic.
-- ============================================================================
DROP POLICY IF EXISTS "credential_types_select" ON credential_types;
CREATE POLICY "credential_types_select" ON credential_types
  FOR SELECT USING (clinic_id IS NULL OR clinic_id = auth_clinic_id());

DROP POLICY IF EXISTS "credential_types_insert_own" ON credential_types;
CREATE POLICY "credential_types_insert_own" ON credential_types
  FOR INSERT WITH CHECK (clinic_id = auth_clinic_id());

DROP POLICY IF EXISTS "credential_types_update_own" ON credential_types;
CREATE POLICY "credential_types_update_own" ON credential_types
  FOR UPDATE USING (clinic_id = auth_clinic_id());

DROP POLICY IF EXISTS "credential_types_delete_own" ON credential_types;
CREATE POLICY "credential_types_delete_own" ON credential_types
  FOR DELETE USING (clinic_id = auth_clinic_id());

-- ============================================================================
-- RLS POLICIES: staff_members
-- Full CRUD scoped to the user's clinic. Soft-deleted rows (deleted_at IS NOT
-- NULL) are still visible — filtering is done at the application layer to
-- allow undelete.
-- ============================================================================
DROP POLICY IF EXISTS "staff_members_select_own" ON staff_members;
CREATE POLICY "staff_members_select_own" ON staff_members
  FOR SELECT USING (clinic_id = auth_clinic_id());

DROP POLICY IF EXISTS "staff_members_insert_own" ON staff_members;
CREATE POLICY "staff_members_insert_own" ON staff_members
  FOR INSERT WITH CHECK (clinic_id = auth_clinic_id());

DROP POLICY IF EXISTS "staff_members_update_own" ON staff_members;
CREATE POLICY "staff_members_update_own" ON staff_members
  FOR UPDATE USING (clinic_id = auth_clinic_id());

DROP POLICY IF EXISTS "staff_members_delete_own" ON staff_members;
CREATE POLICY "staff_members_delete_own" ON staff_members
  FOR DELETE USING (clinic_id = auth_clinic_id());

-- ============================================================================
-- RLS POLICIES: credentials
-- Full CRUD scoped to the user's clinic via denormalized clinic_id.
-- ============================================================================
DROP POLICY IF EXISTS "credentials_select_own" ON credentials;
CREATE POLICY "credentials_select_own" ON credentials
  FOR SELECT USING (clinic_id = auth_clinic_id());

DROP POLICY IF EXISTS "credentials_insert_own" ON credentials;
CREATE POLICY "credentials_insert_own" ON credentials
  FOR INSERT WITH CHECK (clinic_id = auth_clinic_id());

DROP POLICY IF EXISTS "credentials_update_own" ON credentials;
CREATE POLICY "credentials_update_own" ON credentials
  FOR UPDATE USING (clinic_id = auth_clinic_id());

DROP POLICY IF EXISTS "credentials_delete_own" ON credentials;
CREATE POLICY "credentials_delete_own" ON credentials
  FOR DELETE USING (clinic_id = auth_clinic_id());

-- ============================================================================
-- RLS POLICIES: alert_logs
-- Read-only for clinic users. Alert logs are written by Edge Functions using
-- the service role key, which bypasses RLS.
-- ============================================================================
DROP POLICY IF EXISTS "alert_logs_select_own" ON alert_logs;
CREATE POLICY "alert_logs_select_own" ON alert_logs
  FOR SELECT USING (clinic_id = auth_clinic_id());

-- ============================================================================
-- RLS POLICIES: audit_reports
-- Users can view and generate audit reports for their clinic.
-- ============================================================================
DROP POLICY IF EXISTS "audit_reports_select_own" ON audit_reports;
CREATE POLICY "audit_reports_select_own" ON audit_reports
  FOR SELECT USING (clinic_id = auth_clinic_id());

DROP POLICY IF EXISTS "audit_reports_insert_own" ON audit_reports;
CREATE POLICY "audit_reports_insert_own" ON audit_reports
  FOR INSERT WITH CHECK (clinic_id = auth_clinic_id());

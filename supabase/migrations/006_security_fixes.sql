-- Migration 006: Security and quality fixes from Phase 1 review
-- Addresses: 8 CRITICAL, 7 HIGH, 12 WARNING issues
-- No hardcoded product name in this file.

-- ============================================================================
-- C3: auth_user_role() helper function for role-based access control
-- SECURITY DEFINER: bypasses RLS on users to look up the caller's role.
-- Same pattern as auth_clinic_id() — avoids circular RLS dependency.
-- ============================================================================
CREATE OR REPLACE FUNCTION auth_user_role()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  clerk_sub TEXT;
  user_role TEXT;
BEGIN
  clerk_sub := auth.jwt() ->> 'sub';

  IF clerk_sub IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT role INTO user_role
  FROM users
  WHERE clerk_user_id = clerk_sub
  LIMIT 1;

  RETURN user_role;
END;
$$;

-- RLS policies call auth_clinic_id() and auth_user_role() during evaluation.
-- Both must be executable by anon and authenticated. Revoke from PUBLIC to
-- close the default grant, then re-grant explicitly to the roles that need it.
REVOKE EXECUTE ON FUNCTION auth_clinic_id() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION auth_user_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_clinic_id() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION auth_user_role() TO anon, authenticated;

-- ============================================================================
-- C5: SET search_path on ALL SECURITY DEFINER functions (CVE-2024-7348)
-- Functions being CREATE OR REPLACED below include SET search_path in their
-- definitions. For functions whose bodies are unchanged, use ALTER FUNCTION.
-- ============================================================================
ALTER FUNCTION auth_clinic_id() SET search_path = public, pg_temp;
ALTER FUNCTION check_trial_expiry() SET search_path = public, pg_temp;
ALTER FUNCTION cleanup_inactive_clinics() SET search_path = public, pg_temp;
ALTER FUNCTION update_updated_at_column() SET search_path = public, pg_temp;

-- ============================================================================
-- C4: Revoke EXECUTE on cron and trigger functions from PUBLIC
-- These functions are only called by pg_cron (runs as postgres) or by
-- triggers. They must NOT be callable via PostgREST RPC by anon/authenticated.
-- ============================================================================
REVOKE EXECUTE ON FUNCTION update_credential_statuses() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION scan_expiring_credentials() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION check_trial_expiry() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION cleanup_inactive_clinics() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION audit_credential_changes() FROM PUBLIC;

-- ============================================================================
-- C6: Rewrite update_credential_statuses — fix stuck-expired bug
-- Remove status != guards so renewed credentials can recover from 'expired'.
-- Use timezone-safe date comparison: (expiration_date AT TIME ZONE 'UTC')::DATE
-- ============================================================================
CREATE OR REPLACE FUNCTION update_credential_statuses()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE credentials
  SET status = 'expired'
  WHERE expiration_date IS NOT NULL
    AND (expiration_date AT TIME ZONE 'UTC')::DATE < CURRENT_DATE;

  UPDATE credentials
  SET status = 'expiring'
  WHERE expiration_date IS NOT NULL
    AND (expiration_date AT TIME ZONE 'UTC')::DATE >= CURRENT_DATE
    AND (expiration_date AT TIME ZONE 'UTC')::DATE <= CURRENT_DATE + 90;

  UPDATE credentials
  SET status = 'valid'
  WHERE expiration_date IS NOT NULL
    AND (expiration_date AT TIME ZONE 'UTC')::DATE > CURRENT_DATE + 90;
END;
$$;

-- ============================================================================
-- C8 + W2 + W3 + H3: Rewrite scan_expiring_credentials
-- - C8: Add clinics plan filter — skip expired_trial/inactive clinics
-- - W2:  Use timezone-safe date comparison
-- - W3:  Idempotency guard — skip if alert already sent today for this
--        credential + days_before combination
-- - H3:  Include X-Cron-Secret header for Edge Function authentication
-- ============================================================================
CREATE OR REPLACE FUNCTION scan_expiring_credentials()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  record RECORD;
  edge_function_url TEXT;
  cron_secret TEXT;
BEGIN
  edge_function_url := current_setting('app.edge_function_url', true);
  cron_secret := current_setting('app.cron_secret', true);

  IF edge_function_url IS NULL OR edge_function_url = '' THEN
    RAISE WARNING 'app.edge_function_url not set, skipping credential scan';
    RETURN;
  END IF;

  edge_function_url := rtrim(edge_function_url, '/') || '/send-credential-alert';

  FOR record IN
    SELECT c.id, c.clinic_id, c.expiration_date,
           ((c.expiration_date AT TIME ZONE 'UTC')::DATE - CURRENT_DATE) AS days_before
    FROM credentials c
    INNER JOIN staff_members sm ON c.staff_member_id = sm.id
    INNER JOIN clinics cl ON c.clinic_id = cl.id
    WHERE c.expiration_date IS NOT NULL
      AND ((c.expiration_date AT TIME ZONE 'UTC')::DATE - CURRENT_DATE) IN (90, 60, 30, 7)
      AND sm.deleted_at IS NULL
      AND cl.plan IN ('trial', 'solo', 'practice', 'multi_location')
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
        'X-Cron-Secret', cron_secret
      ),
      body := jsonb_build_object(
        'credential_id', record.id,
        'clinic_id', record.clinic_id,
        'days_before', record.days_before
      )
    );
  END LOOP;
END;
$$;

-- ============================================================================
-- W1: Rewrite audit_credential_changes — use auth.jwt() ->> 'sub' consistently
-- Also add SET search_path for C5 compliance.
-- changed_by = NULL for cron-driven updates (no JWT in session).
-- ============================================================================
CREATE OR REPLACE FUNCTION audit_credential_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  clerk_sub TEXT;
BEGIN
  clerk_sub := auth.jwt() ->> 'sub';

  IF TG_OP = 'DELETE' THEN
    INSERT INTO credential_audit (credential_id, clinic_id, action, changed_by, old_values)
    VALUES (OLD.id, OLD.clinic_id, 'DELETE', clerk_sub, to_jsonb(OLD));
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO credential_audit (credential_id, clinic_id, action, changed_by, old_values, new_values)
    VALUES (NEW.id, NEW.clinic_id, 'UPDATE', clerk_sub, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO credential_audit (credential_id, clinic_id, action, changed_by, new_values)
    VALUES (NEW.id, NEW.clinic_id, 'INSERT', clerk_sub, to_jsonb(NEW));
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

-- ============================================================================
-- H6: Add updated_at column + trigger to credential_types
-- ============================================================================
ALTER TABLE credential_types ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DROP TRIGGER IF EXISTS trigger_credential_types_updated_at ON credential_types;
CREATE TRIGGER trigger_credential_types_updated_at BEFORE UPDATE ON credential_types
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- H7: Make trial_end_date NOT NULL (AGENTS.md convention: all dates NOT NULL)
-- ============================================================================
UPDATE clinics SET trial_end_date = NOW() + INTERVAL '14 days' WHERE trial_end_date IS NULL;
ALTER TABLE clinics ALTER COLUMN trial_end_date SET NOT NULL;
ALTER TABLE clinics ALTER COLUMN trial_end_date SET DEFAULT (NOW() + INTERVAL '14 days');

-- ============================================================================
-- W11: Make procedures_performed NOT NULL (nullable + default is contradictory)
-- ============================================================================
UPDATE staff_members SET procedures_performed = '{}' WHERE procedures_performed IS NULL;
ALTER TABLE staff_members ALTER COLUMN procedures_performed SET NOT NULL;

-- ============================================================================
-- C7: Grant service_role on credential_audit
-- The blanket GRANT in migration 002 ran before this table was created in 004.
-- ============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON credential_audit TO service_role;

-- ============================================================================
-- W4: Add composite indexes for dashboard query patterns
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_credentials_clinic_id_status ON credentials(clinic_id, status);
CREATE INDEX IF NOT EXISTS idx_credentials_clinic_id_expiration ON credentials(clinic_id, expiration_date);
CREATE INDEX IF NOT EXISTS idx_alert_logs_clinic_id_sent_at ON alert_logs(clinic_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_staff_members_clinic_id_deleted ON staff_members(clinic_id, deleted_at);

-- ============================================================================
-- W5: Drop redundant idx_users_clerk_user_id
-- The UNIQUE constraint on clerk_user_id already creates a B-tree index.
-- ============================================================================
DROP INDEX IF EXISTS idx_users_clerk_user_id;

-- ============================================================================
-- C2: Remove client-writable UPDATE on clinics
-- plan and trial_end_date are ONLY writable via:
--   - Polar webhook (service role, bypasses RLS)
--   - pg_cron functions (SECURITY DEFINER, runs as postgres)
-- All clinic profile updates go through Server Components using service role.
-- ============================================================================
DROP POLICY IF EXISTS "clinics_update_own" ON clinics;
REVOKE UPDATE ON clinics FROM anon, authenticated;

-- ============================================================================
-- RLS POLICY REWRITES
-- C1: Add WITH CHECK to all UPDATE policies (prevents clinic_id migration)
-- C3: Add role enforcement to all write policies
-- H1: audit_reports INSERT requires owner/manager
-- H2: users UPDATE requires owner role
-- W6: credentials SELECT filters out soft-deleted staff members' credentials
-- W12: Wrap auth_clinic_id() in (SELECT ...) for single evaluation per query
-- ============================================================================

-- ---------------------------------------------------------------------------
-- clinics: SELECT only (UPDATE revoked, no INSERT/DELETE via anon key)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "clinics_select_own" ON clinics;
CREATE POLICY "clinics_select_own" ON clinics
  FOR SELECT USING (id = (SELECT auth_clinic_id()));

-- ---------------------------------------------------------------------------
-- users: SELECT all clinic users, INSERT/UPDATE owner-only
-- Note: first user during onboarding is created via service role (bypasses
-- RLS). Subsequent users (invitations) require the inviter to be an owner.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "users_select_own_clinic" ON users;
CREATE POLICY "users_select_own_clinic" ON users
  FOR SELECT USING (clinic_id = (SELECT auth_clinic_id()));

DROP POLICY IF EXISTS "users_insert_own_clinic" ON users;
CREATE POLICY "users_insert_own_clinic" ON users
  FOR INSERT WITH CHECK (
    clinic_id = (SELECT auth_clinic_id())
    AND (SELECT auth_user_role()) = 'owner'
  );

DROP POLICY IF EXISTS "users_update_own_clinic" ON users;
CREATE POLICY "users_update_own_clinic" ON users
  FOR UPDATE
  USING (clinic_id = (SELECT auth_clinic_id()))
  WITH CHECK (
    clinic_id = (SELECT auth_clinic_id())
    AND (SELECT auth_user_role()) = 'owner'
  );

-- ---------------------------------------------------------------------------
-- credential_types: SELECT global + own, write owner/manager only
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "credential_types_select" ON credential_types;
CREATE POLICY "credential_types_select" ON credential_types
  FOR SELECT USING (
    clinic_id IS NULL OR clinic_id = (SELECT auth_clinic_id())
  );

DROP POLICY IF EXISTS "credential_types_insert_own" ON credential_types;
CREATE POLICY "credential_types_insert_own" ON credential_types
  FOR INSERT WITH CHECK (
    clinic_id = (SELECT auth_clinic_id())
    AND (SELECT auth_user_role()) IN ('owner', 'manager')
  );

DROP POLICY IF EXISTS "credential_types_update_own" ON credential_types;
CREATE POLICY "credential_types_update_own" ON credential_types
  FOR UPDATE
  USING (clinic_id = (SELECT auth_clinic_id()))
  WITH CHECK (
    clinic_id = (SELECT auth_clinic_id())
    AND (SELECT auth_user_role()) IN ('owner', 'manager')
  );

DROP POLICY IF EXISTS "credential_types_delete_own" ON credential_types;
CREATE POLICY "credential_types_delete_own" ON credential_types
  FOR DELETE USING (
    clinic_id = (SELECT auth_clinic_id())
    AND (SELECT auth_user_role()) IN ('owner', 'manager')
  );

-- ---------------------------------------------------------------------------
-- staff_members: SELECT all clinic staff, write owner/manager only
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "staff_members_select_own" ON staff_members;
CREATE POLICY "staff_members_select_own" ON staff_members
  FOR SELECT USING (clinic_id = (SELECT auth_clinic_id()));

DROP POLICY IF EXISTS "staff_members_insert_own" ON staff_members;
CREATE POLICY "staff_members_insert_own" ON staff_members
  FOR INSERT WITH CHECK (
    clinic_id = (SELECT auth_clinic_id())
    AND (SELECT auth_user_role()) IN ('owner', 'manager')
  );

DROP POLICY IF EXISTS "staff_members_update_own" ON staff_members;
CREATE POLICY "staff_members_update_own" ON staff_members
  FOR UPDATE
  USING (clinic_id = (SELECT auth_clinic_id()))
  WITH CHECK (
    clinic_id = (SELECT auth_clinic_id())
    AND (SELECT auth_user_role()) IN ('owner', 'manager')
  );

DROP POLICY IF EXISTS "staff_members_delete_own" ON staff_members;
CREATE POLICY "staff_members_delete_own" ON staff_members
  FOR DELETE USING (
    clinic_id = (SELECT auth_clinic_id())
    AND (SELECT auth_user_role()) IN ('owner', 'manager')
  );

-- ---------------------------------------------------------------------------
-- credentials: SELECT excludes soft-deleted staff, write owner/manager only
-- W6: credentials of soft-deleted staff are hidden at the DB level.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "credentials_select_own" ON credentials;
CREATE POLICY "credentials_select_own" ON credentials
  FOR SELECT USING (
    clinic_id = (SELECT auth_clinic_id())
    AND staff_member_id IN (
      SELECT id FROM staff_members WHERE deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "credentials_insert_own" ON credentials;
CREATE POLICY "credentials_insert_own" ON credentials
  FOR INSERT WITH CHECK (
    clinic_id = (SELECT auth_clinic_id())
    AND (SELECT auth_user_role()) IN ('owner', 'manager')
  );

DROP POLICY IF EXISTS "credentials_update_own" ON credentials;
CREATE POLICY "credentials_update_own" ON credentials
  FOR UPDATE
  USING (clinic_id = (SELECT auth_clinic_id()))
  WITH CHECK (
    clinic_id = (SELECT auth_clinic_id())
    AND (SELECT auth_user_role()) IN ('owner', 'manager')
  );

DROP POLICY IF EXISTS "credentials_delete_own" ON credentials;
CREATE POLICY "credentials_delete_own" ON credentials
  FOR DELETE USING (
    clinic_id = (SELECT auth_clinic_id())
    AND (SELECT auth_user_role()) IN ('owner', 'manager')
  );

-- ---------------------------------------------------------------------------
-- alert_logs: SELECT only (writes from Edge Functions via service role)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "alert_logs_select_own" ON alert_logs;
CREATE POLICY "alert_logs_select_own" ON alert_logs
  FOR SELECT USING (clinic_id = (SELECT auth_clinic_id()));

-- ---------------------------------------------------------------------------
-- audit_reports: SELECT all, INSERT owner/manager only (H1: prevents forgery)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "audit_reports_select_own" ON audit_reports;
CREATE POLICY "audit_reports_select_own" ON audit_reports
  FOR SELECT USING (clinic_id = (SELECT auth_clinic_id()));

DROP POLICY IF EXISTS "audit_reports_insert_own" ON audit_reports;
CREATE POLICY "audit_reports_insert_own" ON audit_reports
  FOR INSERT WITH CHECK (
    clinic_id = (SELECT auth_clinic_id())
    AND (SELECT auth_user_role()) IN ('owner', 'manager')
  );

-- ---------------------------------------------------------------------------
-- credential_audit: SELECT only (written by trigger, no client writes)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "credential_audit_select_own" ON credential_audit;
CREATE POLICY "credential_audit_select_own" ON credential_audit
  FOR SELECT USING (clinic_id = (SELECT auth_clinic_id()));

-- ============================================================================
-- H3 + M4: Database-level settings for cron functions
-- H3: app.cron_secret — shared secret for Edge Function authentication.
--     Override in production with a cryptographically random value.
-- M4: app.edge_function_url — must be set or alert pipeline silently no-ops.
--     Local dev points to the local Supabase Edge Functions endpoint.
-- Both settings are optional — the scan function handles NULL gracefully
-- (RAISE WARNING for missing URL, NULL header for missing secret).
-- Set these in production via: ALTER DATABASE <db> SET app.cron_secret = '...'
-- ============================================================================
DO $$
BEGIN
  BEGIN
    ALTER DATABASE postgres SET app.cron_secret = 'dev-cron-secret-change-in-production';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'Cannot set app.cron_secret via ALTER DATABASE — set manually in production';
  END;
  BEGIN
    ALTER DATABASE postgres SET app.edge_function_url = 'http://127.0.0.1:54321/functions/v1';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'Cannot set app.edge_function_url via ALTER DATABASE — set manually in production';
  END;
END $$;

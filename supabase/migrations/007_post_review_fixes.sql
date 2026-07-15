-- Migration 007: Post-review fixes
-- Addresses remaining issues from second review pass:
-- N1: Restore IS DISTINCT FROM guards on update_credential_statuses
-- N2: Remove dev cron secret, refuse to send when secret is empty
-- N3: Make soft-delete handling consistent across staff_members and credentials
-- L2: Restrict service_role to SELECT, INSERT on credential_audit (append-only)
-- L4: Prevent clerk_user_id and clinic_id changes via triggers
-- W2: Document intentional FK omission on credential_audit
-- W10: Add index on users.email
-- S1: Scope credentials soft-delete subquery by clinic
-- S3: Use 'system' sentinel instead of NULL for cron-driven audit attribution

-- ============================================================================
-- N1: Restore IS DISTINCT FROM guards on update_credential_statuses
-- The original status != guards were CORRECT — they only skip no-op re-writes
-- (where status is already the target value), they never block genuine state
-- transitions. Removing them (006) caused daily redundant UPDATEs on every
-- credential, firing the audit trigger unnecessarily and bloating
-- credential_audit. IS DISTINCT FROM is null-safe and semantically identical
-- for NOT NULL columns.
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
    AND (expiration_date AT TIME ZONE 'UTC')::DATE < CURRENT_DATE
    AND status IS DISTINCT FROM 'expired';

  UPDATE credentials
  SET status = 'expiring'
  WHERE expiration_date IS NOT NULL
    AND (expiration_date AT TIME ZONE 'UTC')::DATE >= CURRENT_DATE
    AND (expiration_date AT TIME ZONE 'UTC')::DATE <= CURRENT_DATE + 90
    AND status IS DISTINCT FROM 'expiring';

  UPDATE credentials
  SET status = 'valid'
  WHERE expiration_date IS NOT NULL
    AND (expiration_date AT TIME ZONE 'UTC')::DATE > CURRENT_DATE + 90
    AND status IS DISTINCT FROM 'valid';
END;
$$;

-- ============================================================================
-- N2: Rewrite scan_expiring_credentials to refuse sending when secret is empty
-- A known dev secret committed in source is a security smell. The function
-- should fail-closed when the secret is not configured. This ensures the
-- alert pipeline is inert until an operator explicitly sets app.cron_secret.
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

  IF cron_secret IS NULL OR cron_secret = '' THEN
    RAISE WARNING 'app.cron_secret not set, skipping credential scan — set it before enabling alerts';
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

-- Reset app.cron_secret if 006 set it (remove the known dev default)
DO $$
BEGIN
  BEGIN
    ALTER DATABASE postgres RESET app.cron_secret;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Cannot reset app.cron_secret — not set or no permission';
  END;
END $$;

-- ============================================================================
-- S3: Update audit_credential_changes to use 'system' sentinel for cron updates
-- changed_by = NULL is ambiguous (could be a bug). COALESCE to 'system' when
-- no JWT is present so NULL unambiguously means "attribution lost."
-- ============================================================================
CREATE OR REPLACE FUNCTION audit_credential_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  clerk_sub TEXT;
  changed_by TEXT;
BEGIN
  clerk_sub := auth.jwt() ->> 'sub';
  changed_by := COALESCE(clerk_sub, 'system');

  IF TG_OP = 'DELETE' THEN
    INSERT INTO credential_audit (credential_id, clinic_id, action, changed_by, old_values)
    VALUES (OLD.id, OLD.clinic_id, 'DELETE', changed_by, to_jsonb(OLD));
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO credential_audit (credential_id, clinic_id, action, changed_by, old_values, new_values)
    VALUES (NEW.id, NEW.clinic_id, 'UPDATE', changed_by, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO credential_audit (credential_id, clinic_id, action, changed_by, new_values)
    VALUES (NEW.id, NEW.clinic_id, 'INSERT', changed_by, to_jsonb(NEW));
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

-- ============================================================================
-- L2: Restrict service_role to SELECT, INSERT on credential_audit (append-only)
-- 006 granted full CRUD (including DELETE) — audit trails must be immutable.
-- A compromised service key should not be able to erase forensic evidence.
-- ============================================================================
REVOKE UPDATE, DELETE ON credential_audit FROM service_role;

-- ============================================================================
-- W2: Document intentional FK omission on credential_audit
-- ============================================================================
COMMENT ON TABLE credential_audit IS 'Intentionally has no FK to credentials/clinics — audit trail must survive credential/clinic deletion for compliance retention.';

-- ============================================================================
-- W10: Add index on users.email for invitation lookup queries
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ============================================================================
-- L4: Prevent clerk_user_id changes after creation
-- An owner changing clerk_user_id to an attacker's Clerk sub enables
-- account-takeover persistence. This column is write-once.
-- ============================================================================
CREATE OR REPLACE FUNCTION prevent_clerk_user_id_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.clerk_user_id IS DISTINCT FROM OLD.clerk_user_id THEN
    RAISE EXCEPTION 'clerk_user_id cannot be changed after creation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_users_clerk_user_id_immutable ON users;
CREATE TRIGGER trigger_users_clerk_user_id_immutable
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION prevent_clerk_user_id_change();

-- ============================================================================
-- Defense in depth: Prevent clinic_id changes on all multi-tenant tables
-- WITH CHECK on UPDATE policies already prevents this at the RLS layer, but
-- a trigger ensures it cannot be bypassed even via SECURITY DEFINER functions.
-- ============================================================================
CREATE OR REPLACE FUNCTION prevent_clinic_id_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.clinic_id IS DISTINCT FROM OLD.clinic_id THEN
    RAISE EXCEPTION 'clinic_id cannot be changed after creation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_users_clinic_id_immutable ON users;
CREATE TRIGGER trigger_users_clinic_id_immutable
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION prevent_clinic_id_change();

DROP TRIGGER IF EXISTS trigger_staff_members_clinic_id_immutable ON staff_members;
CREATE TRIGGER trigger_staff_members_clinic_id_immutable
  BEFORE UPDATE ON staff_members
  FOR EACH ROW EXECUTE FUNCTION prevent_clinic_id_change();

DROP TRIGGER IF EXISTS trigger_credentials_clinic_id_immutable ON credentials;
CREATE TRIGGER trigger_credentials_clinic_id_immutable
  BEFORE UPDATE ON credentials
  FOR EACH ROW EXECUTE FUNCTION prevent_clinic_id_change();

-- ============================================================================
-- N3: Make soft-delete handling consistent
-- credentials_select_own already hides credentials of soft-deleted staff.
-- staff_members_select_own should also hide soft-deleted staff for consistency.
-- The app uses service role to access soft-deleted staff for the undelete UI.
-- ============================================================================
DROP POLICY IF EXISTS "staff_members_select_own" ON staff_members;
CREATE POLICY "staff_members_select_own" ON staff_members
  FOR SELECT USING (
    clinic_id = (SELECT auth_clinic_id())
    AND deleted_at IS NULL
  );

-- S1: Scope the credentials soft-delete subquery by clinic for performance
DROP POLICY IF EXISTS "credentials_select_own" ON credentials;
CREATE POLICY "credentials_select_own" ON credentials
  FOR SELECT USING (
    clinic_id = (SELECT auth_clinic_id())
    AND staff_member_id IN (
      SELECT id FROM staff_members
      WHERE deleted_at IS NULL
        AND clinic_id = (SELECT auth_clinic_id())
    )
  );

-- ============================================================================
-- Revoke EXECUTE on new trigger functions from PUBLIC
-- ============================================================================
REVOKE EXECUTE ON FUNCTION prevent_clerk_user_id_change() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION prevent_clinic_id_change() FROM PUBLIC;

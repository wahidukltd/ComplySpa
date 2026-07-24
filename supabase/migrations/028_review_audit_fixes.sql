-- Migration 028: Fix all findings from code/security/database review agents

-- ============================================================
-- F1: Fix set_audit_report_author() — references deleted column
-- clerk_user_id (renamed to auth_user_id in migration 025)
-- ============================================================
CREATE OR REPLACE FUNCTION set_audit_report_author()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  auth_sub TEXT;
  user_id UUID;
BEGIN
  auth_sub := auth.jwt() ->> 'sub';
  IF auth_sub IS NULL THEN
    NEW.generated_by_user_id := NULL;
    RETURN NEW;
  END IF;
  SELECT id INTO user_id FROM users WHERE auth_user_id = auth_sub;
  IF user_id IS NOT NULL THEN
    NEW.generated_by_user_id := user_id;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION set_audit_report_author() FROM PUBLIC;

-- ============================================================
-- F2: Fix check_cron_health() — missing SET search_path on
-- SECURITY DEFINER (CVE-2024-7348 risk). Migration 027
-- CREATE OR REPLACE dropped the search_path from migration 026.
-- ============================================================
CREATE OR REPLACE FUNCTION check_cron_health(p_jobname TEXT, p_max_stale_hours INTEGER DEFAULT 26)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_job_id BIGINT;
  v_last_run TIMESTAMPTZ;
  v_job_exists BOOLEAN;
BEGIN
  SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = p_jobname;
  v_job_exists := FOUND;

  IF NOT v_job_exists THEN RETURN FALSE; END IF;

  SELECT MAX(COALESCE(end_time, start_time)) INTO v_last_run
  FROM cron.job_run_details
  WHERE jobid = v_job_id;

  IF v_last_run IS NULL THEN RETURN FALSE; END IF;

  RETURN v_last_run > NOW() - (p_max_stale_hours * INTERVAL '1 hour');
END;
$$;

-- ============================================================
-- F3: Fix enforce_plan_limits() — credentials and users counts
-- don't filter deleted_at IS NULL, inconsistent with staff_members
-- ============================================================
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

-- ============================================================
-- F4: Fix audit_credential_changes() — lost 'system' sentinel
-- for cron-driven changes. Migration 025 rewrote the function
-- and dropped the COALESCE fallback.
-- ============================================================
CREATE OR REPLACE FUNCTION audit_credential_changes()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  auth_sub TEXT;
  changed_by TEXT;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  auth_sub := auth.jwt() ->> 'sub';
  changed_by := COALESCE(auth_sub, 'system');

  INSERT INTO credential_audit (
    credential_id, clinic_id, field_name, old_value, new_value, changed_by
  ) VALUES (
    NEW.id, NEW.clinic_id,
    CASE WHEN TG_OP = 'INSERT' THEN 'created' ELSE 'updated' END,
    CASE WHEN TG_OP = 'UPDATE' THEN row_to_json(OLD)::text ELSE NULL END,
    row_to_json(NEW)::text,
    changed_by
  );

  RETURN NEW;
END;
$$;

-- ============================================================
-- F5: Revoke anon write grants on alert_logs, alert_recipients,
-- credential_audit (append-only / server-write tables)
-- ============================================================
REVOKE INSERT, UPDATE, DELETE ON alert_logs FROM anon;
REVOKE INSERT, UPDATE, DELETE ON alert_recipients FROM anon;
REVOKE INSERT, UPDATE, DELETE ON credential_audit FROM anon;
REVOKE INSERT, UPDATE, DELETE ON credential_audit FROM authenticated;

-- ============================================================
-- F6: Revoke EXECUTE on trigger functions from anon/authenticated
-- to prevent direct RPC calls (defense-in-depth)
-- ============================================================
REVOKE EXECUTE ON FUNCTION enforce_plan_limits() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION rls_auto_enable() FROM anon, authenticated;

-- ============================================================
-- F7: Add RLS write-blocking policies on credential_audit
-- (append-only — only SECURITY DEFINER trigger should insert)
-- ============================================================
ALTER TABLE credential_audit FORCE ROW LEVEL SECURITY;
CREATE POLICY "credential_audit_no_direct_insert" ON credential_audIT
  FOR INSERT WITH CHECK (false);
CREATE POLICY "credential_audit_no_direct_update" ON credential_audit
  FOR UPDATE USING (false);
CREATE POLICY "credential_audit_no_direct_delete" ON credential_audit
  FOR DELETE USING (false);

-- ============================================================
-- F8: Fix update_credential_statuses() — skip soft-deleted
-- credentials and check for deleted staff members
-- ============================================================
CREATE OR REPLACE FUNCTION update_credential_statuses()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE credentials c
  SET status = 'expired'
  FROM staff_members s
  WHERE c.staff_member_id = s.id
    AND c.deleted_at IS NULL
    AND s.deleted_at IS NULL
    AND c.expiration_date < NOW()
    AND c.status != 'expired';

  UPDATE credentials c
  SET status = 'expiring'
  FROM staff_members s
  WHERE c.staff_member_id = s.id
    AND c.deleted_at IS NULL
    AND s.deleted_at IS NULL
    AND c.expiration_date BETWEEN NOW() AND NOW() + INTERVAL '90 days'
    AND c.status NOT IN ('expiring', 'expired');

  UPDATE credentials c
  SET status = 'valid'
  FROM staff_members s
  WHERE c.staff_member_id = s.id
    AND c.deleted_at IS NULL
    AND s.deleted_at IS NULL
    AND c.expiration_date > NOW() + INTERVAL '90 days'
    AND c.status != 'valid';
END;
$$;

-- ============================================================
-- F9: Remove hardcoded anon key from scan functions. Require
-- app.supabase_anon_key to be set via GUC (fail-closed).
-- ============================================================
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
      AND (c.expiration_date AT TIME ZONE 'UTC')::DATE < (CURRENT_DATE - 7)
      AND sm.deleted_at IS NULL
      AND cl.plan IN ('trial', 'solo', 'practice', 'multi_location')
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

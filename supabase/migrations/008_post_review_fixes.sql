-- Fixes identified by Phase 2 security + database review

-- 1. Partial indexes on unindexed FK columns (review finding #9)
CREATE INDEX IF NOT EXISTS idx_credentials_verified_by_user_id
  ON credentials(verified_by_user_id) WHERE verified_by_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_reports_generated_by_user_id
  ON audit_reports(generated_by_user_id) WHERE generated_by_user_id IS NOT NULL;

-- 2. Enforce users.email uniqueness (review finding #11)
-- Dedupe first: keep the oldest user record for any duplicate email
DELETE FROM users a USING (
  SELECT email, MIN(created_at) AS keep_created
  FROM users WHERE email IS NOT NULL
  GROUP BY email HAVING COUNT(*) > 1
) b
WHERE a.email = b.email AND a.created_at > b.keep_created;
ALTER TABLE users ADD CONSTRAINT users_email_unique UNIQUE (email);

-- 3. Trigger to prevent client-spoofing audit report authorship (review finding #10)
CREATE OR REPLACE FUNCTION set_audit_report_author()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  clerk_sub TEXT;
  user_id UUID;
BEGIN
  clerk_sub := auth.jwt() ->> 'sub';
  IF clerk_sub IS NULL THEN
    NEW.generated_by_user_id := NULL;
    RETURN NEW;
  END IF;
  SELECT id INTO user_id FROM users WHERE clerk_user_id = clerk_sub;
  IF user_id IS NOT NULL THEN
    NEW.generated_by_user_id := user_id;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION set_audit_report_author() FROM PUBLIC;

DROP TRIGGER IF EXISTS trigger_set_audit_report_author ON audit_reports;
CREATE TRIGGER trigger_set_audit_report_author
  BEFORE INSERT ON audit_reports
  FOR EACH ROW EXECUTE FUNCTION set_audit_report_author();

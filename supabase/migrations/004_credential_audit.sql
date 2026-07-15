-- Migration 004: Credential audit trail
-- Records every INSERT, UPDATE, and DELETE on the credentials table

-- ============================================================================
-- TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS credential_audit (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  credential_id UUID NOT NULL,
  clinic_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  changed_by TEXT,
  old_values JSONB,
  new_values JSONB,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credential_audit_credential_id ON credential_audit(credential_id);
CREATE INDEX IF NOT EXISTS idx_credential_audit_clinic_id ON credential_audit(clinic_id);
CREATE INDEX IF NOT EXISTS idx_credential_audit_changed_at ON credential_audit(changed_at);

-- ============================================================================
-- TRIGGER FUNCTION
-- SECURITY DEFINER: writes to credential_audit regardless of caller's RLS context.
-- Extracts Clerk user ID from the JWT sub claim for audit attribution.
-- ============================================================================
CREATE OR REPLACE FUNCTION audit_credential_changes()
RETURNS TRIGGER AS $$
DECLARE
  clerk_sub TEXT;
BEGIN
  clerk_sub := current_setting('request.jwt.claim.sub', true);

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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- TRIGGER
-- ============================================================================
DROP TRIGGER IF EXISTS trigger_credential_audit ON credentials;
CREATE TRIGGER trigger_credential_audit
  AFTER INSERT OR UPDATE OR DELETE ON credentials
  FOR EACH ROW EXECUTE FUNCTION audit_credential_changes();

-- ============================================================================
-- RLS
-- ============================================================================
ALTER TABLE credential_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "credential_audit_select_own" ON credential_audit;
CREATE POLICY "credential_audit_select_own" ON credential_audit
  FOR SELECT USING (clinic_id = auth_clinic_id());

GRANT SELECT ON credential_audit TO anon, authenticated;

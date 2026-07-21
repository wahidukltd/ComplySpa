-- Migration 018: Alert recipients table
-- Allows clinics to add additional email addresses that receive expiration alerts

CREATE TABLE IF NOT EXISTS alert_recipients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Constraints
ALTER TABLE alert_recipients ADD CONSTRAINT alert_recipients_email_check
  CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');

-- Indexes
CREATE INDEX IF NOT EXISTS idx_alert_recipients_clinic_id ON alert_recipients(clinic_id);
CREATE INDEX IF NOT EXISTS idx_alert_recipients_active ON alert_recipients(clinic_id, is_active);

-- Unique constraint: one email per clinic
CREATE UNIQUE INDEX IF NOT EXISTS idx_alert_recipients_clinic_email ON alert_recipients(clinic_id, email);

-- Updated_at trigger (follows AGENTS.md convention)
DROP TRIGGER IF EXISTS trigger_alert_recipients_updated_at ON alert_recipients;
CREATE TRIGGER trigger_alert_recipients_updated_at BEFORE UPDATE ON alert_recipients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE alert_recipients ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON alert_recipients TO authenticated;

DROP POLICY IF EXISTS "alert_recipients_select_own" ON alert_recipients;
CREATE POLICY "alert_recipients_select_own" ON alert_recipients
  FOR SELECT USING (clinic_id = (SELECT auth_clinic_id()));

DROP POLICY IF EXISTS "alert_recipients_insert_owner_manager" ON alert_recipients;
CREATE POLICY "alert_recipients_insert_owner_manager" ON alert_recipients
  FOR INSERT WITH CHECK (
    clinic_id = (SELECT auth_clinic_id())
    AND (SELECT auth_user_role()) IN ('owner', 'manager')
  );

DROP POLICY IF EXISTS "alert_recipients_update_owner_manager" ON alert_recipients;
CREATE POLICY "alert_recipients_update_owner_manager" ON alert_recipients
  FOR UPDATE USING (
    clinic_id = (SELECT auth_clinic_id())
    AND (SELECT auth_user_role()) IN ('owner', 'manager')
  ) WITH CHECK (
    clinic_id = (SELECT auth_clinic_id())
    AND (SELECT auth_user_role()) IN ('owner', 'manager')
  );

DROP POLICY IF EXISTS "alert_recipients_delete_owner_manager" ON alert_recipients;
CREATE POLICY "alert_recipients_delete_owner_manager" ON alert_recipients
  FOR DELETE USING (
    clinic_id = (SELECT auth_clinic_id())
    AND (SELECT auth_user_role()) IN ('owner', 'manager')
  );

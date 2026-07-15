-- Migration 001: Initial schema
-- All tables, indexes, triggers, and seed data for the application

-- ============================================================================
-- EXTENSIONS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- TABLES (parent tables first)
-- ============================================================================

CREATE TABLE IF NOT EXISTS clinics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  state TEXT,
  plan TEXT NOT NULL DEFAULT 'trial' CHECK (plan IN ('trial', 'expired_trial', 'inactive', 'solo', 'practice', 'multi_location')),
  polar_customer_id TEXT,
  trial_end_date TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '14 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'manager', 'viewer')),
  clerk_user_id TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS credential_types (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('license', 'training', 'insurance', 'agreement')),
  default_renewal_cycle_days INTEGER,
  is_custom BOOLEAN NOT NULL DEFAULT FALSE,
  clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS staff_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT CHECK (role IN ('RN', 'NP', 'PA', 'MD', 'DO', 'esthetician', 'MA', 'other')),
  hire_date TIMESTAMPTZ,
  email TEXT,
  phone TEXT,
  procedures_performed TEXT[] DEFAULT '{}',
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS credentials (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_member_id UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  credential_type_id UUID NOT NULL REFERENCES credential_types(id) ON DELETE RESTRICT,
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  license_number TEXT,
  state TEXT,
  issue_date TIMESTAMPTZ,
  expiration_date TIMESTAMPTZ,
  document_url TEXT,
  status TEXT NOT NULL DEFAULT 'valid' CHECK (status IN ('valid', 'expiring', 'expired')),
  verification_url TEXT,
  last_verified_date TIMESTAMPTZ,
  verified_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alert_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  credential_id UUID NOT NULL REFERENCES credentials(id) ON DELETE CASCADE,
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('email', 'sms')),
  days_before_expiration INTEGER NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  recipient TEXT NOT NULL,
  delivery_status TEXT NOT NULL DEFAULT 'pending' CHECK (delivery_status IN ('delivered', 'failed', 'pending')),
  resend_webhook_id TEXT,
  twilio_message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  generated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  report_url TEXT,
  report_data_snapshot JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_users_clerk_user_id ON users(clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_users_clinic_id ON users(clinic_id);

CREATE INDEX IF NOT EXISTS idx_credential_types_clinic_id ON credential_types(clinic_id);
CREATE INDEX IF NOT EXISTS idx_credential_types_is_custom ON credential_types(is_custom);

CREATE INDEX IF NOT EXISTS idx_staff_members_clinic_id ON staff_members(clinic_id);
CREATE INDEX IF NOT EXISTS idx_staff_members_deleted_at ON staff_members(deleted_at);

CREATE INDEX IF NOT EXISTS idx_credentials_staff_member_id ON credentials(staff_member_id);
CREATE INDEX IF NOT EXISTS idx_credentials_clinic_id ON credentials(clinic_id);
CREATE INDEX IF NOT EXISTS idx_credentials_status ON credentials(status);
CREATE INDEX IF NOT EXISTS idx_credentials_expiration_date ON credentials(expiration_date);
CREATE INDEX IF NOT EXISTS idx_credentials_credential_type_id ON credentials(credential_type_id);

CREATE INDEX IF NOT EXISTS idx_alert_logs_credential_id ON alert_logs(credential_id);
CREATE INDEX IF NOT EXISTS idx_alert_logs_clinic_id ON alert_logs(clinic_id);
CREATE INDEX IF NOT EXISTS idx_alert_logs_sent_at ON alert_logs(sent_at);

CREATE INDEX IF NOT EXISTS idx_audit_reports_clinic_id ON audit_reports(clinic_id);
CREATE INDEX IF NOT EXISTS idx_audit_reports_generated_at ON audit_reports(generated_at);

-- Unique index for seed data idempotency: prevents duplicate credential type
-- names globally (clinic_id IS NULL) and per-clinic for custom types
CREATE UNIQUE INDEX IF NOT EXISTS idx_credential_types_name_clinic_id
  ON credential_types(name, COALESCE(clinic_id, '00000000-0000-0000-0000-000000000000'));

-- ============================================================================
-- TRIGGERS: updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_clinics_updated_at ON clinics;
CREATE TRIGGER trigger_clinics_updated_at BEFORE UPDATE ON clinics
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_users_updated_at ON users;
CREATE TRIGGER trigger_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_staff_members_updated_at ON staff_members;
CREATE TRIGGER trigger_staff_members_updated_at BEFORE UPDATE ON staff_members
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_credentials_updated_at ON credentials;
CREATE TRIGGER trigger_credentials_updated_at BEFORE UPDATE ON credentials
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- SEED DATA: Pre-loaded credential types (global, clinic_id = NULL)
-- ============================================================================

INSERT INTO credential_types (name, category, default_renewal_cycle_days, is_custom, clinic_id)
VALUES
  ('Registered Nurse License', 'license', 730, FALSE, NULL),
  ('Nurse Practitioner License', 'license', 730, FALSE, NULL),
  ('Physician Assistant License', 'license', 730, FALSE, NULL),
  ('Physician License (MD/DO)', 'license', 730, FALSE, NULL),
  ('DEA Registration', 'license', 1095, FALSE, NULL),
  ('Laser Safety Certification', 'training', 365, FALSE, NULL),
  ('HIPAA Training', 'training', 365, FALSE, NULL),
  ('OSHA Bloodborne Pathogens Training', 'training', 365, FALSE, NULL),
  ('Infection Control Training', 'training', 365, FALSE, NULL),
  ('CPR/BLS Certification', 'training', 730, FALSE, NULL),
  ('Malpractice Insurance', 'insurance', 365, FALSE, NULL),
  ('Medical Director Agreement', 'agreement', 365, FALSE, NULL)
ON CONFLICT DO NOTHING;

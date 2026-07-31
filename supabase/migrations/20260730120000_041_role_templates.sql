-- Role Templates: global default templates + clinic overrides

CREATE TABLE role_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid REFERENCES clinics(id) ON DELETE CASCADE,
  role text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Partial unique indexes: plain UNIQUE (clinic_id, role) would NOT dedupe
-- global rows because Postgres treats NULLs as distinct in unique constraints.
CREATE UNIQUE INDEX idx_role_templates_global_role
  ON role_templates(role) WHERE clinic_id IS NULL;
CREATE UNIQUE INDEX idx_role_templates_clinic_role
  ON role_templates(clinic_id, role) WHERE clinic_id IS NOT NULL;
CREATE INDEX idx_role_templates_clinic ON role_templates(clinic_id);

CREATE TABLE role_template_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES role_templates(id) ON DELETE CASCADE,
  credential_type_id uuid NOT NULL REFERENCES credential_types(id) ON DELETE CASCADE,
  is_required boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  UNIQUE (template_id, credential_type_id)
);

CREATE INDEX idx_role_template_items_template ON role_template_items(template_id);

ALTER TABLE role_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_template_items ENABLE ROW LEVEL SECURITY;

-- Table-level grants (same convention as migration 002 / 018):
-- RLS policies control WHICH rows; GRANTs control WHICH operations.
GRANT SELECT, INSERT, UPDATE, DELETE ON role_templates TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON role_template_items TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON role_templates TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON role_template_items TO service_role;

-- Global defaults (clinic_id IS NULL): SELECT for all authenticated users
CREATE POLICY "role_templates_select" ON role_templates
  FOR SELECT USING (clinic_id IS NULL OR clinic_id = auth_clinic_id());

-- Clinic templates: owner/manager can INSERT/UPDATE/DELETE (global rows excluded)
CREATE POLICY "role_templates_manage" ON role_templates
  FOR ALL USING (clinic_id = auth_clinic_id())
  WITH CHECK (clinic_id = auth_clinic_id());

-- Items: SELECT visible for global + own clinic templates
CREATE POLICY "role_template_items_select" ON role_template_items
  FOR SELECT USING (
    template_id IN (SELECT id FROM role_templates WHERE clinic_id IS NULL OR clinic_id = auth_clinic_id())
  );

-- Items: manage only for own clinic templates
CREATE POLICY "role_template_items_manage" ON role_template_items
  FOR ALL USING (
    template_id IN (SELECT id FROM role_templates WHERE clinic_id = auth_clinic_id())
  );

-- Seed global default templates from the former TS constant
-- (ROLE_CREDENTIAL_REQUIRED_MAP + ROLE_CREDENTIAL_OPTIONAL_MAP).
-- Idempotent via ON CONFLICT on the partial unique indexes.

-- MD
INSERT INTO role_templates (clinic_id, role, is_active) VALUES (NULL, 'MD', true)
  ON CONFLICT DO NOTHING;
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, true, 0 FROM role_templates t, credential_types ct
WHERE t.role = 'MD' AND t.clinic_id IS NULL AND ct.name = 'Physician License (MD/DO)'
ON CONFLICT DO NOTHING;
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, true, 1 FROM role_templates t, credential_types ct
WHERE t.role = 'MD' AND t.clinic_id IS NULL AND ct.name = 'DEA Registration'
ON CONFLICT DO NOTHING;
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, true, 2 FROM role_templates t, credential_types ct
WHERE t.role = 'MD' AND t.clinic_id IS NULL AND ct.name = 'CPR/BLS Certification'
ON CONFLICT DO NOTHING;
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, true, 3 FROM role_templates t, credential_types ct
WHERE t.role = 'MD' AND t.clinic_id IS NULL AND ct.name = 'HIPAA Training'
ON CONFLICT DO NOTHING;
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, true, 4 FROM role_templates t, credential_types ct
WHERE t.role = 'MD' AND t.clinic_id IS NULL AND ct.name = 'OSHA Bloodborne Pathogens Training'
ON CONFLICT DO NOTHING;
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, true, 5 FROM role_templates t, credential_types ct
WHERE t.role = 'MD' AND t.clinic_id IS NULL AND ct.name = 'Malpractice Insurance'
ON CONFLICT DO NOTHING;
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, true, 6 FROM role_templates t, credential_types ct
WHERE t.role = 'MD' AND t.clinic_id IS NULL AND ct.name = 'Medical Director Agreement'
ON CONFLICT DO NOTHING;

-- DO
INSERT INTO role_templates (clinic_id, role, is_active) VALUES (NULL, 'DO', true)
  ON CONFLICT DO NOTHING;
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, true, 0 FROM role_templates t, credential_types ct
WHERE t.role = 'DO' AND t.clinic_id IS NULL AND ct.name = 'Physician License (MD/DO)'
ON CONFLICT DO NOTHING;
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, true, 1 FROM role_templates t, credential_types ct
WHERE t.role = 'DO' AND t.clinic_id IS NULL AND ct.name = 'DEA Registration'
ON CONFLICT DO NOTHING;
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, true, 2 FROM role_templates t, credential_types ct
WHERE t.role = 'DO' AND t.clinic_id IS NULL AND ct.name = 'CPR/BLS Certification'
ON CONFLICT DO NOTHING;
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, true, 3 FROM role_templates t, credential_types ct
WHERE t.role = 'DO' AND t.clinic_id IS NULL AND ct.name = 'HIPAA Training'
ON CONFLICT DO NOTHING;
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, true, 4 FROM role_templates t, credential_types ct
WHERE t.role = 'DO' AND t.clinic_id IS NULL AND ct.name = 'OSHA Bloodborne Pathogens Training'
ON CONFLICT DO NOTHING;
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, true, 5 FROM role_templates t, credential_types ct
WHERE t.role = 'DO' AND t.clinic_id IS NULL AND ct.name = 'Malpractice Insurance'
ON CONFLICT DO NOTHING;
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, true, 6 FROM role_templates t, credential_types ct
WHERE t.role = 'DO' AND t.clinic_id IS NULL AND ct.name = 'Medical Director Agreement'
ON CONFLICT DO NOTHING;

-- NP
INSERT INTO role_templates (clinic_id, role, is_active) VALUES (NULL, 'NP', true)
  ON CONFLICT DO NOTHING;
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, true, 0 FROM role_templates t, credential_types ct
WHERE t.role = 'NP' AND t.clinic_id IS NULL AND ct.name = 'Nurse Practitioner License'
ON CONFLICT DO NOTHING;
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, true, 1 FROM role_templates t, credential_types ct
WHERE t.role = 'NP' AND t.clinic_id IS NULL AND ct.name = 'DEA Registration'
ON CONFLICT DO NOTHING;
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, true, 2 FROM role_templates t, credential_types ct
WHERE t.role = 'NP' AND t.clinic_id IS NULL AND ct.name = 'CPR/BLS Certification'
ON CONFLICT DO NOTHING;
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, true, 3 FROM role_templates t, credential_types ct
WHERE t.role = 'NP' AND t.clinic_id IS NULL AND ct.name = 'HIPAA Training'
ON CONFLICT DO NOTHING;
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, true, 4 FROM role_templates t, credential_types ct
WHERE t.role = 'NP' AND t.clinic_id IS NULL AND ct.name = 'OSHA Bloodborne Pathogens Training'
ON CONFLICT DO NOTHING;
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, true, 5 FROM role_templates t, credential_types ct
WHERE t.role = 'NP' AND t.clinic_id IS NULL AND ct.name = 'Malpractice Insurance'
ON CONFLICT DO NOTHING;

-- PA
INSERT INTO role_templates (clinic_id, role, is_active) VALUES (NULL, 'PA', true)
  ON CONFLICT DO NOTHING;
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, true, 0 FROM role_templates t, credential_types ct
WHERE t.role = 'PA' AND t.clinic_id IS NULL AND ct.name = 'Physician Assistant License'
ON CONFLICT DO NOTHING;
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, true, 1 FROM role_templates t, credential_types ct
WHERE t.role = 'PA' AND t.clinic_id IS NULL AND ct.name = 'DEA Registration'
ON CONFLICT DO NOTHING;
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, true, 2 FROM role_templates t, credential_types ct
WHERE t.role = 'PA' AND t.clinic_id IS NULL AND ct.name = 'CPR/BLS Certification'
ON CONFLICT DO NOTHING;
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, true, 3 FROM role_templates t, credential_types ct
WHERE t.role = 'PA' AND t.clinic_id IS NULL AND ct.name = 'HIPAA Training'
ON CONFLICT DO NOTHING;
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, true, 4 FROM role_templates t, credential_types ct
WHERE t.role = 'PA' AND t.clinic_id IS NULL AND ct.name = 'OSHA Bloodborne Pathogens Training'
ON CONFLICT DO NOTHING;
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, true, 5 FROM role_templates t, credential_types ct
WHERE t.role = 'PA' AND t.clinic_id IS NULL AND ct.name = 'Malpractice Insurance'
ON CONFLICT DO NOTHING;

-- RN (required 4 + optional ACLS)
INSERT INTO role_templates (clinic_id, role, is_active) VALUES (NULL, 'RN', true)
  ON CONFLICT DO NOTHING;
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, true, 0 FROM role_templates t, credential_types ct
WHERE t.role = 'RN' AND t.clinic_id IS NULL AND ct.name = 'Registered Nurse License'
ON CONFLICT DO NOTHING;
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, true, 1 FROM role_templates t, credential_types ct
WHERE t.role = 'RN' AND t.clinic_id IS NULL AND ct.name = 'CPR/BLS Certification'
ON CONFLICT DO NOTHING;
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, true, 2 FROM role_templates t, credential_types ct
WHERE t.role = 'RN' AND t.clinic_id IS NULL AND ct.name = 'HIPAA Training'
ON CONFLICT DO NOTHING;
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, true, 3 FROM role_templates t, credential_types ct
WHERE t.role = 'RN' AND t.clinic_id IS NULL AND ct.name = 'OSHA Bloodborne Pathogens Training'
ON CONFLICT DO NOTHING;
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, false, 4 FROM role_templates t, credential_types ct
WHERE t.role = 'RN' AND t.clinic_id IS NULL AND ct.name = 'ACLS Certification'
ON CONFLICT DO NOTHING;

-- esthetician (required 4 + optional Chemical Peel)
INSERT INTO role_templates (clinic_id, role, is_active) VALUES (NULL, 'esthetician', true)
  ON CONFLICT DO NOTHING;
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, true, 0 FROM role_templates t, credential_types ct
WHERE t.role = 'esthetician' AND t.clinic_id IS NULL AND ct.name = 'Esthetician License'
ON CONFLICT DO NOTHING;
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, true, 1 FROM role_templates t, credential_types ct
WHERE t.role = 'esthetician' AND t.clinic_id IS NULL AND ct.name = 'CPR/BLS Certification'
ON CONFLICT DO NOTHING;
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, true, 2 FROM role_templates t, credential_types ct
WHERE t.role = 'esthetician' AND t.clinic_id IS NULL AND ct.name = 'HIPAA Training'
ON CONFLICT DO NOTHING;
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, true, 3 FROM role_templates t, credential_types ct
WHERE t.role = 'esthetician' AND t.clinic_id IS NULL AND ct.name = 'OSHA Bloodborne Pathogens Training'
ON CONFLICT DO NOTHING;
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, false, 4 FROM role_templates t, credential_types ct
WHERE t.role = 'esthetician' AND t.clinic_id IS NULL AND ct.name = 'Chemical Peel Certification'
ON CONFLICT DO NOTHING;

-- MA
INSERT INTO role_templates (clinic_id, role, is_active) VALUES (NULL, 'MA', true)
  ON CONFLICT DO NOTHING;
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, true, 0 FROM role_templates t, credential_types ct
WHERE t.role = 'MA' AND t.clinic_id IS NULL AND ct.name = 'CPR/BLS Certification'
ON CONFLICT DO NOTHING;
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, true, 1 FROM role_templates t, credential_types ct
WHERE t.role = 'MA' AND t.clinic_id IS NULL AND ct.name = 'HIPAA Training'
ON CONFLICT DO NOTHING;
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, true, 2 FROM role_templates t, credential_types ct
WHERE t.role = 'MA' AND t.clinic_id IS NULL AND ct.name = 'OSHA Bloodborne Pathogens Training'
ON CONFLICT DO NOTHING;

-- front_desk
INSERT INTO role_templates (clinic_id, role, is_active) VALUES (NULL, 'front_desk', true)
  ON CONFLICT DO NOTHING;
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, true, 0 FROM role_templates t, credential_types ct
WHERE t.role = 'front_desk' AND t.clinic_id IS NULL AND ct.name = 'HIPAA Training'
ON CONFLICT DO NOTHING;
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, true, 1 FROM role_templates t, credential_types ct
WHERE t.role = 'front_desk' AND t.clinic_id IS NULL AND ct.name = 'OSHA Bloodborne Pathogens Training'
ON CONFLICT DO NOTHING;

-- other (no requirements)
INSERT INTO role_templates (clinic_id, role, is_active) VALUES (NULL, 'other', true)
  ON CONFLICT DO NOTHING;

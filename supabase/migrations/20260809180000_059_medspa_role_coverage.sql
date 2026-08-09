-- Migration 059: complete med spa role coverage
-- Plan: docs/plans/2026-08-09-staff-wizard-role-coverage.md
--
-- Extends the 041 global role seed with the roles a real med spa staffs.
-- Every new role is grounded in the existing credential universe where
-- possible; two genuinely new global license types (LPN/LVN, massage
-- therapy) anchor roles no existing type covers. Also closes real template
-- gaps in the existing roles: 040 seeded Collaborative Practice Agreement /
-- Supervising Physician Agreement / injectables / IV / AED / infection
-- control types that 041 never attached to any role.
--
-- Semantics (unchanged from 041/057): additive template items affect FUTURE
-- hires only; existing staff are untouched until an explicit sync. All
-- inserts are idempotent (ON CONFLICT DO NOTHING, 041 pattern) and the new
-- global role names pass the 057 format CHECKs and the case-insensitive
-- global index.
--
-- CONSTRAINT: every seeded role has >= 1 REQUIRED item. A zero-required
-- template resolves to readiness "ready" (readiness.ts:116) - the `other`
-- false-green trap. No seeded role may repeat it.
--
-- Rollback: delete the 6 global role_templates rows (items cascade) and the
-- 2 new global credential_types rows; delete the item rows added to
-- MD/DO/NP/PA/RN/MA/esthetician. Do NOT roll back while staff hold the new
-- roles (the 057 trigger would reject them).

-- ============================================================================
-- 1. New global credential types (is_custom = false, clinic_id = NULL)
-- ============================================================================
INSERT INTO credential_types (name, category, default_renewal_cycle_days, is_custom)
VALUES ('LPN/LVN License', 'license', 730, false)
ON CONFLICT DO NOTHING;

INSERT INTO credential_types (name, category, default_renewal_cycle_days, is_custom)
VALUES ('Massage Therapy License', 'license', 730, false)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 2. New global role templates (all with >= 1 required item)
-- ============================================================================

-- lpn (LPN / LVN)
INSERT INTO role_templates (clinic_id, role, is_active) VALUES (NULL, 'lpn', true)
  ON CONFLICT DO NOTHING;
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, true, 0 FROM role_templates t, credential_types ct
WHERE t.role = 'lpn' AND t.clinic_id IS NULL AND ct.name = 'LPN/LVN License'
ON CONFLICT DO NOTHING;
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, true, 1 FROM role_templates t, credential_types ct
WHERE t.role = 'lpn' AND t.clinic_id IS NULL AND ct.name = 'CPR/BLS Certification'
ON CONFLICT DO NOTHING;
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, true, 2 FROM role_templates t, credential_types ct
WHERE t.role = 'lpn' AND t.clinic_id IS NULL AND ct.name = 'HIPAA Training'
ON CONFLICT DO NOTHING;
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, true, 3 FROM role_templates t, credential_types ct
WHERE t.role = 'lpn' AND t.clinic_id IS NULL AND ct.name = 'OSHA Bloodborne Pathogens Training'
ON CONFLICT DO NOTHING;
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, false, 4 FROM role_templates t, credential_types ct
WHERE t.role = 'lpn' AND t.clinic_id IS NULL AND ct.name = 'Infection Control Training'
ON CONFLICT DO NOTHING;
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, false, 5 FROM role_templates t, credential_types ct
WHERE t.role = 'lpn' AND t.clinic_id IS NULL AND ct.name = 'IV Therapy Certification'
ON CONFLICT DO NOTHING;

-- laser_tech (Laser Technician)
INSERT INTO role_templates (clinic_id, role, is_active) VALUES (NULL, 'laser_tech', true)
  ON CONFLICT DO NOTHING;
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, true, 0 FROM role_templates t, credential_types ct
WHERE t.role = 'laser_tech' AND t.clinic_id IS NULL AND ct.name = 'Laser Safety Certification'
ON CONFLICT DO NOTHING;
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, true, 1 FROM role_templates t, credential_types ct
WHERE t.role = 'laser_tech' AND t.clinic_id IS NULL AND ct.name = 'CPR/BLS Certification'
ON CONFLICT DO NOTHING;
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, true, 2 FROM role_templates t, credential_types ct
WHERE t.role = 'laser_tech' AND t.clinic_id IS NULL AND ct.name = 'HIPAA Training'
ON CONFLICT DO NOTHING;
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, true, 3 FROM role_templates t, credential_types ct
WHERE t.role = 'laser_tech' AND t.clinic_id IS NULL AND ct.name = 'OSHA Bloodborne Pathogens Training'
ON CONFLICT DO NOTHING;
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, true, 4 FROM role_templates t, credential_types ct
WHERE t.role = 'laser_tech' AND t.clinic_id IS NULL AND ct.name = 'Infection Control Training'
ON CONFLICT DO NOTHING;

-- cosmetologist (Cosmetologist)
INSERT INTO role_templates (clinic_id, role, is_active) VALUES (NULL, 'cosmetologist', true)
  ON CONFLICT DO NOTHING;
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, true, 0 FROM role_templates t, credential_types ct
WHERE t.role = 'cosmetologist' AND t.clinic_id IS NULL AND ct.name = 'Cosmetology License'
ON CONFLICT DO NOTHING;
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, true, 1 FROM role_templates t, credential_types ct
WHERE t.role = 'cosmetologist' AND t.clinic_id IS NULL AND ct.name = 'HIPAA Training'
ON CONFLICT DO NOTHING;
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, true, 2 FROM role_templates t, credential_types ct
WHERE t.role = 'cosmetologist' AND t.clinic_id IS NULL AND ct.name = 'OSHA Bloodborne Pathogens Training'
ON CONFLICT DO NOTHING;
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, false, 3 FROM role_templates t, credential_types ct
WHERE t.role = 'cosmetologist' AND t.clinic_id IS NULL AND ct.name = 'CPR/BLS Certification'
ON CONFLICT DO NOTHING;
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, false, 4 FROM role_templates t, credential_types ct
WHERE t.role = 'cosmetologist' AND t.clinic_id IS NULL AND ct.name = 'Chemical Peel Certification'
ON CONFLICT DO NOTHING;

-- phlebotomist (Phlebotomist)
INSERT INTO role_templates (clinic_id, role, is_active) VALUES (NULL, 'phlebotomist', true)
  ON CONFLICT DO NOTHING;
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, true, 0 FROM role_templates t, credential_types ct
WHERE t.role = 'phlebotomist' AND t.clinic_id IS NULL AND ct.name = 'Phlebotomy Certification'
ON CONFLICT DO NOTHING;
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, true, 1 FROM role_templates t, credential_types ct
WHERE t.role = 'phlebotomist' AND t.clinic_id IS NULL AND ct.name = 'CPR/BLS Certification'
ON CONFLICT DO NOTHING;
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, true, 2 FROM role_templates t, credential_types ct
WHERE t.role = 'phlebotomist' AND t.clinic_id IS NULL AND ct.name = 'HIPAA Training'
ON CONFLICT DO NOTHING;
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, true, 3 FROM role_templates t, credential_types ct
WHERE t.role = 'phlebotomist' AND t.clinic_id IS NULL AND ct.name = 'OSHA Bloodborne Pathogens Training'
ON CONFLICT DO NOTHING;
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, true, 4 FROM role_templates t, credential_types ct
WHERE t.role = 'phlebotomist' AND t.clinic_id IS NULL AND ct.name = 'Infection Control Training'
ON CONFLICT DO NOTHING;

-- massage_therapist (Massage Therapist)
INSERT INTO role_templates (clinic_id, role, is_active) VALUES (NULL, 'massage_therapist', true)
  ON CONFLICT DO NOTHING;
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, true, 0 FROM role_templates t, credential_types ct
WHERE t.role = 'massage_therapist' AND t.clinic_id IS NULL AND ct.name = 'Massage Therapy License'
ON CONFLICT DO NOTHING;
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, true, 1 FROM role_templates t, credential_types ct
WHERE t.role = 'massage_therapist' AND t.clinic_id IS NULL AND ct.name = 'CPR/BLS Certification'
ON CONFLICT DO NOTHING;
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, true, 2 FROM role_templates t, credential_types ct
WHERE t.role = 'massage_therapist' AND t.clinic_id IS NULL AND ct.name = 'HIPAA Training'
ON CONFLICT DO NOTHING;
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, true, 3 FROM role_templates t, credential_types ct
WHERE t.role = 'massage_therapist' AND t.clinic_id IS NULL AND ct.name = 'OSHA Bloodborne Pathogens Training'
ON CONFLICT DO NOTHING;
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, false, 4 FROM role_templates t, credential_types ct
WHERE t.role = 'massage_therapist' AND t.clinic_id IS NULL AND ct.name = 'Infection Control Training'
ON CONFLICT DO NOTHING;

-- practice_manager (Practice Manager)
INSERT INTO role_templates (clinic_id, role, is_active) VALUES (NULL, 'practice_manager', true)
  ON CONFLICT DO NOTHING;
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, true, 0 FROM role_templates t, credential_types ct
WHERE t.role = 'practice_manager' AND t.clinic_id IS NULL AND ct.name = 'HIPAA Training'
ON CONFLICT DO NOTHING;
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, true, 1 FROM role_templates t, credential_types ct
WHERE t.role = 'practice_manager' AND t.clinic_id IS NULL AND ct.name = 'OSHA Bloodborne Pathogens Training'
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 3. Close orphaned-type gaps in EXISTING templates (additive, future hires)
-- ============================================================================

-- MD / DO: Infection Control Training (required)
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, true, 7 FROM role_templates t, credential_types ct
WHERE t.role IN ('MD', 'DO') AND t.clinic_id IS NULL AND ct.name = 'Infection Control Training'
ON CONFLICT DO NOTHING;

-- NP: Collaborative Practice Agreement (required) + injectables (optional)
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, true, 6 FROM role_templates t, credential_types ct
WHERE t.role = 'NP' AND t.clinic_id IS NULL AND ct.name = 'Collaborative Practice Agreement'
ON CONFLICT DO NOTHING;
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, false, 7 FROM role_templates t, credential_types ct
WHERE t.role = 'NP' AND t.clinic_id IS NULL AND ct.name = 'Botox / Neurotoxin Certification'
ON CONFLICT DO NOTHING;
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, false, 8 FROM role_templates t, credential_types ct
WHERE t.role = 'NP' AND t.clinic_id IS NULL AND ct.name = 'Dermal Filler Certification'
ON CONFLICT DO NOTHING;
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, false, 9 FROM role_templates t, credential_types ct
WHERE t.role = 'NP' AND t.clinic_id IS NULL AND ct.name = 'Microneedling Certification'
ON CONFLICT DO NOTHING;

-- PA: Supervising Physician Agreement (required) + injectables (optional)
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, true, 6 FROM role_templates t, credential_types ct
WHERE t.role = 'PA' AND t.clinic_id IS NULL AND ct.name = 'Supervising Physician Agreement'
ON CONFLICT DO NOTHING;
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, false, 7 FROM role_templates t, credential_types ct
WHERE t.role = 'PA' AND t.clinic_id IS NULL AND ct.name = 'Botox / Neurotoxin Certification'
ON CONFLICT DO NOTHING;
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, false, 8 FROM role_templates t, credential_types ct
WHERE t.role = 'PA' AND t.clinic_id IS NULL AND ct.name = 'Dermal Filler Certification'
ON CONFLICT DO NOTHING;
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, false, 9 FROM role_templates t, credential_types ct
WHERE t.role = 'PA' AND t.clinic_id IS NULL AND ct.name = 'Microneedling Certification'
ON CONFLICT DO NOTHING;

-- RN: Infection Control Training (required) + IV Therapy + AED (optional)
-- NOTE: ACLS occupies sort_order 4 (041 seed) — the new RN items start at 5.
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, true, 5 FROM role_templates t, credential_types ct
WHERE t.role = 'RN' AND t.clinic_id IS NULL AND ct.name = 'Infection Control Training'
ON CONFLICT DO NOTHING;
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, false, 6 FROM role_templates t, credential_types ct
WHERE t.role = 'RN' AND t.clinic_id IS NULL AND ct.name = 'IV Therapy Certification'
ON CONFLICT DO NOTHING;
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, false, 7 FROM role_templates t, credential_types ct
WHERE t.role = 'RN' AND t.clinic_id IS NULL AND ct.name = 'AED / Emergency Response'
ON CONFLICT DO NOTHING;

-- MA: AED / Emergency Response (optional)
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, false, 3 FROM role_templates t, credential_types ct
WHERE t.role = 'MA' AND t.clinic_id IS NULL AND ct.name = 'AED / Emergency Response'
ON CONFLICT DO NOTHING;

-- esthetician: Microneedling Certification (optional)
INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
SELECT t.id, ct.id, false, 5 FROM role_templates t, credential_types ct
WHERE t.role = 'esthetician' AND t.clinic_id IS NULL AND ct.name = 'Microneedling Certification'
ON CONFLICT DO NOTHING;

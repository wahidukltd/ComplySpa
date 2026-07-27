-- Enterprise Staff Directory: add wizard fields, front_desk role, and Esthetician License

-- 1. New columns for staff_members
ALTER TABLE staff_members
  ADD COLUMN location text,
  ADD COLUMN department text,
  ADD COLUMN manager text;

-- 2. Extend role CHECK constraint to include front_desk
ALTER TABLE staff_members DROP CONSTRAINT staff_members_role_check;
ALTER TABLE staff_members ADD CONSTRAINT staff_members_role_check
  CHECK (role = ANY (ARRAY['RN', 'NP', 'PA', 'MD', 'DO', 'esthetician', 'MA', 'front_desk', 'other']));

-- 3. Insert Esthetician License credential type
INSERT INTO credential_types (name, category, default_renewal_cycle_days, is_custom)
VALUES ('Esthetician License', 'license', 730, false);

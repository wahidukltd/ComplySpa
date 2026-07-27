-- Intelligent Onboarding: per-staff onboarding progress tracking

-- 1. Create onboarding_items table
CREATE TABLE onboarding_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_member_id uuid NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  clinic_id uuid NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  credential_type_id uuid NOT NULL REFERENCES credential_types(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'skipped')),
  completed_at timestamptz,
  completed_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (staff_member_id, credential_type_id)
);

CREATE INDEX idx_onboarding_items_staff ON onboarding_items(staff_member_id);
CREATE INDEX idx_onboarding_items_clinic_status ON onboarding_items(clinic_id, status);

ALTER TABLE onboarding_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read onboarding items"
  ON onboarding_items FOR SELECT
  USING (clinic_id = auth_clinic_id());

CREATE POLICY "Insert onboarding items"
  ON onboarding_items FOR INSERT
  WITH CHECK (clinic_id = auth_clinic_id());

CREATE POLICY "Update onboarding items"
  ON onboarding_items FOR UPDATE
  USING (clinic_id = auth_clinic_id());

-- 2. Attach updated_at trigger using existing function
CREATE TRIGGER trigger_onboarding_items_updated_at
  BEFORE UPDATE ON onboarding_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 3. Create auto-complete function and trigger on credentials
CREATE FUNCTION auto_complete_onboarding_item()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id users.id%TYPE;
BEGIN
  SELECT id INTO v_user_id FROM users WHERE auth_user_id = auth.jwt() ->> 'sub';
  UPDATE onboarding_items
  SET status = 'completed', completed_at = NOW(), completed_by_user_id = v_user_id
  WHERE staff_member_id = NEW.staff_member_id
    AND credential_type_id = NEW.credential_type_id
    AND status = 'pending';
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_auto_complete_onboarding
  AFTER INSERT ON credentials
  FOR EACH ROW
  EXECUTE FUNCTION auto_complete_onboarding_item();
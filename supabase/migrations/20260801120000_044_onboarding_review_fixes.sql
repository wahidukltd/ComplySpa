-- 044: Fix review findings (2026-08-01) — auto-complete trigger status filter,
-- RLS role-gating on onboarding_items, composite read index, FK alignment.
-- Follow-up to 038/042. See plan "Review Findings — 2026-08-01" items 1, 6, 15, 16.

-- 1. Auto-complete trigger: previously only matched status='pending', so a
-- credential INSERT never completed a skipped required item — the checklist's
-- "Complete" affordance for skipped-required items was a permanent dead end.
CREATE OR REPLACE FUNCTION auto_complete_onboarding_item()
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
    AND status IN ('pending', 'skipped');
  RETURN NEW;
END;
$$;

-- 2. Role-gate onboarding_items writes. The 038 policies were clinic-scoped
-- only, letting a viewer PATCH/INSERT/DELETE own-clinic items via PostgREST
-- (bypassing app-level canEdit gating). SELECT stays clinic-scoped for all
-- authenticated roles. The auto-complete trigger runs as the credential-
-- inserting role, which is owner/manager under credentials_insert_own (006),
-- so the trigger path still passes. service_role bypasses RLS as before.
DROP POLICY IF EXISTS "Insert onboarding items" ON onboarding_items;
CREATE POLICY "Insert onboarding items"
  ON onboarding_items FOR INSERT
  WITH CHECK (clinic_id = auth_clinic_id() AND (SELECT auth_user_role()) IN ('owner', 'manager'));

DROP POLICY IF EXISTS "Update onboarding items" ON onboarding_items;
CREATE POLICY "Update onboarding items"
  ON onboarding_items FOR UPDATE
  USING (clinic_id = auth_clinic_id() AND (SELECT auth_user_role()) IN ('owner', 'manager'))
  WITH CHECK (clinic_id = auth_clinic_id() AND (SELECT auth_user_role()) IN ('owner', 'manager'));

DROP POLICY IF EXISTS "Delete onboarding items" ON onboarding_items;
CREATE POLICY "Delete onboarding items"
  ON onboarding_items FOR DELETE
  USING (clinic_id = auth_clinic_id() AND (SELECT auth_user_role()) IN ('owner', 'manager'));

-- 3. Composite index for the hot read path (staff list + overview):
-- WHERE clinic_id = ? AND staff_member_id IN (...)
CREATE INDEX IF NOT EXISTS idx_onboarding_items_clinic_staff
  ON onboarding_items(clinic_id, staff_member_id);

-- 4. Align credential_type_id FK with credentials (ON DELETE RESTRICT):
-- deleting a custom credential type must not silently cascade away onboarding
-- completion history (completed_at / completed_by_user_id). No type-delete
-- flow exists in the app today; RESTRICT makes future deletes deliberate,
-- matching credentials.credential_type_id behavior.
ALTER TABLE onboarding_items
  DROP CONSTRAINT IF EXISTS onboarding_items_credential_type_id_fkey;
ALTER TABLE onboarding_items
  ADD CONSTRAINT onboarding_items_credential_type_id_fkey
  FOREIGN KEY (credential_type_id) REFERENCES credential_types(id) ON DELETE RESTRICT;

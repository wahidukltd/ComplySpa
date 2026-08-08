-- Migration 055: Settings RLS hardening
-- Plan: docs/plans/2026-08-08-settings-administrative-control-center.md §4.1
--
-- Reality-corrected scope (verified against the live production schema on
-- 2026-08-08; see plan Implementation Notes):
--   * users INSERT / UPDATE WITH CHECK were ALREADY owner-gated by migration
--     006 (H2) — no policy change needed there beyond the UPDATE USING role
--     gate below (defense-in-depth: non-owners can't even see rows as
--     updatable).
--   * credential_types writes were ALREADY owner/manager-gated by 006 — no
--     change; pinned by integration-test assertions instead.
--   * clinics UPDATE is currently IMPOSSIBLE for authenticated users: the 002
--     grant was revoked and no UPDATE policy exists — the Clinic Profile save
--     (updateClinicProfile) has been failing at the database layer. This
--     migration restores the grant and creates the owner-only policy the
--     plan calls for.
--   * role_templates / role_template_items manage policies (041) have clinic
--     scoping but NO role gate — any clinic member (viewer included) can
--     write templates via direct API; 041's own comment claims owner/manager.
--     This migration adds the role gate and revokes anon DML (025 convention).

-- ============================================================================
-- clinics: restore UPDATE grant (authenticated only) + owner-only policy
-- ============================================================================
GRANT UPDATE ON clinics TO authenticated;

DROP POLICY IF EXISTS "clinics_update_own" ON clinics;
DROP POLICY IF EXISTS "clinics_update_owner" ON clinics;
CREATE POLICY "clinics_update_owner" ON clinics
  FOR UPDATE
  USING (
    id = (SELECT auth_clinic_id())
    AND (SELECT auth_user_role()) = 'owner'
  )
  WITH CHECK (
    id = (SELECT auth_clinic_id())
    AND (SELECT auth_user_role()) = 'owner'
  );

-- ============================================================================
-- users: owner-only UPDATE USING (WITH CHECK already owner-gated since 006)
-- ============================================================================
DROP POLICY IF EXISTS "users_update_own_clinic" ON users;
CREATE POLICY "users_update_own_clinic" ON users
  FOR UPDATE
  USING (
    clinic_id = (SELECT auth_clinic_id())
    AND (SELECT auth_user_role()) = 'owner'
  )
  WITH CHECK (
    clinic_id = (SELECT auth_clinic_id())
    AND (SELECT auth_user_role()) = 'owner'
  );

-- users INSERT stays as migration 006 defined it (owner-only WITH CHECK).

-- ============================================================================
-- role_templates: add the role gate the 041 comment claimed but never enforced
-- ============================================================================
DROP POLICY IF EXISTS "role_templates_manage" ON role_templates;
CREATE POLICY "role_templates_manage" ON role_templates
  FOR ALL
  USING (
    clinic_id = (SELECT auth_clinic_id())
    AND (SELECT auth_user_role()) IN ('owner', 'manager')
  )
  WITH CHECK (
    clinic_id = (SELECT auth_clinic_id())
    AND (SELECT auth_user_role()) IN ('owner', 'manager')
  );

-- ============================================================================
-- role_template_items: same role gate, scoped through the owning template
-- ============================================================================
DROP POLICY IF EXISTS "role_template_items_manage" ON role_template_items;
CREATE POLICY "role_template_items_manage" ON role_template_items
  FOR ALL
  USING (
    template_id IN (
      SELECT id FROM role_templates
      WHERE clinic_id = (SELECT auth_clinic_id())
    )
    AND (SELECT auth_user_role()) IN ('owner', 'manager')
  )
  WITH CHECK (
    template_id IN (
      SELECT id FROM role_templates
      WHERE clinic_id = (SELECT auth_clinic_id())
    )
    AND (SELECT auth_user_role()) IN ('owner', 'manager')
  );

-- ============================================================================
-- Revoke anon write grants on role template tables (migration 025 convention:
-- RLS already blocks anon — removing the GRANT eliminates the surface)
-- ============================================================================
REVOKE INSERT, UPDATE, DELETE ON role_templates FROM anon;
REVOKE INSERT, UPDATE, DELETE ON role_template_items FROM anon;

-- ============================================================================
-- Rollback (documented per plan §8): drop the new policies and restore the
-- prior definitions —
--   clinics: GRANT UPDATE revoked again; no UPDATE policy (002-era state).
--   users:   USING (clinic_id = (SELECT auth_clinic_id())) only, WITH CHECK
--            owner (migration 006 state).
--   role_templates / role_template_items: clinic-scoped FOR ALL without the
--            role gate (migration 041 state); anon DML grants restored.
-- ============================================================================

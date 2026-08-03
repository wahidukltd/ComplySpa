-- 048: deleteCredential D10 atomicity + soft-delete RLS fix (review 2026-08-03)
--
-- Part 1 — soft-delete is broken under RLS (pre-existing, migration 036):
-- the SELECT policies filter deleted_at IS NULL AND suspended_at IS NULL, and
-- Postgres rejects any UPDATE whose NEW row becomes invisible under the
-- table's SELECT policies ("new row violates row-level security policy").
-- The app soft-deletes via UPDATE, so deleteCredential / deleteStaffMember /
-- the wizard rollback branches all failed with 42501 for owner/manager roles.
-- Fix: scoped SECURITY DEFINER functions that perform the soft-delete as the
-- function owner (postgres) — the same pattern as create_clinic_for_user.
-- Blast radius is contained: EXECUTE is granted to authenticated only, every
-- statement is pinned by p_clinic_id, inputs are UUIDs (no dynamic SQL), and
-- SET search_path guards search-path hijacking (006 C5 convention).
--
-- Part 2 — D10 atomicity: the credential soft-delete, the
-- remaining-live-credential check and the conditional checklist revert run in
-- ONE transaction, so the item can never be reverted under a live credential
-- (count-then-revert race) and a revert failure can never leave the credential
-- deleted while the action reports an error.
--
-- Race analysis (READ COMMITTED, per-statement snapshots):
--   - concurrent same-type INSERT commits before the count  -> count >= 1, no revert
--   - concurrent same-type INSERT commits after the revert  -> its AFTER INSERT
--     auto-complete trigger (044) re-completes the item
--   - the FOR UPDATE lock on the credential row serializes concurrent deletes
-- Every ordering converges on "live credential exists => item completed".
--
-- Grants are pinned explicitly in both directions (AGENTS.md lesson: hosted
-- pg_default_acl auto-grants EXECUTE to anon/authenticated/service_role at
-- CREATE time; PUBLIC-only revokes are insufficient).

CREATE OR REPLACE FUNCTION soft_delete_staff_member(
  p_staff_id uuid,
  p_clinic_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- DEFINER bypasses RLS, so the role gate must live in the function body:
  -- only owner/manager may soft-delete (viewer EXECUTE is granted for the
  -- postgrest default but must never succeed).
  IF (SELECT auth_user_role()) NOT IN ('owner', 'manager') THEN
    RETURN false;
  END IF;

  UPDATE staff_members
  SET deleted_at = now()
  WHERE id = p_staff_id
    AND clinic_id = p_clinic_id
    AND deleted_at IS NULL
    AND suspended_at IS NULL;
  RETURN FOUND;
END;
$$;

REVOKE EXECUTE ON FUNCTION soft_delete_staff_member(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION soft_delete_staff_member(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION soft_delete_staff_member(uuid, uuid) FROM service_role;
GRANT EXECUTE ON FUNCTION soft_delete_staff_member(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION delete_credential_with_checklist_revert(
  p_credential_id uuid,
  p_staff_member_id uuid,
  p_clinic_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_credential_type_id uuid;
  v_remaining int;
BEGIN
  -- DEFINER bypasses RLS, so the role gate must live in the function body:
  -- only owner/manager may delete credentials (viewer EXECUTE is granted for
  -- the postgrest default but must never succeed).
  IF (SELECT auth_user_role()) NOT IN ('owner', 'manager') THEN
    RETURN jsonb_build_object('deleted', false);
  END IF;

  SELECT credential_type_id INTO v_credential_type_id
  FROM credentials
  WHERE id = p_credential_id
    AND clinic_id = p_clinic_id
    AND deleted_at IS NULL
    AND suspended_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('deleted', false);
  END IF;

  UPDATE credentials
  SET deleted_at = now()
  WHERE id = p_credential_id
    AND clinic_id = p_clinic_id;

  SELECT count(*) INTO v_remaining
  FROM credentials
  WHERE staff_member_id = p_staff_member_id
    AND credential_type_id = v_credential_type_id
    AND deleted_at IS NULL
    AND suspended_at IS NULL;

  IF v_remaining = 0 THEN
    UPDATE onboarding_items
    SET status = 'pending', completed_at = NULL, completed_by_user_id = NULL
    WHERE staff_member_id = p_staff_member_id
      AND credential_type_id = v_credential_type_id
      AND clinic_id = p_clinic_id;
  END IF;

  RETURN jsonb_build_object('deleted', true, 'reverted', v_remaining = 0);
END;
$$;

REVOKE EXECUTE ON FUNCTION delete_credential_with_checklist_revert(uuid, uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION delete_credential_with_checklist_revert(uuid, uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION delete_credential_with_checklist_revert(uuid, uuid, uuid) FROM service_role;
GRANT EXECUTE ON FUNCTION delete_credential_with_checklist_revert(uuid, uuid, uuid) TO authenticated;

-- 049: Scope 048 soft-delete RPCs to the CALLER's clinic (review 2026-08-04)
--
-- Root cause: the 048 SECURITY DEFINER functions gate the role
-- (auth_user_role() IN ('owner','manager')) but never bind p_clinic_id to the
-- caller's own clinic. DEFINER bypasses RLS, so ANY authenticated owner/manager
-- of ANY clinic could invoke the RPCs with another clinic's UUIDs and
-- soft-delete that clinic's credentials/staff + revert their onboarding items
-- (cross-tenant write). The app's deleteCredential was safe (it passes its own
-- user.clinic_id), but the security boundary was a bare EXECUTE-granted RPC.
--
-- Fix:
--  1. Both functions reject when (SELECT auth_clinic_id()) IS DISTINCT FROM
--     p_clinic_id — the caller's session clinic, not an attacker-supplied arg,
--     is the only acceptable tenant.
--  2. delete_credential_with_checklist_revert additionally pins
--     p_staff_member_id to the credential's own staff_member_id (cross-staff
--     onboarding revert was possible within a victim clinic).
-- auth_clinic_id() returns NULL for a caller with no users row — IS DISTINCT
-- FROM denies that case (safe direction).

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

  -- Tenant gate: the caller's session clinic must BE the target clinic.
  -- (auth_clinic_id() is NULL for unlinked callers -> denied.)
  IF (SELECT auth_clinic_id()) IS DISTINCT FROM p_clinic_id THEN
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

  -- Tenant gate: the caller's session clinic must BE the target clinic.
  IF (SELECT auth_clinic_id()) IS DISTINCT FROM p_clinic_id THEN
    RETURN jsonb_build_object('deleted', false);
  END IF;

  -- Staff gate: the credential must belong to p_staff_member_id (cross-staff
  -- onboarding revert was possible within a victim clinic).
  SELECT credential_type_id INTO v_credential_type_id
  FROM credentials
  WHERE id = p_credential_id
    AND clinic_id = p_clinic_id
    AND staff_member_id = p_staff_member_id
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

-- 058: staff soft-delete must not leave orphaned onboarding_items (plan
-- 2026-08-09 staff hardening). The checklist is pure internal state — once
-- the staff member is removed there is no UI that reads it and it must not
-- linger. Credentials are intentionally untouched: they are the audit record
-- and D10 (delete_credential_with_checklist_revert) depends on them.
-- Signature and grants are unchanged from 048; the body keeps the 049
-- session-derived clinic pin (auth_clinic_id() IS DISTINCT FROM p_clinic_id)
-- and gains the item cleanup inside the same transaction (soft-delete + item
-- delete are atomic — a failed item delete rolls the soft-delete back).

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

  -- Tenant gate (049): the caller's session clinic must BE the target clinic.
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
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Checklist rows die with the staff member (same transaction — a failed
  -- item delete rolls the soft-delete back, never a partial state).
  DELETE FROM onboarding_items
  WHERE staff_member_id = p_staff_id
    AND clinic_id = p_clinic_id;

  RETURN true;
END;
$$;

-- Re-pin grants both directions (AGENTS.md lesson: hosted pg_default_acl
-- auto-grants at CREATE time; PUBLIC-only revokes are insufficient).
REVOKE EXECUTE ON FUNCTION soft_delete_staff_member(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION soft_delete_staff_member(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION soft_delete_staff_member(uuid, uuid) FROM service_role;
GRANT EXECUTE ON FUNCTION soft_delete_staff_member(uuid, uuid) TO authenticated;

-- One-time sweep: heal pre-058 orphans — checklist rows of staff already
-- soft-deleted before this migration shipped. Idempotent; safe to re-run.
DELETE FROM onboarding_items oi
WHERE EXISTS (
  SELECT 1 FROM staff_members s
  WHERE s.id = oi.staff_member_id AND s.deleted_at IS NOT NULL
);

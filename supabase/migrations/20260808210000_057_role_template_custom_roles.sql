-- Migration 057: Role Templates - custom clinic roles (production hardening)
-- Plan: docs/plans/2026-08-08-role-templates-production-hardening.md
--
--   * staff_members.role CHECK relaxed from the 9-value enum to a format
--     constraint (length + character pattern) - custom roles become legal at
--     the DB boundary.
--   * role_templates.role gains the same format CHECK (additive).
--   * Case-insensitive partial unique indexes on both scopes (056 pattern) so
--     "RN" / "rn" duplicates are impossible; conservative fail-loud pre-clean.
--   * role_template_items_manage WITH CHECK extended: a template may only
--     reference credential types that are global or own-clinic (closes the
--     crafted cross-tenant item-insert hole).
--   * enforce_staff_role_template trigger: no staff row may carry a role that
--     has no active template (global or own-clinic) - the authoritative
--     "no dangling roles" boundary, app-layer friendly errors first.
--   * Four SECURITY INVOKER RPCs make template mutations atomic
--     (create / replace items / rename / delete), session-pinned to the
--     caller's clinic (049 pattern), P0001 error contract, updated_at
--     maintained (was stale since 041).
--
-- NOTE on the role-name pattern: PostgreSQL's ARE engine does NOT support
-- \p{...} property escapes (verified against the local PG 17 build -
-- "invalid regular expression: invalid escape \ sequence"; PG 15+ semantics).
-- The POSIX class [[:alpha:]] is Unicode-aware in a UTF8 database (verified:
-- 'é' matches), and [0-9] is ASCII-digit-only — identical to the zod mirror
-- in src/lib/utils/roles.ts (/^[\p{L}0-9].../ = Unicode letters + ASCII
-- digits). (Do NOT use [[:digit:]]: under en_US.UTF-8 it matches Unicode
-- digits like '١' — a superset of the zod side, locale-dependent, review
-- finding SF8.)
--
-- Rollback (documented per plan §8): drop the two CI indexes; drop the
-- trigger + enforce_staff_role_template(); drop the six functions
-- (create_role_template / replace_role_template_items / rename_role_template /
-- delete_role_template / validate_role_template_items /
-- touch_role_templates_updated_at) and the updated_at touch trigger; restore
-- staff_members_role_check to the 9-value form
-- (CHECK (role = ANY (ARRAY['RN','NP','PA','MD','DO','esthetician','MA','front_desk','other'])));
-- drop role_templates_role_check; restore the 055 role_template_items_manage
-- definition (WITH CHECK without the credential-type scope). Do NOT roll back
-- while custom-role data exists - the restored CHECK would reject it.

-- ============================================================================
-- 1. staff_members.role: enum CHECK -> format CHECK (NULL stays legal)
-- ============================================================================
ALTER TABLE staff_members DROP CONSTRAINT staff_members_role_check;
ALTER TABLE staff_members ADD CONSTRAINT staff_members_role_check
  CHECK (
    role IS NULL
    OR (
      char_length(role) BETWEEN 1 AND 80
      AND role ~ '^[[:alpha:]0-9][[:alpha:]0-9 _\-''().&/+]*$'
    )
  );

-- ============================================================================
-- 2. role_templates.role: format CHECK (additive - all seeded rows pass)
-- ============================================================================
ALTER TABLE role_templates ADD CONSTRAINT role_templates_role_check
  CHECK (
    char_length(role) BETWEEN 1 AND 80
    AND role ~ '^[[:alpha:]0-9][[:alpha:]0-9 _\-''().&/+]*$'
  );

-- ============================================================================
-- 3. Case-insensitive duplicate prevention (056 pattern, per scope)
-- ============================================================================
-- Scope-aware conservative pre-clean: RAISE if any case-variant duplicate
-- group contains a template WITH items (a template row's items cascade on
-- delete - never silently remove a template); otherwise delete item-less
-- later duplicates keeping the earliest. Overrides (same role, different
-- scope) are NOT duplicates by design - the partial indexes are per-scope.
DO $$
DECLARE
  v_conflict INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_conflict
  FROM role_templates a
  WHERE EXISTS (
      SELECT 1 FROM role_templates b
      WHERE b.id <> a.id
        AND b.clinic_id IS NOT DISTINCT FROM a.clinic_id
        AND lower(b.role) = lower(a.role)
    )
    AND EXISTS (SELECT 1 FROM role_template_items i WHERE i.template_id = a.id);

  IF v_conflict > 0 THEN
    RAISE EXCEPTION
      '057 pre-clean: case-variant duplicate role templates with items exist - reconcile manually before applying.';
  END IF;

  DELETE FROM role_templates a
  USING role_templates b
  WHERE a.id <> b.id
    AND a.clinic_id IS NOT DISTINCT FROM b.clinic_id
    AND lower(a.role) = lower(b.role)
    AND a.created_at > b.created_at
    AND NOT EXISTS (SELECT 1 FROM role_template_items i WHERE i.template_id = a.id);
END $$;

-- Role names are a PER-CLINIC namespace: the clinic index keys
-- (clinic_id, lower(role)). An index on lower(role) alone (clinic_id filtered
-- only in the WHERE) would reserve every name globally — clinic B could never
-- create a role named like clinic A's, and overrides of built-ins would work
-- for only the first clinic (review finding B1, empirically verified). The
-- global index is inherently single-tenant (clinic_id IS NULL).
CREATE UNIQUE INDEX idx_role_templates_clinic_role_ci
  ON role_templates (clinic_id, lower(role)) WHERE clinic_id IS NOT NULL;
CREATE UNIQUE INDEX idx_role_templates_global_role_ci
  ON role_templates (lower(role)) WHERE clinic_id IS NULL;

-- ============================================================================
-- 4. role_template_items RLS: credential-type scope on INSERT/UPDATE
-- ============================================================================
-- 055's WITH CHECK verified template ownership + the owner/manager role gate
-- but not the referenced credential type - a crafted request could attach
-- another clinic's custom type to a template. The type must be global or
-- own-clinic. USING stays the 055 shape (DELETE visibility unchanged).
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
    AND credential_type_id IN (
      SELECT id FROM credential_types
      WHERE clinic_id IS NULL OR clinic_id = (SELECT auth_clinic_id())
    )
  );

-- ============================================================================
-- 5. Staff role <-> template existence guard (authoritative boundary)
-- ============================================================================
-- Fires only when role is in the SET clause (INSERT or UPDATE OF role).
-- Verified writers: the app's staff-create actions, updateStaffMember's
-- role-change + D11 revert (both roles resolve), and rename_role_template
-- below (template row is renamed FIRST inside the same transaction, so the
-- staff UPDATE resolves the new name).
--
-- Race closing lives in the rename/delete RPCs' SHARE ROW EXCLUSIVE lock on
-- staff_members (review finding SF2): a concurrent staff INSERT blocks at the
-- table lock BEFORE this trigger runs, so the trigger always evaluates the
-- post-rename/delete committed state and rejects a stale role. A locking
-- SELECT here (FOR SHARE) was tried and abandoned: under RLS it returns zero
-- rows for non-owner roles (verified empirically — FOR SHARE on an RLS table
-- requires the row to satisfy the table's update-mode visibility, which the
-- global templates do not), which would fire this guard on every legitimate
-- insert.
CREATE FUNCTION enforce_staff_role_template() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM role_templates
    WHERE (clinic_id IS NULL OR clinic_id = NEW.clinic_id)
      AND role = NEW.role
      AND is_active
  ) THEN
    RAISE EXCEPTION
      'Role "%" has no active template. Create one in Settings > Role Templates first.',
      NEW.role
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_staff_members_role_template ON staff_members;
CREATE TRIGGER trigger_staff_members_role_template
  BEFORE INSERT OR UPDATE OF role ON staff_members
  FOR EACH ROW
  WHEN (NEW.role IS NOT NULL)
  EXECUTE FUNCTION enforce_staff_role_template();

-- ============================================================================
-- 6. Atomic mutation RPCs (SECURITY INVOKER - RLS applies to inner writes)
-- ============================================================================
-- Shared item validator: returns normalized (credential_type_id, is_required,
-- sort_order) rows; raises P0001 with a stable message on any invalid input.
-- The clinic comes from the session (049 principle — never a caller-supplied
-- clinic id, review finding SF3: this function is directly EXECUTE-able, so
-- the tenant must not be a request argument). The type-scope check here
-- mirrors the role_template_items WITH CHECK above (friendly error before the
-- policy rejects the insert). Duplicate credential_type_ids within the array
-- are rejected here (a UNIQUE violation would otherwise surface as a
-- misleading 23505 "role already exists").
CREATE FUNCTION validate_role_template_items(p_items JSONB)
RETURNS TABLE(credential_type_id UUID, is_required BOOLEAN, sort_order INTEGER)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinic_id UUID;
  v_item JSONB;
  v_type_id TEXT;
  v_required BOOLEAN;
  v_idx INTEGER := 0;
  v_seen_type_ids UUID[] := '{}';
BEGIN
  v_clinic_id := auth_clinic_id();

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'Invalid template items.' USING ERRCODE = 'P0001';
  END IF;
  IF jsonb_array_length(p_items) > 50 THEN
    RAISE EXCEPTION 'Too many template items (maximum 50).' USING ERRCODE = 'P0001';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_type_id := v_item->>'credential_type_id';
    BEGIN
      IF v_type_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM credential_types
        WHERE id = v_type_id::uuid
          AND (clinic_id IS NULL OR clinic_id = v_clinic_id)
      ) THEN
        RAISE EXCEPTION 'One or more credential types are not available to this clinic.'
          USING ERRCODE = 'P0001';
      END IF;

      IF v_type_id::uuid = ANY (v_seen_type_ids) THEN
        RAISE EXCEPTION 'Duplicate template items.' USING ERRCODE = 'P0001';
      END IF;
      v_seen_type_ids := v_seen_type_ids || v_type_id::uuid;
    EXCEPTION
      WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'Invalid credential type.' USING ERRCODE = 'P0001';
    END;

    -- The boolean cast gets its own guard: a non-boolean value must raise a
    -- truthful message, not the uuid path's 'Invalid credential type.'
    -- (re-review note).
    v_required := true;
    BEGIN
      v_required := COALESCE((v_item->>'is_required')::boolean, true);
    EXCEPTION
      WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'Invalid template items.' USING ERRCODE = 'P0001';
    END;

    RETURN QUERY SELECT v_type_id::uuid, v_required, v_idx;
    v_idx := v_idx + 1;
  END LOOP;
END;
$$;

-- create_role_template: role (trimmed, length pre-checked - the CHECK carries
-- the pattern), case-insensitive collision against OWN-clinic templates only
-- (same-name-as-global is the explicit override flow). Template + items in
-- one transaction. Returns the new template id.
CREATE FUNCTION create_role_template(p_role TEXT, p_items JSONB)
RETURNS UUID
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinic_id UUID;
  v_role TEXT;
  v_template_id UUID;
BEGIN
  v_clinic_id := auth_clinic_id();
  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = 'P0001';
  END IF;

  v_role := btrim(p_role);
  IF v_role IS NULL OR char_length(v_role) < 1 OR char_length(v_role) > 80 THEN
    RAISE EXCEPTION 'Role name must be 1 to 80 characters.' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM role_templates
    WHERE clinic_id = v_clinic_id AND lower(role) = lower(v_role)
  ) THEN
    RAISE EXCEPTION 'A role with this name already exists in your clinic.'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO role_templates (clinic_id, role, is_active, updated_at)
  VALUES (v_clinic_id, v_role, true, now())
  RETURNING id INTO v_template_id;

  IF p_items IS NOT NULL AND jsonb_array_length(p_items) > 0 THEN
    INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
    SELECT v_template_id, credential_type_id, is_required, sort_order
    FROM validate_role_template_items(p_items);
  END IF;

  RETURN v_template_id;
END;
$$;

-- replace_role_template_items: atomic delete-all + re-insert (no empty-reader
-- window, no best-effort restore). Template must belong to the caller's clinic.
CREATE FUNCTION replace_role_template_items(p_template_id UUID, p_items JSONB)
RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinic_id UUID;
BEGIN
  v_clinic_id := auth_clinic_id();
  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM role_templates WHERE id = p_template_id AND clinic_id = v_clinic_id
  ) THEN
    RAISE EXCEPTION 'Template not found' USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM role_template_items WHERE template_id = p_template_id;

  IF p_items IS NOT NULL AND jsonb_array_length(p_items) > 0 THEN
    INSERT INTO role_template_items (template_id, credential_type_id, is_required, sort_order)
    SELECT p_template_id, credential_type_id, is_required, sort_order
    FROM validate_role_template_items(p_items);
  END IF;

  UPDATE role_templates SET updated_at = now() WHERE id = p_template_id;
END;
$$;

-- rename_role_template: role name is the identifier everywhere, so a rename
-- moves the template AND every staff row holding the old role in the same
-- transaction (their requirements are untouched - onboarding_items are keyed
-- by (staff, credential_type), not role). Collision guard: the new name must
-- not case-insensitively match any global role or any OTHER own-clinic role -
-- otherwise staff would silently re-resolve to a different template. Global
-- templates are protected (clinic_id pin means only clinic rows resolve).
-- The template UPDATE runs FIRST so enforce_staff_role_template sees the new
-- name on the staff UPDATE.
--
-- Concurrency (review findings SF1/SF2, empirically proven): the SHARE ROW
-- EXCLUSIVE lock on staff_members blocks every concurrent staff INSERT/
-- UPDATE/DELETE at the statement level and serializes concurrent renames of
-- any template (SRE conflicts with itself), so v_old_role is always read from
-- a staff-frozen state and no late staff row can commit with the old name.
-- The template-row FOR UPDATE is defense-in-depth for non-staff writers.
-- Coarse by design: rename/delete are rare admin actions on a tiny table.
-- The rowcount guard turns a same-clinic viewer's RLS-blocked UPDATE into
-- the documented P0001 instead of a silent success (review finding SF4).
-- The auth_user_role() gate runs BEFORE the SRE lock (re-review finding):
-- EXECUTE is granted to all authenticated, and the lock is table-wide — a
-- viewer calling the RPC directly must not be able to acquire the global
-- staff_members lock (a sustained barrage would block every clinic's staff
-- writes). Owner/manager of ANOTHER clinic still passes the gate and is
-- denied by the clinic pin ("Template not found"). Returns the number of
-- staff moved (non-deleted rows only, N4).
CREATE FUNCTION rename_role_template(p_template_id UUID, p_new_role TEXT)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinic_id UUID;
  v_old_role TEXT;
  v_new_role TEXT;
  v_moved INTEGER;
BEGIN
  v_clinic_id := auth_clinic_id();
  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = 'P0001';
  END IF;

  -- 048 pattern: the role gate precedes any lock or data access.
  IF auth_user_role() NOT IN ('owner', 'manager') THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = 'P0001';
  END IF;

  LOCK TABLE staff_members IN SHARE ROW EXCLUSIVE MODE;

  SELECT role INTO v_old_role
  FROM role_templates
  WHERE id = p_template_id AND clinic_id = v_clinic_id
  FOR UPDATE;

  IF v_old_role IS NULL THEN
    RAISE EXCEPTION 'Template not found' USING ERRCODE = 'P0001';
  END IF;

  v_new_role := btrim(p_new_role);
  IF v_new_role IS NULL OR char_length(v_new_role) < 1 OR char_length(v_new_role) > 80 THEN
    RAISE EXCEPTION 'Role name must be 1 to 80 characters.' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM role_templates
    WHERE id <> p_template_id
      AND (clinic_id IS NULL OR clinic_id = v_clinic_id)
      AND lower(role) = lower(v_new_role)
  ) THEN
    RAISE EXCEPTION 'A role with this name already exists.' USING ERRCODE = 'P0001';
  END IF;

  UPDATE role_templates SET role = v_new_role, updated_at = now()
  WHERE id = p_template_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Template not found' USING ERRCODE = 'P0001';
  END IF;

  -- Sweep non-deleted rows (suspended staff included — they can be restored
  -- by reconcile_clinic_plan; permanently deleted rows are inert and excluded
  -- so the returned count matches the editor's dialog note, N4).
  UPDATE staff_members
  SET role = v_new_role
  WHERE clinic_id = v_clinic_id AND role = v_old_role
    AND deleted_at IS NULL;

  GET DIAGNOSTICS v_moved = ROW_COUNT;
  RETURN v_moved;
END;
$$;

-- delete_role_template: custom-role in-use guard - a custom role (no global
-- twin) held by staff cannot be deleted (it would strand them with a role
-- that has no template -> silent readiness "ready"). The count includes
-- suspended staff (deleted_at IS NULL only) — reconcile_clinic_plan can
-- restore them, so they must not be stranded (review finding N4 alignment).
-- An override (global twin exists) always deletes - that is the deterministic
-- "reset to global default" path and staff fall back to the global template.
-- The SHARE ROW EXCLUSIVE lock on staff_members (same rationale as the
-- rename RPC, review finding SF2) makes the in-use count authoritative:
-- no concurrent staff INSERT can commit while the lock is held, so the
-- count-then-delete sequence cannot strand a row. The auth_user_role() gate
-- precedes the lock (re-review finding — the lock is table-wide and EXECUTE
-- is granted to all authenticated; non-owners must not acquire it). The
-- rowcount guard turns a same-clinic viewer's RLS-blocked DELETE into the
-- documented P0001 instead of a silent 204 (SF4).
CREATE FUNCTION delete_role_template(p_template_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinic_id UUID;
  v_role TEXT;
  v_has_global_twin BOOLEAN;
  v_in_use INTEGER;
BEGIN
  v_clinic_id := auth_clinic_id();
  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = 'P0001';
  END IF;

  -- 048 pattern: the role gate precedes any lock or data access.
  IF auth_user_role() NOT IN ('owner', 'manager') THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = 'P0001';
  END IF;

  LOCK TABLE staff_members IN SHARE ROW EXCLUSIVE MODE;

  SELECT role INTO v_role
  FROM role_templates
  WHERE id = p_template_id AND clinic_id = v_clinic_id
  FOR UPDATE;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Template not found' USING ERRCODE = 'P0001';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM role_templates
    WHERE clinic_id IS NULL AND lower(role) = lower(v_role)
  ) INTO v_has_global_twin;

  IF NOT v_has_global_twin THEN
    SELECT COUNT(*) INTO v_in_use
    FROM staff_members
    WHERE clinic_id = v_clinic_id
      AND role = v_role
      AND deleted_at IS NULL;

    IF v_in_use > 0 THEN
      RAISE EXCEPTION
        'This role is assigned to % staff member(s). Reassign or remove them before deleting the template.',
        v_in_use
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  DELETE FROM role_templates WHERE id = p_template_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Template not found' USING ERRCODE = 'P0001';
  END IF;
END;
$$;

-- ============================================================================
-- 6b. updated_at maintenance on raw API writes (review finding N1)
-- ============================================================================
-- The RPCs write updated_at explicitly; this trigger covers direct
-- PostgREST UPDATEs of role_templates by an owner/manager (a pre-existing
-- surface that bypasses the RPCs). Role-name changes via raw API still skip
-- the staff sweep - accepted residual, documented: a trigger cannot
-- distinguish the rename RPC from a direct UPDATE (no custom GUCs on hosted
-- Supabase), and the app writes exclusively through the RPCs.
CREATE FUNCTION touch_role_templates_updated_at() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_role_templates_touch_updated_at ON role_templates;
CREATE TRIGGER trigger_role_templates_touch_updated_at
  BEFORE UPDATE ON role_templates
  FOR EACH ROW
  EXECUTE FUNCTION touch_role_templates_updated_at();

-- ============================================================================
-- 7. Grants (047 lesson: explicit role-specific REVOKEs - hosted
-- pg_default_acl re-grants EXECUTE at CREATE time to anon/authenticated/
-- service_role). EXECUTE pinned to authenticated only; the app actions gate
-- owner/manager before calling.
-- ============================================================================
REVOKE EXECUTE ON FUNCTION validate_role_template_items(JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION validate_role_template_items(JSONB) FROM anon, service_role;
GRANT EXECUTE ON FUNCTION validate_role_template_items(JSONB) TO authenticated;

REVOKE EXECUTE ON FUNCTION create_role_template(TEXT, JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION create_role_template(TEXT, JSONB) FROM anon, service_role;
GRANT EXECUTE ON FUNCTION create_role_template(TEXT, JSONB) TO authenticated;

REVOKE EXECUTE ON FUNCTION replace_role_template_items(UUID, JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION replace_role_template_items(UUID, JSONB) FROM anon, service_role;
GRANT EXECUTE ON FUNCTION replace_role_template_items(UUID, JSONB) TO authenticated;

REVOKE EXECUTE ON FUNCTION rename_role_template(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION rename_role_template(UUID, TEXT) FROM anon, service_role;
GRANT EXECUTE ON FUNCTION rename_role_template(UUID, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION delete_role_template(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION delete_role_template(UUID) FROM anon, service_role;
GRANT EXECUTE ON FUNCTION delete_role_template(UUID) TO authenticated;

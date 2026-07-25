-- Migration 024: Fix invitation flow for Supabase Auth migration
-- Issues:
--   C1: RLS blocks invitation claim lookup (admin client bypasses RLS in code)
--   C2: prevent_clerk_user_id_change trigger blocks empty→populated transition
--   C3: UNIQUE constraint prevents multiple pending invitations (use NULL sentinel)

-- ============================================================================
-- C2: Allow clerk_user_id to transition from empty to populated during signup
-- The original trigger rejects ANY change to clerk_user_id. Since invitation
-- flow populates it from '' → actual UUID, add exception for that case.
-- ============================================================================
CREATE OR REPLACE FUNCTION prevent_clerk_user_id_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.clerk_user_id IS NOT NULL AND OLD.clerk_user_id != '' AND
     NEW.clerk_user_id IS DISTINCT FROM OLD.clerk_user_id THEN
    RAISE EXCEPTION 'clerk_user_id cannot be changed after creation';
  END IF;
  RETURN NEW;
END;
$$;

-- ============================================================================
-- C3: Allow NULL clerk_user_id for pending invitations
-- Remove NOT NULL so multiple pending invitations can exist simultaneously.
-- Also allow UPDATE from NULL → actual UUID (the invitation claim flow).
-- ============================================================================
ALTER TABLE users ALTER COLUMN clerk_user_id DROP NOT NULL;

-- Update the UNIQUE constraint to support NULLs (Postgres UNIQUE allows
-- multiple NULLs — each NULL is considered distinct).
-- The existing index created by UNIQUE on clerk_user_id already handles this,
-- but we need the column to be nullable.

-- Revoke anon EXECUTE on trigger functions that were exposed via RPC
REVOKE EXECUTE ON FUNCTION audit_credential_changes() FROM anon;
REVOKE EXECUTE ON FUNCTION prevent_clerk_user_id_change() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION prevent_clinic_id_change() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION rls_auto_enable() FROM anon, authenticated;

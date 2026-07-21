-- Migration 019: Fix create_clinic_for_user RPC grant
-- The RPC is SECURITY DEFINER with input validation and advisory locking.
-- It was incorrectly gated to service_role only, but the server Supabase client
-- authenticates as 'authenticated' via Clerk JWT. Granting authenticated the
-- right to CALL this function is safe because:
--   1. SECURITY DEFINER means it runs as postgres regardless of caller role
--   2. Input validation rejects empty/null parameters
--   3. Advisory lock prevents race conditions
--   4. Existing-user check prevents duplicate clinic creation

GRANT EXECUTE ON FUNCTION create_clinic_for_user(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

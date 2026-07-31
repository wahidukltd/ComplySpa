-- Production hardening: three critical fixes
--
-- 1. Webhook dedup table — prevents duplicate Polar webhook processing
--    Events keyed by event ID. Duplicates silently accepted (idempotent).
--
-- 2. polar_customer_id race fix — moves first-subscription update inside
--    the advisory-locked RPC instead of outside it in the webhook handler.
--    The webhook handler now passes polar_customer_id to the RPC instead
--    of updating it separately.
--
-- 3. RLS policy fix — staff_members and credentials SELECT policies now
--    filter suspended_at IS NULL to prevent direct API access to suspended
--    resources. Defense-in-depth alongside application-layer filtering.
--
-- 4. enforce_plan_limits() — already counts suspended_at IS NULL (verified
--    in migration 030), but the users trigger does NOT need suspended_at
--    filtering (users don't have suspended_at). No change needed there.

-- ===========================================================================
-- 1. Webhook dedup table
-- ===========================================================================
CREATE TABLE IF NOT EXISTS processed_webhooks (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  clinic_id UUID REFERENCES clinics(id),
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Allow cleanup of old entries
CREATE INDEX IF NOT EXISTS idx_processed_webhooks_processed_at ON processed_webhooks(processed_at);

-- Revoke public access — only the admin client (service_role) writes
ALTER TABLE processed_webhooks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON processed_webhooks FROM anon, authenticated;

-- Explicit service_role grants (the webhook handlers INSERT via createAdminClient
-- and need DML here — without this, CLI-applied databases fail every webhook).
GRANT SELECT, INSERT, UPDATE, DELETE ON processed_webhooks TO service_role;

-- ===========================================================================
-- 2. Update RPC to accept and set polar_customer_id atomically
-- ===========================================================================
CREATE OR REPLACE FUNCTION update_clinic_subscription(
  p_clinic_id UUID,
  p_plan TEXT,
  p_polar_subscription_id TEXT DEFAULT NULL,
  p_cancel_at_period_end BOOLEAN DEFAULT FALSE,
  p_polar_customer_id TEXT DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_current_plan TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('update_subscription_' || p_clinic_id));

  SELECT plan INTO v_current_plan FROM clinics WHERE id = p_clinic_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Clinic not found' USING ERRCODE = 'P0002';
  END IF;

  -- Only block non-webhook callers (no subscription context) from downgrading
  -- a paid plan to expired_trial. Subscriptions with a real subscription_id
  -- (e.g. subscription.revoked events) are always allowed.
  IF p_plan = 'expired_trial'
     AND v_current_plan IN ('solo', 'practice', 'multi_location')
     AND p_polar_subscription_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE clinics SET
    plan = p_plan,
    trial_end_date = CASE WHEN p_plan IN ('solo', 'practice', 'multi_location') THEN NULL ELSE trial_end_date END,
    polar_subscription_id = COALESCE(p_polar_subscription_id, polar_subscription_id),
    polar_customer_id = COALESCE(p_polar_customer_id, polar_customer_id),
    cancel_at_period_end = p_cancel_at_period_end
  WHERE id = p_clinic_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION update_clinic_subscription(UUID, TEXT, TEXT, BOOLEAN, TEXT) FROM anon, authenticated;

-- ===========================================================================
-- 3. RLS: Add suspended_at filter to staff_members and credentials SELECT
-- ============================================================================
DROP POLICY IF EXISTS "staff_members_select_own" ON staff_members;
CREATE POLICY "staff_members_select_own" ON staff_members
  FOR SELECT USING (
    clinic_id = (SELECT auth_clinic_id())
    AND deleted_at IS NULL
    AND suspended_at IS NULL
  );

DROP POLICY IF EXISTS "credentials_select_own" ON credentials;
CREATE POLICY "credentials_select_own" ON credentials
  FOR SELECT USING (
    clinic_id = (SELECT auth_clinic_id())
    AND deleted_at IS NULL
    AND suspended_at IS NULL
    AND staff_member_id IN (
      SELECT id FROM staff_members
      WHERE deleted_at IS NULL
        AND suspended_at IS NULL
        AND clinic_id = (SELECT auth_clinic_id())
    )
  );

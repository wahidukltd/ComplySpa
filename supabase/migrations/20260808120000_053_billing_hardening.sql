-- Migration 053: Billing hardening — interval dimension, applied-flag RPC,
-- generalized stale-event guard, trigger suspended-row parity
--
-- Plan: docs/plans/2026-08-08-billing-production-hardening.md
--   B1: update_clinic_subscription returns boolean `applied`; the webhook may
--       only reconcile when the RPC actually applied a change (a stale event
--       for an old subscription id must not suspend a still-paid clinic).
--   B3: enforce_plan_limits counts active-only staff/credentials (suspended =
--       freed slot, matching app + reconcile semantics).
--   B7: subscription_interval dimension (monthly|annual) projected from the
--       Polar payload; one product per interval; plan+interval independent.

-- ============================================================================
-- 1. clinics.subscription_interval
-- ============================================================================

ALTER TABLE clinics ADD COLUMN IF NOT EXISTS subscription_interval TEXT NOT NULL DEFAULT 'monthly';
ALTER TABLE clinics ADD CONSTRAINT clinics_subscription_interval_check
  CHECK (subscription_interval IN ('monthly', 'annual'));

-- ============================================================================
-- 2. update_clinic_subscription — 12-param, RETURNS boolean (applied)
-- ============================================================================
-- DROP both old overloads first (CREATE OR REPLACE cannot add params or change
-- the return type; 025/042/050/052 pattern).

DROP FUNCTION IF EXISTS update_clinic_subscription(UUID, TEXT, TEXT, BOOLEAN);
DROP FUNCTION IF EXISTS update_clinic_subscription(UUID, TEXT, TEXT, BOOLEAN, TEXT);
DROP FUNCTION IF EXISTS update_clinic_subscription(UUID, TEXT, TEXT, BOOLEAN, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, TEXT, TEXT);

CREATE FUNCTION update_clinic_subscription(
  p_clinic_id UUID,
  p_plan TEXT,
  p_polar_subscription_id TEXT DEFAULT NULL,
  p_cancel_at_period_end BOOLEAN DEFAULT NULL,
  p_polar_customer_id TEXT DEFAULT NULL,
  p_subscription_status TEXT DEFAULT NULL,
  p_current_period_start TIMESTAMPTZ DEFAULT NULL,
  p_current_period_end TIMESTAMPTZ DEFAULT NULL,
  p_subscription_amount INTEGER DEFAULT NULL,
  p_subscription_product_id TEXT DEFAULT NULL,
  p_subscription_currency TEXT DEFAULT NULL,
  p_subscription_interval TEXT DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_current_plan TEXT;
  v_stored_subscription_id TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('update_subscription_' || p_clinic_id));

  SELECT plan, polar_subscription_id INTO v_current_plan, v_stored_subscription_id
  FROM clinics WHERE id = p_clinic_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Clinic not found' USING ERRCODE = 'P0002';
  END IF;

  -- 036 semantics preserved: only block NON-webhook callers (no subscription
  -- context) from downgrading a paid plan to expired_trial. Webhook events
  -- always carry a real subscription id and pass through.
  IF p_plan = 'expired_trial'
     AND v_current_plan IN ('solo', 'practice')
     AND p_polar_subscription_id IS NULL THEN
    RETURN false;
  END IF;

  -- 052 downgrade-continuity guard, now returning `applied=false`: Polar
  -- retries deliveries over days, so a late-retried revoked/canceled event for
  -- an OLD subscription must never clobber a clinic that has since
  -- re-subscribed.
  IF p_plan = 'expired_trial'
     AND v_stored_subscription_id IS NOT NULL
     AND v_stored_subscription_id IS DISTINCT FROM p_polar_subscription_id THEN
    RETURN false;
  END IF;

  -- 053 generalized stale-event guard (B1): ANY event carrying a subscription
  -- id that differs from the recorded one is stale when the clinic is
  -- paid/trialing — applying it would overwrite the live subscription's
  -- status/period/amount/plan projection with an old subscription's state.
  -- The revive path stays open: expired_trial/inactive clinics accept any new
  -- subscription id so re-subscription can never be blocked.
  IF v_stored_subscription_id IS NOT NULL
     AND v_stored_subscription_id IS DISTINCT FROM p_polar_subscription_id
     AND v_current_plan NOT IN ('expired_trial', 'inactive') THEN
    RETURN false;
  END IF;

  UPDATE clinics SET
    plan = p_plan,
    -- 006 made trial_end_date NOT NULL, so inherited bodies (NULL on paid
    -- activation) violated the constraint — fixed in 052. Paid activation
    -- ends the trial at NOW(); revocation of a PAID clinic re-anchors it at
    -- NOW() so the 30-day expired_trial→inactive cron window counts from
    -- revocation.
    trial_end_date = CASE
      WHEN p_plan IN ('solo', 'practice') THEN NOW()
      WHEN p_plan = 'expired_trial' AND v_current_plan IN ('solo', 'practice') THEN NOW()
      ELSE trial_end_date
    END,
    -- Incomplete checkouts never record the subscription id (052 incomplete-id
    -- rule) so a dead id cannot linger on a trial clinic.
    polar_subscription_id = CASE
      WHEN p_subscription_status IN ('incomplete', 'incomplete_expired') THEN polar_subscription_id
      ELSE COALESCE(p_polar_subscription_id, polar_subscription_id)
    END,
    polar_customer_id = COALESCE(p_polar_customer_id, polar_customer_id),
    cancel_at_period_end = COALESCE(p_cancel_at_period_end, cancel_at_period_end),
    polar_subscription_status = COALESCE(p_subscription_status, polar_subscription_status),
    current_period_start = COALESCE(p_current_period_start, current_period_start),
    current_period_end = COALESCE(p_current_period_end, current_period_end),
    subscription_amount = COALESCE(p_subscription_amount, subscription_amount),
    subscription_product_id = COALESCE(p_subscription_product_id, subscription_product_id),
    subscription_currency = COALESCE(p_subscription_currency, subscription_currency),
    -- Defense-in-depth (053): the app maps Polar intervals ('month'/'year')
    -- to the CHECK vocabulary before calling; a malformed value must never
    -- 500 the webhook into a retry storm — it leaves the stored interval
    -- unchanged instead.
    subscription_interval = CASE
      WHEN p_subscription_interval IN ('monthly', 'annual') THEN p_subscription_interval
      ELSE subscription_interval
    END
  WHERE id = p_clinic_id;

  RETURN true;
END;
$$;

-- Pin both directions (047/049 lesson): DROP clears grants, hosted
-- pg_default_acl re-grants EXECUTE at CREATE time to anon/authenticated/
-- service_role.
REVOKE EXECUTE ON FUNCTION update_clinic_subscription(UUID, TEXT, TEXT, BOOLEAN, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION update_clinic_subscription(UUID, TEXT, TEXT, BOOLEAN, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, TEXT, TEXT, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION update_clinic_subscription(UUID, TEXT, TEXT, BOOLEAN, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, TEXT, TEXT, TEXT) TO service_role;

-- ============================================================================
-- 3. enforce_plan_limits — active-only counts (B3 parity)
-- ============================================================================
-- The app checks active (non-suspended) counts; reconcile suspends excess rows
-- to free slots. The trigger must count the same set, or a downgraded clinic
-- with suspended staff can never add within its active limit (ND0MV raised
-- against the inflated total). Users have no suspension column — unchanged.

CREATE OR REPLACE FUNCTION enforce_plan_limits()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_plan TEXT;
  v_trial_plan TEXT;
  v_count INTEGER;
  v_limit INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('plan_limit_' || TG_TABLE_NAME || NEW.clinic_id));

  SELECT plan, trial_plan INTO v_plan, v_trial_plan FROM clinics WHERE id = NEW.clinic_id;
  IF v_plan IS NULL THEN
    RAISE EXCEPTION 'Clinic not found' USING ERRCODE = 'P0002';
  END IF;

  -- Trial is a state on the selected plan: limits come from trial_plan.
  IF v_plan = 'trial' THEN
    IF v_trial_plan = 'solo' THEN v_plan := 'solo';
    ELSIF v_trial_plan = 'practice' THEN v_plan := 'practice';
    ELSE v_plan := 'inactive';
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'staff_members' THEN
    v_limit := CASE v_plan
      WHEN 'solo' THEN 5
      WHEN 'practice' THEN 15
      ELSE 0
    END;
    SELECT COUNT(*) INTO v_count FROM staff_members
    WHERE clinic_id = NEW.clinic_id AND deleted_at IS NULL AND suspended_at IS NULL;
  ELSIF TG_TABLE_NAME = 'credentials' THEN
    v_limit := CASE v_plan
      WHEN 'solo' THEN 50
      WHEN 'practice' THEN 300
      ELSE 0
    END;
    SELECT COUNT(*) INTO v_count FROM credentials
    WHERE clinic_id = NEW.clinic_id AND deleted_at IS NULL AND suspended_at IS NULL;
  ELSIF TG_TABLE_NAME = 'users' THEN
    v_limit := CASE v_plan
      WHEN 'solo' THEN 1
      WHEN 'practice' THEN 3
      ELSE 0
    END;
    SELECT COUNT(*) INTO v_count FROM users WHERE clinic_id = NEW.clinic_id AND deleted_at IS NULL;
  ELSE
    RETURN NEW;
  END IF;

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'Plan limit reached for %. % of % allowed', TG_TABLE_NAME, v_count, v_limit
      USING ERRCODE = 'ND0MV';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION enforce_plan_limits() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION enforce_plan_limits() FROM PUBLIC;
-- Migration 052: Billing subscription state projection
--
-- The billing workspace (plan: docs/plans/2026-08-05-billing-subscription-workspace.md)
-- needs the subscription state the webhook currently discards: status, billing
-- period, amount. Six nullable columns on clinics (additive); update_clinic_subscription
-- extended with five new DEFAULT NULL params (DROP both overloads first — CREATE OR
-- REPLACE cannot add params, 025/042/050 pattern).

-- ============================================================================
-- 1. clinics columns
-- ============================================================================

ALTER TABLE clinics ADD COLUMN IF NOT EXISTS polar_subscription_status TEXT;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS current_period_start TIMESTAMPTZ;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS subscription_amount INTEGER;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS subscription_currency TEXT NOT NULL DEFAULT 'usd';
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS subscription_product_id TEXT;

-- Verbatim Polar Subscription.status vocabulary; NULL = never subscribed/unknown.
ALTER TABLE clinics ADD CONSTRAINT clinics_polar_subscription_status_check
  CHECK (
    polar_subscription_status IS NULL OR
    polar_subscription_status IN (
      'incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid'
    )
  );

-- ============================================================================
-- 2. update_clinic_subscription — extended signature (single 11-param body)
-- ============================================================================

DROP FUNCTION IF EXISTS update_clinic_subscription(UUID, TEXT, TEXT, BOOLEAN);
DROP FUNCTION IF EXISTS update_clinic_subscription(UUID, TEXT, TEXT, BOOLEAN, TEXT);

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
  p_subscription_currency TEXT DEFAULT NULL
) RETURNS void
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

  -- Only block non-webhook callers (no subscription context) from downgrading
  -- a paid plan to expired_trial. Subscriptions with a real subscription_id
  -- (e.g. subscription.revoked events) are always allowed (036 semantics).
  IF p_plan = 'expired_trial'
     AND v_current_plan IN ('solo', 'practice')
     AND p_polar_subscription_id IS NULL THEN
    RETURN;
  END IF;

  -- Downgrade continuity guard (review 2026-08-05): Polar retries deliveries
  -- over days, so a late-retried revoked/canceled event for an OLD subscription
  -- must never clobber a clinic that has since re-subscribed. A downgrade is
  -- only applied when the event's subscription id matches the recorded one
  -- (or no subscription is recorded yet).
  IF p_plan = 'expired_trial'
     AND v_stored_subscription_id IS NOT NULL
     AND v_stored_subscription_id IS DISTINCT FROM p_polar_subscription_id THEN
    RETURN;
  END IF;

  UPDATE clinics SET
    plan = p_plan,
    -- 006 made trial_end_date NOT NULL, so the inherited 031/036/045 body
    -- (NULL on paid activation) violated the constraint — a latent bug that
    -- only surfaces now that the webhook is exercised (integration test
    -- billing-subscription-state). Paid activation ends the trial at NOW();
    -- revocation of a PAID clinic re-anchors it at NOW() so the 30-day
    -- expired_trial→inactive cron window counts from revocation, not from
    -- the original (possibly months-old) activation date.
    trial_end_date = CASE
      WHEN p_plan IN ('solo', 'practice') THEN NOW()
      WHEN p_plan = 'expired_trial' AND v_current_plan IN ('solo', 'practice') THEN NOW()
      ELSE trial_end_date
    END,
    -- Incomplete checkouts (created → abandoned) never record the subscription
    -- id, so a dead id cannot linger on a trial clinic and pollute later
    -- actions (review 2026-08-05). The id is stored from the first live
    -- status (trialing/active/past_due/...).
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
    subscription_currency = COALESCE(p_subscription_currency, subscription_currency)
  WHERE id = p_clinic_id;
END;
$$;

-- Pin both directions (047/049 lesson): DROP clears grants, hosted pg_default_acl
-- re-grants EXECUTE at CREATE time to anon/authenticated/service_role.
REVOKE EXECUTE ON FUNCTION update_clinic_subscription(UUID, TEXT, TEXT, BOOLEAN, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION update_clinic_subscription(UUID, TEXT, TEXT, BOOLEAN, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, TEXT, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION update_clinic_subscription(UUID, TEXT, TEXT, BOOLEAN, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, TEXT, TEXT) TO service_role;

-- ============================================================================
-- 3. Review fixes (2026-08-05)
-- ============================================================================

-- 3a. Serialize reconcile with the subscription RPC: reconcile_clinic_plan is a
-- separate statement after the RPC; without the same advisory lock, two
-- concurrent events for one clinic could interleave (e.g. revoked suspends
-- staff after a stale active restored them). Same lock domain as the RPC.
CREATE OR REPLACE FUNCTION reconcile_clinic_plan(
  p_clinic_id UUID,
  p_plan TEXT
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit INTEGER;
  v_active_count INTEGER;
  v_suspended_count INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('update_subscription_' || p_clinic_id));

  -- Trial is a state on the selected plan: reconcile against trial_plan limits.
  IF p_plan = 'trial' THEN
    SELECT trial_plan INTO p_plan FROM clinics WHERE id = p_clinic_id;
    IF p_plan IS NULL OR p_plan NOT IN ('solo', 'practice') THEN
      p_plan := 'inactive';
    END IF;
  END IF;

  -- Staff members
  v_limit := CASE p_plan
    WHEN 'solo' THEN 5
    WHEN 'practice' THEN 15
    ELSE 0
  END;

  SELECT COUNT(*) INTO v_active_count
  FROM staff_members
  WHERE clinic_id = p_clinic_id
    AND deleted_at IS NULL
    AND suspended_at IS NULL;

  SELECT COUNT(*) INTO v_suspended_count
  FROM staff_members
  WHERE clinic_id = p_clinic_id
    AND deleted_at IS NULL
    AND suspended_at IS NOT NULL;

  -- Restore suspended staff (newest first) if the plan can accommodate them
  IF v_active_count < v_limit AND v_suspended_count > 0 THEN
    UPDATE staff_members
    SET suspended_at = NULL, suspended_plan = NULL
    WHERE id IN (
      SELECT id FROM staff_members
      WHERE clinic_id = p_clinic_id
        AND deleted_at IS NULL
        AND suspended_at IS NOT NULL
      ORDER BY created_at DESC
      LIMIT LEAST(v_limit - v_active_count, v_suspended_count)
    );
    -- Cascade: restore credentials of newly restored staff
    UPDATE credentials
    SET suspended_at = NULL, suspended_plan = NULL
    WHERE staff_member_id IN (
      SELECT id FROM staff_members
      WHERE clinic_id = p_clinic_id
        AND deleted_at IS NULL
        AND suspended_at IS NULL
    )
    AND clinic_id = p_clinic_id
    AND deleted_at IS NULL
    AND suspended_at IS NOT NULL;
  END IF;

  -- Suspend excess staff (oldest first)
  IF v_active_count > v_limit THEN
    UPDATE staff_members
    SET suspended_at = NOW(), suspended_plan = p_plan
    WHERE id IN (
      SELECT id FROM staff_members
      WHERE clinic_id = p_clinic_id
        AND deleted_at IS NULL
        AND suspended_at IS NULL
      ORDER BY created_at ASC
      LIMIT v_active_count - v_limit
    );
    -- Cascade: suspend all credentials of newly suspended staff
    UPDATE credentials
    SET suspended_at = NOW(), suspended_plan = p_plan
    WHERE staff_member_id IN (
      SELECT id FROM staff_members
      WHERE clinic_id = p_clinic_id
        AND deleted_at IS NULL
        AND suspended_at IS NOT NULL
    )
    AND clinic_id = p_clinic_id
    AND deleted_at IS NULL
    AND suspended_at IS NULL;
  END IF;

  -- Remaining standalone credentials (those whose parent staff was NOT
  -- suspended by the cascade above, but exceed the credential limit)
  v_limit := CASE p_plan
    WHEN 'solo' THEN 50
    WHEN 'practice' THEN 300
    ELSE 0
  END;

  SELECT COUNT(*) INTO v_active_count
  FROM credentials
  WHERE clinic_id = p_clinic_id
    AND deleted_at IS NULL
    AND suspended_at IS NULL;

  SELECT COUNT(*) INTO v_suspended_count
  FROM credentials
  WHERE clinic_id = p_clinic_id
    AND deleted_at IS NULL
    AND suspended_at IS NOT NULL;

  IF v_active_count < v_limit AND v_suspended_count > 0 THEN
    UPDATE credentials
    SET suspended_at = NULL, suspended_plan = NULL
    WHERE id IN (
      SELECT id FROM credentials
      WHERE clinic_id = p_clinic_id
        AND deleted_at IS NULL
        AND suspended_at IS NOT NULL
        -- Only credentials of ACTIVE staff may be restored. Without this
        -- scope, this branch un-does the staff-suspension cascade above: after
        -- the cascade drops the active-credential count, this restore fires
        -- and re-activates the very credentials the cascade just suspended
        -- (inherited 033 defect, caught by the 050 DB-parity test).
        AND staff_member_id IN (
          SELECT id FROM staff_members
          WHERE clinic_id = p_clinic_id
            AND deleted_at IS NULL
            AND suspended_at IS NULL
        )
      ORDER BY created_at DESC
      LIMIT LEAST(v_limit - v_active_count, v_suspended_count)
    );
  END IF;

  IF v_active_count > v_limit THEN
    UPDATE credentials
    SET suspended_at = NOW(), suspended_plan = p_plan
    WHERE id IN (
      SELECT id FROM credentials
      WHERE clinic_id = p_clinic_id
        AND deleted_at IS NULL
        AND suspended_at IS NULL
      ORDER BY created_at ASC
      LIMIT v_active_count - v_limit
    );
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION reconcile_clinic_plan(UUID, TEXT) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION reconcile_clinic_plan(UUID, TEXT) FROM PUBLIC;
-- 047 lesson, pinned both directions: the webhook (service_role) calls this on
-- every plan change — the CREATE-time pg_default_acl auto-grant is not a pin.
GRANT EXECUTE ON FUNCTION reconcile_clinic_plan(UUID, TEXT) TO service_role;

-- 3b. One Polar customer per clinic (enforces the webhook's fallback lookup
-- invariant and indexes it — the fallback runs on every returning-customer
-- event without metadata).
CREATE UNIQUE INDEX IF NOT EXISTS clinics_polar_customer_id_key
  ON clinics(polar_customer_id)
  WHERE polar_customer_id IS NOT NULL;

-- Migration 054: Billing review-team remediation (2026-08-08)
--
-- Review findings (docs/plans/2026-08-08-billing-production-hardening.md
-- "Review Findings — 2026-08-08"):
--   Finding 1: revive-path same-id hole — a late-delivered paid-status event
--     for the SAME dead subscription id on a revoked clinic resurrects it to
--     paid entitlements (sticky: the fixing revoke retry is deduped).
--   Finding 3: RPC→reconcile is two transactions — a mis-ordered stale
--     reconcile(expired_trial) can suspend a clinic that has re-subscribed.
--   Finding 5: resume counts run through RLS which filters suspended rows —
--     the B6 "preserved counts" fix is a no-op; counts need a scoped
--     SECURITY DEFINER RPC (048/049 pattern: clinic from the session).

-- ============================================================================
-- 1. Finding 3 — reconcile_clinic_plan: never suspend a paid/trialing clinic
-- ============================================================================
-- The shared advisory lock serializes each CALL, but the route executes the
-- RPC and the reconcile as two separate transactions, so the lock releases
-- between commits. A legitimately-gated reconcile(expired_trial) can run
-- AFTER the clinic re-subscribed (revive → paid) and suspend all its data.
-- Re-read the current plan under the same lock and no-op when it no longer
-- matches the reconcile target.

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
  v_current_plan TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('update_subscription_' || p_clinic_id));

  -- Trial is a state on the selected plan: reconcile against trial_plan limits.
  IF p_plan = 'trial' THEN
    SELECT trial_plan INTO p_plan FROM clinics WHERE id = p_clinic_id;
    IF p_plan IS NULL OR p_plan NOT IN ('solo', 'practice') THEN
      p_plan := 'inactive';
    END IF;
  END IF;

  -- Finding 3 (review 2026-08-08): never suspend a paid/trialing clinic. A
  -- mis-ordered concurrent delivery can run a stale reconcile(expired_trial)
  -- after the clinic re-subscribed — the RPC-side guard (053 G3) already
  -- protects the plan column; this is the reconcile-side mirror. The normal
  -- revoke flow still works: the RPC sets plan=expired_trial BEFORE the
  -- reconcile runs, so the current plan matches the target here.
  SELECT plan INTO v_current_plan FROM clinics WHERE id = p_clinic_id;
  IF p_plan IN ('expired_trial', 'inactive')
     AND v_current_plan IN ('solo', 'practice', 'trial') THEN
    RETURN;
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
GRANT EXECUTE ON FUNCTION reconcile_clinic_plan(UUID, TEXT) TO service_role;

-- ============================================================================
-- 2. Finding 1 — same-id stale re-activation on the revive path
-- ============================================================================
-- update_clinic_subscription: a paid-plan event carrying the SAME stored
-- subscription id on an expired_trial/inactive clinic is stale by definition
-- — the stored id belongs to a dead (revoked/immediately-ended) subscription,
-- and Polar mints a NEW id for a new subscription. Accepting it resurrects the
-- revoked clinic to paid entitlements, and the fixing revoke retry is then
-- skipped by dedup (same webhook-id), so the state is sticky.

DROP FUNCTION IF EXISTS update_clinic_subscription(UUID, TEXT, TEXT, BOOLEAN);
DROP FUNCTION IF EXISTS update_clinic_subscription(UUID, TEXT, TEXT, BOOLEAN, TEXT);
DROP FUNCTION IF EXISTS update_clinic_subscription(UUID, TEXT, TEXT, BOOLEAN, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, TEXT, TEXT);
DROP FUNCTION IF EXISTS update_clinic_subscription(UUID, TEXT, TEXT, BOOLEAN, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, TEXT, TEXT, TEXT);

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

  -- 052 downgrade-continuity guard: Polar retries deliveries over days, so a
  -- late-retried revoked/canceled event for an OLD subscription must never
  -- clobber a clinic that has since re-subscribed.
  IF p_plan = 'expired_trial'
     AND v_stored_subscription_id IS NOT NULL
     AND v_stored_subscription_id IS DISTINCT FROM p_polar_subscription_id THEN
    RETURN false;
  END IF;

  -- 053 generalized stale-event guard (B1): ANY event carrying a subscription
  -- id that differs from the recorded one is stale when the clinic is
  -- paid/trialing — applying it would overwrite the live subscription's
  -- projection with an old subscription's state. The revive path stays open
  -- so re-subscription is never blocked.
  IF v_stored_subscription_id IS NOT NULL
     AND v_stored_subscription_id IS DISTINCT FROM p_polar_subscription_id
     AND v_current_plan NOT IN ('expired_trial', 'inactive') THEN
    RETURN false;
  END IF;

  -- Finding 1 (review 2026-08-08): the revive-path mirror. On an
  -- expired_trial/inactive clinic, a paid-plan event carrying the SAME stored
  -- subscription id is a late retry of a dead subscription (generated before
  -- the revoke, delivered after). A legitimate re-subscription always carries
  -- a NEW id (Polar mints one per subscription). Same-id paid events are
  -- stale — without this guard they resurrect the revoked clinic to paid
  -- entitlements, and the fixing revoke retry is skipped by dedup.
  IF p_plan IN ('solo', 'practice')
     AND v_current_plan IN ('expired_trial', 'inactive')
     AND v_stored_subscription_id IS NOT NULL
     AND v_stored_subscription_id = p_polar_subscription_id THEN
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
-- 3. Finding 5 — count_preserved_clinic_data: resume counts through RLS
-- ============================================================================
-- The resume page's staff/credential counts run through the authenticated
-- client, and the 036 SELECT policies filter `suspended_at IS NULL` — so a
-- revoked clinic (rows reconcile-suspended) renders 0/0 despite the B6
-- filter removal. This RPC counts ALL non-deleted rows regardless of
-- suspension, scoped by the session (048/049 pattern: the tenant comes from
-- auth_clinic_id(), never a caller-supplied argument). EXECUTE is pinned to
-- authenticated only (047 lesson).

CREATE OR REPLACE FUNCTION count_preserved_clinic_data()
RETURNS TABLE(staff_count BIGINT, credential_count BIGINT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinic_id UUID;
BEGIN
  v_clinic_id := auth_clinic_id();
  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM staff_members WHERE clinic_id = v_clinic_id AND deleted_at IS NULL),
    (SELECT COUNT(*) FROM credentials WHERE clinic_id = v_clinic_id AND deleted_at IS NULL);
END;
$$;

REVOKE EXECUTE ON FUNCTION count_preserved_clinic_data() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION count_preserved_clinic_data() FROM anon, service_role;
GRANT EXECUTE ON FUNCTION count_preserved_clinic_data() TO authenticated;
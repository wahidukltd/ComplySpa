-- Fix: update_clinic_subscription guard was wrong — blocked subscription.revoked
-- for paid plans. Changed p_polar_subscription_id IS NULL check so that
-- subscription.revoked (which includes a real subscription_id) can move
-- paid plans to expired_trial. Non-webhook callers (no subscription_id)
-- are still blocked from downgrading paid → expired_trial.
--
-- Also clears trial_end_date when a paid plan is activated so the cron
-- doesn't expire users who just subscribed.

CREATE OR REPLACE FUNCTION update_clinic_subscription(
  p_clinic_id UUID,
  p_plan TEXT,
  p_polar_subscription_id TEXT DEFAULT NULL,
  p_cancel_at_period_end BOOLEAN DEFAULT FALSE
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
    cancel_at_period_end = p_cancel_at_period_end
  WHERE id = p_clinic_id;
END;
$$;

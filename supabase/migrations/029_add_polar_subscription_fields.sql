-- Add Polar subscription tracking fields to clinics.
-- These support the full subscription lifecycle managed by
-- the Polar.sh webhook handler at src/app/api/polar/webhook/route.ts

ALTER TABLE clinics ADD COLUMN IF NOT EXISTS polar_subscription_id TEXT;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE;

-- Advisory-locked RPC for subscription state transitions.
-- Prevents race conditions when Polar sends duplicate webhook events
-- or when concurrent subscription changes arrive.
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

  -- Never downgrade an active paid plan to expired_trial (belt-and-suspenders)
  IF p_plan = 'expired_trial' AND v_current_plan IN ('solo', 'practice', 'multi_location') THEN
    RETURN;
  END IF;

  UPDATE clinics SET
    plan = p_plan,
    polar_subscription_id = COALESCE(p_polar_subscription_id, polar_subscription_id),
    cancel_at_period_end = p_cancel_at_period_end
  WHERE id = p_clinic_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION update_clinic_subscription(UUID, TEXT, TEXT, BOOLEAN) FROM anon, authenticated;

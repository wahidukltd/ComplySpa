-- Fix update_credential_statuses() to skip suspended credentials and staff.
-- Suspended credentials should not get status updates.

CREATE OR REPLACE FUNCTION update_credential_statuses()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE credentials c
  SET status = 'expired'
  FROM staff_members s
  WHERE c.staff_member_id = s.id
    AND c.deleted_at IS NULL
    AND c.suspended_at IS NULL
    AND s.deleted_at IS NULL
    AND s.suspended_at IS NULL
    AND c.expiration_date < NOW()
    AND c.status != 'expired';

  UPDATE credentials c
  SET status = 'expiring'
  FROM staff_members s
  WHERE c.staff_member_id = s.id
    AND c.deleted_at IS NULL
    AND c.suspended_at IS NULL
    AND s.deleted_at IS NULL
    AND s.suspended_at IS NULL
    AND c.expiration_date BETWEEN NOW() AND NOW() + INTERVAL '90 days'
    AND c.status NOT IN ('expiring', 'expired');

  UPDATE credentials c
  SET status = 'valid'
  FROM staff_members s
  WHERE c.staff_member_id = s.id
    AND c.deleted_at IS NULL
    AND c.suspended_at IS NULL
    AND s.deleted_at IS NULL
    AND s.suspended_at IS NULL
    AND c.expiration_date > NOW() + INTERVAL '90 days'
    AND c.status != 'valid';
END;
$$;

-- Fix audit_credential_changes() — migration 028 rewrote it to insert into
-- columns (field_name, old_value, new_value) that do not exist in
-- credential_audit (which has action, old_values, new_values as jsonb).
-- This broke EVERY credential INSERT/UPDATE/DELETE (trigger error rolls back
-- the write). Restore the correct schema usage from migration 004/025,
-- keeping 028's soft-delete skip and changed_by COALESCE behavior.

CREATE OR REPLACE FUNCTION public.audit_credential_changes()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  auth_sub TEXT;
  changed_by TEXT;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  auth_sub := auth.jwt() ->> 'sub';
  changed_by := COALESCE(auth_sub, 'system');

  IF TG_OP = 'DELETE' THEN
    INSERT INTO credential_audit (credential_id, clinic_id, action, changed_by, old_values)
    VALUES (OLD.id, OLD.clinic_id, 'DELETE', changed_by, to_jsonb(OLD));
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO credential_audit (credential_id, clinic_id, action, changed_by, old_values, new_values)
    VALUES (NEW.id, NEW.clinic_id, 'UPDATE', changed_by, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  END IF;

  INSERT INTO credential_audit (credential_id, clinic_id, action, changed_by, new_values)
  VALUES (NEW.id, NEW.clinic_id, 'INSERT', changed_by, to_jsonb(NEW));
  RETURN NEW;
END;
$$;

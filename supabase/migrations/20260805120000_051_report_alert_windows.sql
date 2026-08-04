-- 051: Bound the alert-window lookup for report generation.
--
-- getReportData() fetched every alert_logs row for the clinic (unbounded:
-- the escalation scan re-alerts every ~8 days per chronically expired
-- credential, so a mature clinic accumulates thousands of rows fetched in
-- full on every report generation) just to build a set of
-- (credential_id, days_before_expiration) pairs for the report's alert
-- history. DISTINCT is not expressible via PostgREST/supabase-js, so expose
-- it as a plain SECURITY INVOKER function: RLS applies inside, and the
-- alert_logs SELECT policy is clinic-scoped, so p_clinic_id can never reach
-- another tenant's rows — the tenant always comes from the session
-- (migration 049 principle). Result is provably bounded by 5 windows
-- (90/60/30/7/-7) per active credential.

create or replace function public.get_alert_windows(p_clinic_id uuid)
returns table (credential_id uuid, days_before_expiration integer)
language sql
stable
security invoker
set search_path = public
as $$
  select distinct credential_id, days_before_expiration
  from public.alert_logs
  where clinic_id = p_clinic_id;
$$;

-- Pin grants both directions: hosted pg_default_acl auto-grants EXECUTE to
-- PUBLIC/anon/authenticated/service_role at CREATE time, and the 047 lesson
-- is that PUBLIC-only revokes are insufficient. Only authenticated (report
-- generation) needs it; anon, service_role, and the public default get none.
revoke all on function public.get_alert_windows(uuid) from public, anon, service_role;
grant execute on function public.get_alert_windows(uuid) to authenticated;

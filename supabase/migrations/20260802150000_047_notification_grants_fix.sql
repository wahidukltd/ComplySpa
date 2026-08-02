-- 047: Fix review findings (2026-08-02) — reconcile_stale_pending_alerts was
-- executable by anon/authenticated/service_role on hosted Supabase: the 046
-- REVOKE FROM PUBLIC does not strip the role-specific EXECUTE grants that the
-- hosted platform's default privileges (pg_default_acl: anon=X, authenticated=X,
-- service_role=X) materialize at CREATE time — verified live via pg_proc.proacl
-- and has_function_privilege. Same masking class as the 036/038 lesson.

-- 1. Lock down the reconciliation function: cron jobs run as the postgres
-- (superuser) scheduler role and are unaffected by these revokes.
REVOKE ALL ON FUNCTION reconcile_stale_pending_alerts() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION reconcile_stale_pending_alerts() FROM anon, authenticated, service_role;

-- 2. Fix the local-dev seed URL: 127.0.0.1 inside the Postgres container is the
-- container itself — pg_net can never reach host-served functions. 045's
-- escalation body used host.docker.internal for this reason; the 046 seed
-- regressed it. The WHERE guard keeps production's Management-API-set value
-- (the real edge URL) untouched.
UPDATE public.notification_settings
SET value = 'http://host.docker.internal:54321/functions/v1'
WHERE key = 'edge_function_url'
  AND value = 'http://127.0.0.1:54321/functions/v1';

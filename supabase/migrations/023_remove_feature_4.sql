-- Migration 023: Remove Feature 4 -- Inspection-Readiness & Mock-Audit Engine
-- Drops audit tables, functions, and cron job. Keeps audit_reports (Feature 3).

-- Drop cron job first (depends on the function)
SELECT cron.unschedule('daily-audit-overdue-check')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-audit-overdue-check');

-- Drop tables (CASCADE drops dependent objects like foreign keys)
DROP TABLE IF EXISTS audit_findings CASCADE;
DROP TABLE IF EXISTS audit_runs CASCADE;

-- Drop any audit-related functions
DROP FUNCTION IF EXISTS scan_audit_overdue();


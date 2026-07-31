-- 043: Overview query-supporting indexes
--
-- The Operational Compliance Overview (2026-07-31) introduced three new
-- "recent/status" query shapes on always-on force-dynamic pages:
--   1. credentials ordered by created_at DESC (recent-changes feed)
--   2. onboarding_items ordered by completed_at DESC (recent-changes feed)
--   3. alert_logs filtered by delivery_status='failed' ordered by sent_at DESC
-- None of the existing indexes (001/006/038) support ordering by these
-- columns, so each page load sorts the clinic's full table. These indexes
-- turn those sorts into small ordered scans.

CREATE INDEX IF NOT EXISTS idx_credentials_clinic_created_at
  ON credentials(clinic_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_onboarding_items_clinic_completed
  ON onboarding_items(clinic_id, completed_at DESC)
  WHERE completed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_alert_logs_clinic_status_sent
  ON alert_logs(clinic_id, delivery_status, sent_at DESC);

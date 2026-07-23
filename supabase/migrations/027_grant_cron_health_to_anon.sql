-- Migration 027: Grant check_cron_health to anon role for health endpoint

GRANT EXECUTE ON FUNCTION check_cron_health(TEXT, INTEGER) TO anon;
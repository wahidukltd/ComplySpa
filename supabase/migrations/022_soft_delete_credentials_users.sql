-- Add soft-delete support to credentials and users tables

ALTER TABLE credentials
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_credentials_deleted_at ON credentials(deleted_at);
CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users(deleted_at);

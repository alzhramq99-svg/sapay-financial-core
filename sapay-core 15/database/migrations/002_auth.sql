-- Additive migration; existing demo wallets/users are retained without inferred credentials.
BEGIN;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS email VARCHAR(254);
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS password_hash TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_app_users_email ON app_users(email) WHERE email IS NOT NULL;
COMMIT;

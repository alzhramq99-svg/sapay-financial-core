-- SApay demo schema. PostgreSQL 16+.
-- This creates database structures only; it does not connect to banks or move real money.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS app_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_ref VARCHAR(128) NOT NULL UNIQUE,
  email VARCHAR(254),
  password_hash TEXT,
  status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'SUSPENDED', 'CLOSED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_app_users_email ON app_users(email) WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id),
  currency CHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'FROZEN', 'CLOSED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, currency, id)
);

-- Balances are derived from ledger_postings; do not store a mutable balance here.
CREATE TABLE IF NOT EXISTS ledger_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID REFERENCES wallets(id),
  account_code VARCHAR(96) NOT NULL UNIQUE,
  account_type VARCHAR(24) NOT NULL
    CHECK (account_type IN ('WALLET', 'CLEARING', 'DEMO_ISSUANCE', 'FEE', 'SUSPENSE')),
  currency CHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (account_type = 'WALLET' AND wallet_id IS NOT NULL) OR
    (account_type <> 'WALLET' AND wallet_id IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_type VARCHAR(24) NOT NULL
    CHECK (entry_type IN ('DEMO_CREDIT', 'TRANSFER', 'REVERSAL', 'FEE')),
  reference VARCHAR(160) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'POSTED'
    CHECK (status IN ('POSTED', 'REVERSED')),
  description TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entry_type, reference)
);

CREATE TABLE IF NOT EXISTS ledger_postings (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  journal_entry_id UUID NOT NULL REFERENCES journal_entries(id),
  account_id UUID NOT NULL REFERENCES ledger_accounts(id),
  side VARCHAR(6) NOT NULL CHECK (side IN ('DEBIT', 'CREDIT')),
  amount_minor NUMERIC(38, 0) NOT NULL CHECK (amount_minor > 0),
  currency CHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wallets_user ON wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_postings_account_created ON ledger_postings(account_id, created_at);
CREATE INDEX IF NOT EXISTS idx_postings_journal ON ledger_postings(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_journals_created ON journal_entries(created_at DESC);

CREATE TABLE IF NOT EXISTS transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_wallet_id UUID NOT NULL REFERENCES wallets(id),
  to_wallet_id UUID NOT NULL REFERENCES wallets(id),
  amount_minor NUMERIC(38, 0) NOT NULL CHECK (amount_minor > 0),
  currency CHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  status VARCHAR(16) NOT NULL DEFAULT 'COMPLETED'
    CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED', 'REVERSED')),
  journal_entry_id UUID REFERENCES journal_entries(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (from_wallet_id <> to_wallet_id)
);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  idempotency_key VARCHAR(128) NOT NULL UNIQUE,
  request_hash CHAR(64) NOT NULL,
  response_status INTEGER,
  response_body JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_ref VARCHAR(128),
  action VARCHAR(96) NOT NULL,
  entity_type VARCHAR(64) NOT NULL,
  entity_id VARCHAR(128),
  correlation_id VARCHAR(128),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Prevent ordinary application roles from updating/deleting posted ledger records.
-- A production deployment should use a separate migration owner and least-privilege app role.
CREATE OR REPLACE FUNCTION prevent_posting_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ledger postings are append-only';
END;
$$;

DROP TRIGGER IF EXISTS ledger_postings_no_update ON ledger_postings;
CREATE TRIGGER ledger_postings_no_update
BEFORE UPDATE OR DELETE ON ledger_postings
FOR EACH ROW EXECUTE FUNCTION prevent_posting_mutation();


-- Private beta invitations: only SHA-256 hashes are stored; raw codes are never persisted.
CREATE TABLE IF NOT EXISTS beta_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash CHAR(64) NOT NULL UNIQUE CHECK (code_hash ~ '^[0-9a-f]{64}),
  label VARCHAR(80) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  used_by UUID REFERENCES app_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((used_at IS NULL AND used_by IS NULL) OR (used_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_beta_invitations_expiry ON beta_invitations(expires_at) WHERE used_at IS NULL;

COMMIT;

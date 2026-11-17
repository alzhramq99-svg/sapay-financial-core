BEGIN;

ALTER TABLE journal_entries DROP CONSTRAINT IF EXISTS journal_entries_entry_type_check;
ALTER TABLE journal_entries ADD CONSTRAINT journal_entries_entry_type_check
  CHECK (entry_type IN ('DEMO_CREDIT', 'TRANSFER', 'EXTERNAL_TRANSFER', 'REVERSAL', 'FEE'));

CREATE TABLE IF NOT EXISTS external_transfers (
  id UUID PRIMARY KEY,
  from_wallet_id UUID NOT NULL REFERENCES wallets(id),
  destination_type VARCHAR(20) NOT NULL CHECK (destination_type IN ('SUDAN_BANK', 'GLOBAL')),
  provider VARCHAR(100) NOT NULL,
  beneficiary_name VARCHAR(120) NOT NULL,
  destination_reference VARCHAR(64) NOT NULL CHECK (destination_reference ~* '^DEMO-[A-Z0-9-]{4,60}$'),
  destination_country VARCHAR(80),
  amount_minor NUMERIC(38,0) NOT NULL CHECK (amount_minor > 0),
  currency CHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  status VARCHAR(16) NOT NULL CHECK (status IN ('SIMULATED')),
  journal_entry_id UUID NOT NULL REFERENCES journal_entries(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((destination_type = 'GLOBAL' AND destination_country IS NOT NULL) OR destination_type = 'SUDAN_BANK')
);

CREATE INDEX IF NOT EXISTS idx_external_transfers_wallet_created
  ON external_transfers(from_wallet_id, created_at DESC);

COMMIT;

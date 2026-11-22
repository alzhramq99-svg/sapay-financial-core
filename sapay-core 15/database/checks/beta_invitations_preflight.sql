-- SApay private Beta: read-only schema preflight.
-- Run against the intended Beta database BEFORE enabling invite-only signup.
-- Example: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/checks/beta_invitations_preflight.sql
-- This script does not create, update, or delete application data.
BEGIN READ ONLY;
DO $$
DECLARE
  missing_columns text;
BEGIN
  IF to_regclass('public.beta_invitations') IS NULL THEN
    RAISE EXCEPTION 'BETA_SCHEMA_NOT_READY: public.beta_invitations is missing; apply the reviewed migration separately';
  END IF;
  SELECT string_agg(required.column_name, ', ' ORDER BY required.column_name)
  INTO missing_columns
  FROM (VALUES ('id'), ('code_hash'), ('label'), ('expires_at'), ('used_at'), ('used_by'), ('created_at')) AS required(column_name)
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema='public' AND c.table_name='beta_invitations'
      AND c.column_name=required.column_name
  );
  IF missing_columns IS NOT NULL THEN
    RAISE EXCEPTION 'BETA_SCHEMA_NOT_READY: missing columns: %', missing_columns;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.beta_invitations'::regclass
      AND contype='u' AND pg_get_constraintdef(oid) LIKE '%code_hash%'
  ) THEN
    RAISE EXCEPTION 'BETA_SCHEMA_NOT_READY: unique code_hash constraint is missing';
  END IF;
  IF to_regclass('public.idx_beta_invitations_available_expiry') IS NULL THEN
    RAISE EXCEPTION 'BETA_SCHEMA_NOT_READY: available-invitation expiry index is missing';
  END IF;
  RAISE NOTICE 'BETA_SCHEMA_READY: invitation table, columns, uniqueness and expiry index found';
END $$;
ROLLBACK;

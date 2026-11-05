# PostgreSQL schema (demo)

## Start PostgreSQL
From the project root:
```bash
cp .env.example .env
docker compose up -d postgres
docker compose ps
```
PostgreSQL is bound to `127.0.0.1` only, not exposed to the local network.

## Check tables
```bash
docker exec -it sapay-postgres psql -U sapay_app -d sapay_demo
```
Inside `psql`:
```sql
\\dt
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' ORDER BY table_name;
\\q
```

## Reset demo data (DESTRUCTIVE)
This removes the local database volume and all data:
```bash
docker compose down -v
docker compose up -d postgres
```

## Design notes
- Monetary values use `NUMERIC(38,0)` integer minor units; avoid floating point.
- Wallet balances are intended to be derived from posted ledger entries, not directly edited.
- Transfer writes must insert transfer, journal entry, postings, and idempotency response in **one database transaction**.
- Lock affected wallet/account rows in a stable order (`SELECT ... FOR UPDATE`) before checking funds and posting.
- PostgreSQL constraints alone cannot ensure every journal is balanced across multiple rows. Add a deferred constraint trigger or enforce balanced journal creation in a single trusted service transaction, and test it.
- The append-only trigger blocks updates/deletes on ledger postings. Database owners can bypass/alter triggers, so this is not tamper-proof audit storage.
- The schema is a development baseline, not a production financial ledger or compliance certification.

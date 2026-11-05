# SApay Financial Core — Demo Only

A NestJS demo API demonstrating a PostgreSQL-backed double-entry ledger and wallet-to-wallet transfers. It is deliberately disconnected from banks, payment processors, mobile-money providers, and real funds.

> **Important:** This is a local/private prototype only—not a regulated payment product, not production-ready, and not authorization to provide financial services. The demo includes email/password registration, short-lived bearer access tokens, per-user wallet ownership checks, and in-process rate limiting. Docker Compose binds the API and database to loopback only; do not expose them through a public tunnel, reverse proxy, or internet-facing host. Do not use real personal, banking, or customer data.

## Requirements
- Node.js 20+ (Node 22 recommended)
- npm 10+

## Run locally
```bash
npm install
npm run start:dev
```
API: `http://localhost:3000`

Health:
```bash
curl http://localhost:3000/api/health
```

Register and capture the bearer token (use a unique email):
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H 'content-type: application/json' \
  -d '{"email":"demo@example.test","password":"change-this-demo-password-2026"}'
```
Use the returned `accessToken` as `TOKEN` in the following requests. Create a wallet:
```bash
curl -X POST http://localhost:3000/api/demo/wallets \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"currency":"SDG"}'
```
Copy the returned wallet IDs. Fund a wallet with **simulated** demo funds:
```bash
curl -X POST http://localhost:3000/api/demo/wallets/WALLET_ID/credit \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"amountMinor":"100000","reference":"demo-seed-001"}'
```
Amounts are integer minor units represented as strings to avoid floating-point rounding. For this demo, SDG minor-unit conventions are not asserted; use integer units only in tests. `credit` is a demo-only minting endpoint and must never exist in a live money system.

Transfer:
```bash
curl -X POST http://localhost:3000/api/transfers \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $TOKEN" -H 'idempotency-key: demo-transfer-001' \
  -d '{"fromWalletId":"SOURCE_ID","toWalletId":"DEST_ID","amountMinor":"2500","currency":"SDG"}'
```
Get wallet:
```bash
curl -H "authorization: Bearer $TOKEN" http://localhost:3000/api/demo/wallets/WALLET_ID
```
View journal:
```bash
curl -H "authorization: Bearer $TOKEN" http://localhost:3000/api/ledger/journals
```

## Tests
```bash
npm test
npm run build
```

## Safety and architecture notes
- Each transfer writes equal debit and credit postings in one PostgreSQL transaction. Journal-level balance is maintained by the service write path; a deferred database constraint enforcing balance for every journal is not yet implemented.
- Transfers reject zero/negative amounts, insufficient balance, currency mismatch, and self-transfers.
- Database-backed idempotency keys and transaction-scoped advisory locks prevent duplicate successful transfers across API restarts and concurrent requests.
- Wallets, simulated credits, transfers, postings, and idempotency records use PostgreSQL transactions and row locking.
- HTTP security headers are enabled with Helmet, JSON request bodies are limited to 32 KB, and the API binds to loopback by default.
- The demo credit endpoint simulates funding and must never be used as a real funding mechanism.
- Authentication uses scrypt password hashes and 15-minute HS256 bearer access tokens. `AUTH_TOKEN_SECRET` must be a unique random secret of at least 32 characters and must never be committed. There is no refresh-token flow or password-reset workflow yet.
- Auth endpoints are limited to 5 requests/minute per IP and other API routes to 120 requests/minute per IP; this limiter is in-memory and intended only for a single-instance private demo, not a horizontally scaled public deployment.
- Existing legacy demo users/wallets are retained by the additive migration but are not automatically assigned credentials. New accounts own only wallets they create after authentication.
- This remains a private demo, not a public beta or production financial service. Before external testers, complete independent security review, distributed rate limiting, refresh/session revocation, account recovery, audit coverage, monitoring, backup/restore drills, and deployment hardening. Before real-money use, obtain all required regulatory approvals and partner integrations.

## PostgreSQL (database foundation)
```bash
export POSTGRES_PASSWORD="$(openssl rand -hex 32)"
export AUTH_TOKEN_SECRET="$(openssl rand -hex 32)"
docker compose up -d --build
docker compose ps
```
Compose connects the API to the database using the service hostname `postgres` on port
`5432` with separate host, user, database, and password settings. A strong `POSTGRES_PASSWORD`
is required; there is no built-in default. The API port is bound to `127.0.0.1:3000` and is
not published on external interfaces by this Compose file.
The PostgreSQL health check verifies an authenticated SQL query, not only that the
server accepts TCP connections. The API retries transient startup connection failures
with a bounded backoff and fails immediately for invalid credentials or a missing
database.

Check the API/database connection at `http://localhost:3000/api/database/health`; a
healthy response is `{"configured":true,"reachable":true}`. SQL schema is in
`database/init/001_schema.sql`. Existing databases should receive additive migrations from
`database/migrations/` before the API is started with the updated code. Keep `AUTH_TOKEN_SECRET` stable across restarts and back it up securely; changing it invalidates all existing access tokens.

`POSTGRES_PASSWORD` initializes a new PostgreSQL data directory; changing it later
does not change the password stored in an existing volume. If credentials have been
rotated, update the existing role password interactively (this preserves database
data), export the same value in your shell or secret manager, then recreate the services without deleting the
volume:

```bash
docker exec -it sapay-postgres psql -U sapay_app -d sapay_demo
# At the psql prompt:
\password sapay_app
# Enter the same new password as POSTGRES_PASSWORD in .env, then:
\q
docker compose up -d --build
docker compose ps
curl -fsS http://localhost:3000/api/database/health
```

Do not use `docker compose down -v` to resolve credential drift.
Compose gives an exported shell variable precedence over values in `.env`; if
`POSTGRES_PASSWORD` is exported, make sure it matches the `.env` value or run
`unset POSTGRES_PASSWORD` before starting Compose.

Wallet creation, simulated credits, transfers, ledger postings, balances, and idempotency are now written/read through PostgreSQL. Each transfer is committed in a single database transaction, locks the wallet rows in stable order, and stores the idempotency response durably. The original in-memory service remains only as legacy code and is no longer used by the API controllers.

## PostgreSQL integration tests

Integration tests use a separate database (`sapay_integration_test`), user (`sapay_test`), host port (`5433`), and Docker volume. They do not use the `sapay_demo` database or its data volume.

Set `TEST_POSTGRES_PASSWORD` and `DATABASE_URL` in the test process using Codespaces secrets or another secure environment mechanism. `DATABASE_URL` must target `127.0.0.1:5433/sapay_integration_test` as `sapay_test`, and its password must match `TEST_POSTGRES_PASSWORD` (URL-encode special characters). The integration test refuses any other target before creating the Nest application or opening a database connection.

Start only the isolated integration database and run the separate test command:

```bash
docker compose -f docker-compose.integration.yml up -d postgres-integration
npm run test:integration
```

The normal `npm test` command continues to run unit tests only. Integration tests use unique demo records and do not automatically delete or reset the persistent integration-test volume.

### Demo security boundary

- The in-process rate limiter is intentionally scoped to a **single API process/replica**. Do not scale the API horizontally or run multiple replicas behind a load balancer until the limiter is moved to a shared store (for example, Redis) and proxy trust is explicitly configured for the known proxy hops.
- Express proxy trust is not enabled by default; clients cannot set their own trusted IP through `X-Forwarded-For`.
- Access tokens require `iss=sapay-api` and `aud=sapay-client`, in addition to HS256 signature, `iat`, and a maximum 15-minute lifetime. Deploying this change invalidates tokens issued by earlier builds; users must sign in again.
- The demo web server sends a restrictive same-origin Content Security Policy and browser security headers. Keep JavaScript and CSS in same-origin external files; do not add inline scripts or styles without revisiting the policy.
- These controls improve the private/demo beta baseline; they are not a substitute for an external security assessment before public financial use.

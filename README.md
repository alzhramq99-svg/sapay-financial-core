# SApay Financial Core

A **demo-only** digital wallet: a NestJS + PostgreSQL double-entry ledger with
a web client and an iOS app built with Capacitor. It is not connected to banks,
payment processors or real funds, and must not be used with real personal or
banking data.

| Where | What |
|---|---|
| [`sapay-core 15/`](sapay-core%2015/) | API, database migrations, tests, web and mobile clients |
| [`sapay-core 15/README.md`](sapay-core%2015/README.md) | How to run, test and call the API |
| [`.github/workflows/`](.github/workflows/) | CI |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Branches, commits, review and the quality bar |

## Quick start

Unit tests and the build need no database:

```bash
cd "sapay-core 15"
npm ci
npm test
npm run build
```

Running the API needs PostgreSQL and an `AUTH_TOKEN_SECRET` of at least 32
characters; without them it fails at startup. Docker Compose provides both:

```bash
cd "sapay-core 15"
export POSTGRES_PASSWORD="$(openssl rand -hex 32)"
export AUTH_TOKEN_SECRET="$(openssl rand -hex 32)"
docker compose up -d --build
curl http://127.0.0.1:3000/api/health
```

To run against your own PostgreSQL instead, set `DATABASE_URL` (or `PGHOST`,
`PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`) and `AUTH_TOKEN_SECRET`, then
`npm run start:dev`. See the
[PostgreSQL section of the app README](sapay-core%2015/README.md#postgresql-database-foundation).

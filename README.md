# SApay Financial Core

A **demo-only** digital wallet: a NestJS + PostgreSQL double-entry ledger with
a web client and an iOS app built with Capacitor. It is not connected to banks,
payment processors or real funds, and must not be used with real personal or
banking data.

| Where | What |
|---|---|
| [`sapay-core 15/`](sapay-core%2015/) | API, database migrations, tests, web and mobile clients |
| [`sapay-core 15/README.md`](sapay-core%2015/README.md) | How to run, test and call the API |
| [`sapay-core 15/docs/`](sapay-core%2015/docs/) | Beta release checklist, test guide and release notes |
| [`.github/workflows/`](.github/workflows/) | CI |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Branches, commits, review and the quality bar |

## Quick start

```bash
cd "sapay-core 15"
npm ci
npm test
npm run start:dev   # http://localhost:3000/api/health
```

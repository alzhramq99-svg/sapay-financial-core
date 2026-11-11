# SApay demo data inventory — privacy review working note

**Status:** Technical inventory from source review; not legal advice or a final privacy notice.
**Reviewed ref:** `deploy/render-staging` (12 Nov 2026).
**Scope:** Demo API and current PostgreSQL schema.

## Confirmed application data

| Data | Where it is handled/stored | Purpose | Notes |
|---|---|---|---|
| Email address | `app_users.email` | Account registration and login | Normalized to lowercase; unique when present. |
| Password verifier | `app_users.password_hash` | Password authentication | Scrypt hash with per-user random salt; plaintext password is not stored by the auth service. |
| Account ID/status/creation time | `app_users` | Account ownership and lifecycle | UUID identifier; status values include ACTIVE, SUSPENDED, CLOSED. |
| Wallet ID, owner, currency, status, creation time | `wallets` | Demo wallet management | Wallet ownership is tied to the authenticated user. |
| Ledger account identifiers and currency | `ledger_accounts` | Accounting for demo wallets and demo issuance | Includes system accounts for demo issuance. |
| Journal entries and metadata | `journal_entries` | Record simulated funding and transfers | Includes references, type, status, description, metadata and timestamps. |
| Ledger postings | `ledger_postings` | Calculate simulated balances | Debit/credit side, amount, currency, account and timestamp. |
| Transfer records | `transfers` | Record simulated wallet-to-wallet transfers | Source/destination wallet IDs, amount, currency, status and journal link. |
| Idempotency data | `idempotency_keys` | Prevent duplicate transfer processing | Stores request hash and response body; schema includes optional expiry but code does not currently set it. |
| Access token | Issued by auth service | Authenticated API access | Signed HMAC token; 15-minute expiry. The reviewed auth service does not persist the token in PostgreSQL. |

## Technical/security behavior observed

- Authenticated wallet and ledger endpoints use the PostgreSQL-backed `PostgresLedgerService` and database transactions.
- The older `LedgerService` class is in-memory, but the current wallet/transfer controllers inject `PostgresLedgerService`; do not describe the live controller path as in-memory.
- Rate limiting is held in process memory and keyed by the request IP and route class; it is not a durable activity log.
- The schema contains an `audit_logs` table, but this review did not establish that application routes currently write to it. Do not claim audit-log collection without verifying writes.
- No account deletion endpoint, retention schedule, automated data purge, or idempotency-key expiry job was confirmed in the reviewed files.
- App code has no confirmed analytics/crash-reporting SDK in the reviewed package manifests. Hosting/platform logs and their retention need confirmation from provider settings.

## Owner/provider confirmations still required

1. Legal operator name, address, privacy contact and support contact monitored by a responsible person.
2. Actual hosting/database providers, processing locations, subprocessors and their retention settings.
3. Whether hosting/CDN access logs, IP addresses, device/browser data, diagnostics or backups are retained, and for how long.
4. Account closure/deletion procedure, including wallet, journal, transfer and backup handling.
5. Retention periods for accounts, ledger records, transfer records and idempotency rows; whether records must be retained for operational/legal reasons.
6. Intended countries, audience and age rating.
7. Final confirmation that the production build and infrastructure match this inventory.

## Publication guardrail

This inventory is a working technical aid, not the public privacy policy. Do not submit or represent the privacy notice as final until the owner confirms the outstanding provider, retention, deletion, legal-operator and contact details and obtains any required legal review. SApay remains demo-only: no real funds, bank connections or payment-network processing.

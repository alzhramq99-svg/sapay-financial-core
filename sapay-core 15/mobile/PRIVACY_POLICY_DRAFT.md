# SApay — Privacy Policy (draft for owner and legal review)

**Status:** Operationally informed draft; not legal approval and not ready for final App Store submission.  
**App:** SApay demo version  
**Revision date:** 12 November 2026

## 1. Scope and demo warning

SApay is a demonstration wallet interface. It does not accept, hold, or transfer real money and does not connect to banks, card networks, telecom payment rails, or government payment systems. Do not enter real banking, payment-card, identity-document, or other sensitive financial information.

## 2. Information the current application is designed to store

The inspected application code and PostgreSQL schema show that the demo backend stores:
- Account email address and a password hash. Passwords are hashed with scrypt; the plaintext password is not stored by the registration service.
- User/account identifiers and account status.
- Demo wallet identifiers, owner association, currency, and status.
- Simulated ledger journal entries, debit/credit postings, simulated transfer records, and idempotency request keys/response data.
- Support information only if a user independently sends it through a support channel.

The API issues signed bearer access tokens with a 15-minute lifetime. The token is returned to the client for authentication; it is not a real-money credential.

The inspected code does not establish a complete inventory of infrastructure access logs, IP-address retention, device identifiers, analytics, crash reporting, or all third-party telemetry. These must be confirmed with the hosting providers and final deployed configuration before publication.

## 3. How information is used

Demo information is used to:
- Create and authenticate test accounts.
- Associate wallets with the account owner.
- Display demo wallets, balances, and simulated activity.
- Record simulated credits and transfers in the demo ledger.
- Protect the API, prevent duplicate transfer requests, diagnose service errors, and maintain the demo service.

No real-money payment processing is provided.

## 4. Storage, infrastructure providers, and sharing

The current architecture uses PostgreSQL for account and ledger records. The web interface is deployed through Vercel and the API is hosted through Render. These infrastructure providers may process technical and operational information as needed to deliver, secure, and maintain their services, subject to their own terms and privacy documentation.

Before final publication, the owner must confirm the exact provider account configuration, processing regions, subprocessors, backup behavior, access-log settings, and whether any analytics or crash-reporting tools are enabled. Do not assume that no third party processes technical data.

## 5. Retention and deletion

The inspected schema and application do not establish a complete user-facing retention schedule or verified self-service account/data deletion process. Account, wallet, ledger, and idempotency records may remain in the PostgreSQL database until an authorized operational deletion/retention process is defined and implemented. The owner must set retention periods, backup expiry behavior, and a contact-based deletion process before public distribution. No fixed deletion deadline is promised in this draft.

## 6. Security

The inspected code uses scrypt password hashing, signed short-lived access tokens, authenticated wallet routes, API rate limiting, and PostgreSQL-backed ledger transactions. These are technical safeguards, not a guarantee of absolute security. Users should use unique test credentials and must not reuse personal passwords.

## 7. Children, international users, and legal operator

The owner must confirm the intended audience, age rating, legal operator name and address, countries in which the app will be distributed, and any cross-border processing before publication.

## 8. Contact

**Privacy contact:** To be supplied and monitored by the owner before publication.  
**Operator/legal entity:** Exact legal name and address to be confirmed by the owner.

## 9. Changes

This policy must be updated when the app's data practices change. The published page should show its effective/revision date.

---

## Required owner/technical confirmations before final publication

- Verify the exact production database fields and deployed API behavior.
- Confirm Vercel and Render processing regions, subprocessors, log retention, backups, and account settings.
- Confirm whether IP addresses, device identifiers, request logs, crash logs, or analytics are collected and for how long.
- Define and implement account/data deletion and backup expiry.
- Set a retention schedule for accounts, wallets, ledger entries, and idempotency records.
- Confirm legal operator name, address, monitored privacy/support contact, intended audience, and distribution countries.
- Review the final policy with appropriate legal counsel for the jurisdictions where the app will be distributed.

**Do not submit this draft as the final App Store privacy policy until all confirmations above are completed and the owner approves the public wording.**

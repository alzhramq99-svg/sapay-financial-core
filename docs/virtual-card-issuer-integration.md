# SApay Virtual Card — issuer integration boundary

## Current demo behavior

The current `بطاقتي` screen is a local-only prototype. It displays a clearly labelled illustrative card, a non-payment test identifier, and a locally persisted freeze toggle. It does not issue a PAN, CVV, token, authorization credential, or payment capability. It must not be represented as a Visa or Mastercard card.

## Production integration boundary

Keep issuer credentials and all privileged operations on the server. The browser must never call an issuer API directly with secret credentials.

Introduce a provider-neutral server interface when an issuer is selected:

- `createCard(customerRef, productRef)` — request issuance after the issuer's KYC/AML and eligibility checks.
- `getCardStatus(providerCardRef)` — retrieve lifecycle state.
- `freezeCard(providerCardRef)` / `unfreezeCard(providerCardRef)` — change lifecycle state with authorization and audit logging.
- `getCardPresentationSession(providerCardRef)` — return a short-lived, scoped session for issuer-hosted secure card details, if supported.
- `listCardTransactions(providerCardRef, cursor)` — retrieve issuer-cleared/authorized activity where contractually available.

## Required controls before live issuance

1. Complete legal, regulatory, issuer sponsorship, program approval, and country eligibility review for Sudan and each target market.
2. Complete customer identity verification, sanctions screening, AML controls, risk assessment, and ongoing monitoring as required by the issuer and applicable law.
3. Use issuer-hosted secure fields or an equivalent PCI DSS-compliant presentation method for full PAN/CVV. Do not store or log full PAN, CVV, PIN, or issuer secrets in SApay.
4. Verify webhook signatures, enforce idempotency, replay protection, event ordering, and reconciliation.
5. Apply server-side authorization, step-up authentication, rate limits, audit trails, and operational alerts to lifecycle changes.
6. Define card funding, settlement, FX, fees, chargebacks, disputes, limits, and customer support responsibilities before enabling transactions.

## API shape proposal (not implemented)

- `POST /cards` — issue a card for an eligible customer.
- `GET /cards` — list cards with masked presentation only.
- `GET /cards/:id` — return status, masked PAN, expiry metadata only where permitted.
- `POST /cards/:id/freeze` and `POST /cards/:id/unfreeze` — authenticated lifecycle controls.
- `POST /cards/:id/presentation-session` — obtain a short-lived issuer-hosted secure view session.
- `GET /cards/:id/transactions` — paginated issuer transaction activity.

Every endpoint above is a future contract proposal, not a currently available API. The demo UI must remain visibly marked as non-functional for payments until an issuer integration is approved, implemented, tested, and certified.

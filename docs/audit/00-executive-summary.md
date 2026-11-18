# Post-MVP audit — executive summary

**Date:** 2026-11-19 · **Scope:** repository, app flows, UI, API, persistence, contract integration, dependencies and local browser validation.

## Result

The app can serve as a **Fuji testnet MVP for wallet-based event tickets** after owners configure the local environment and run database migrations. Event drafts are hidden until a matching `EventCreated` transaction is verified; event discovery, registration/mint, ticket ownership reads and organizer check-in are wired to the supplied contracts. Browser UI checks passed after fixing narrow-screen overflows and a wallet prompt on ticket URLs.

It is **not production ready** and is not a student-gated service. zkEmail circuits/proof generation and a Solidity verifier are absent; QR scanning, staff roles, production rate limiting, upload storage, event editing/cancellation UI, and real-wallet browser transaction tests are also absent. The deployed EventManager permits wallet registration without VNU email proof.

## Audit verdict

- No Solidity sources were added, changed, compiled or deployed.
- The existing Fuji deployments were read and checked in the previous MVP integration pass; no transaction was sent during this audit.
- One public data exposure was fixed: `UNLISTED` events now require the organizer session on direct page and API access.
- One publication consistency flaw was fixed: metadata defaults to `UNLISTED`; publishing requires a verified on-chain event link.
- Opening a ticket no longer triggers a wallet access prompt; explicit user action starts verification.
- Browser check: 3 Playwright tests passed; 11 routes checked at 10 effective widths (195, 260, 312, 320, 375, 390, 768, 1024, 1280, 1440 CSS px). 55 screenshots capture 11 routes at desktop 1440px and effective 390/312/260/195px (100/125/150/200% of a 390px viewport).
- TypeScript, Prisma and production-build results are recorded in [06-test-results.md](06-test-results.md).
- npm advisory lookup could not reach the registry in this audit environment; a prior dependency snapshot reported 25 advisories. A fresh count and remediation could not be confirmed.

## Release gates

Before public production use: deploy and audit an EventManager that verifies a circuit-bound proof and nullifier; complete zkEmail circuit/verifier tests; add endpoint rate limits and monitoring; configure managed PostgreSQL/RPC/secrets and backups; perform wallet transaction/reorg checks; close the P1/P2 items in [05-security-review.md](05-security-review.md). Do not describe an attendee as a verified VNU student in the current deployment.

## Files

- [01-repository-inventory.md](01-repository-inventory.md)
- [02-user-journey-audit.md](02-user-journey-audit.md)
- [03-visual-audit.md](03-visual-audit.md)
- [04-technical-review.md](04-technical-review.md)
- [05-security-review.md](05-security-review.md)
- [06-test-results.md](06-test-results.md)
- [07-remediation-log.md](07-remediation-log.md)

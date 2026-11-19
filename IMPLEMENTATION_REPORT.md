# Implementation report

Updated: 2026-11-19

## Final blockchain/security continuation

- Added separate V2 Solidity contracts (deployed V1 is unchanged): EIP-712 registration authorization binds wallet, event, chain, verifying contract, expiration, nonce and purpose; signature issuer can be paused/rotated; consumed/revoked nonce, duplicate registration, inactive/full events and expired signatures revert. Tickets are non-transferable ERC-721s. Event organizers can assign and revoke event-scoped staff; check-in rejects unauthorized and duplicate use.
- Added `scripts/contracts/compile-v2.mjs` and `scripts/contracts/test-v2.mjs`. Solidity compiled with solc 0.8.38 and the in-memory EthereumJS VM adversarial suite passed. This is not a Fuji deployment or transaction receipt.
- Added a fail-closed EIP-712 authorization issuer route. It requires a server eligibility row for the exact pinned Blueprint/domain, an authenticated wallet, V2 event mapping, live Fuji manager/event/issuer checks, and a rate limit. No production eligibility row exists and the feature flag defaults off; no real eligibility signature is currently issuable.
- Added V2 staff management UI and route that only mirror an assignment after the organizer-signed Fuji receipt, event/staff/state log, and live on-chain mapping agree. Existing V1 events have no staff capability.
- Added `StudentEligibility`, authorization-audit and staff-mirror models, `fujiV2EventId`, plus additive migration `20261119230000_registration_v2_and_staff`; applied against existing PostgreSQL without reset/deletion.
- Final QA: 16/16 unit tests, 6/6 Playwright, typecheck, Prisma validation/status, contract compile/local EVM test, production build all pass. See `QA_REPORT.md` for commands and limits.

**Activation boundary:** V2 sources are not deployed and current V1 is still directly registrable. The V2 UI/issuer paths are not active until Remix deployment and wiring. No student-gated production registration is claimed.

## Changes in this continuation

- Added a two-minute, 32-byte random ticket check-in credential. Only its SHA-256 hash is stored. Issuance requires an authenticated session and live Fuji reads confirming the current wallet owns the NFT and the event is open.
- Added QR output and a browser camera scanner using `qrcode` and `@zxing/browser`, with manual-code fallback, permission/error states, and no wallet prompt until the ticket action is explicit.
- Added organizer-side prepare checks and final check-in reconciliation. The server verifies organizer ownership, session, credential expiry/consumption, ticket/event linkage, transaction sender/target/status, and the `TicketCheckedIn` log. The audit, mirror, and credential consumption are written atomically with unique event/token protection.
- Added pending transaction hash persistence before organizer event creation waits for confirmation. Existing saved hashes can be rechecked from the organizer event screen rather than submitting another create transaction.
- Disabled the UniPass student registration action until student eligibility can be enforced by a reviewed deployed contract. The UI explains that direct calls to the current contract remain possible.
- Added an additive migration for credential storage and unique event/check-in indexes. It was applied without database reset or deletion.

## Important boundary

Ticket check-in code is implemented but not accepted as a verified live Fuji feature until its read/write behavior and deployed contract authorization are tested with the actual owner/organizer roles. No contract source was changed and no Fuji write was sent. The QR is a short-lived bearer credential: a screenshot can be relayed during its two-minute window. Staff identities are not supported; only the organizer flow exists.

## Files added/changed for this work

- `src/components/TicketCheckInPass.tsx`
- `src/components/CheckInMVP.tsx`
- `src/components/EventRegisterButton.tsx`
- `src/components/PublishEventOnChainButton.tsx`
- `src/components/EventDraftForm.tsx`
- `src/app/[...slug]/page.tsx`
- `src/app/api/tickets/[tokenId]/check-in-credential/route.ts`
- `src/app/api/events/[id]/check-in/prepare/route.ts`
- `src/app/api/events/[id]/check-in/route.ts`
- `src/lib/tickets/check-in-credential.mjs`
- `src/types/qrcode.d.ts`
- `tests/unit/ticket-check-in-credential.test.mjs`
- `tests/e2e/visual-audit.spec.ts`
- `prisma/schema.prisma`
- `prisma/migrations/20261119220000_ticket_checkin_credentials/migration.sql`

Other unrelated preexisting modifications were preserved.

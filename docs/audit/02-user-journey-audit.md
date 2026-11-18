# User journey audit

| Journey | Current result | Evidence / remaining boundary |
| --- | --- | --- |
| Discover events | Implemented | Search/category/sort; public persisted events plus labeled examples. No pagination. |
| Open sample event | Implemented as demo | Registration is disabled and sample state is labeled. |
| Connect organizer wallet | Implemented | Origin-bound nonce, signed message, one-time nonce consumption and server session. Fuji is required for transactions. |
| Create event | Implemented for Fuji MVP | Metadata is first saved as `UNLISTED`; owner submits `createEvent`; API verifies receipt, organizer, capacity and deadline before publication. A failed chain call leaves a private organizer draft. |
| Publish a saved draft | Implemented for Fuji MVP | Organizer retry flow links verified `EventCreated` receipt and only then makes it public. |
| Register and mint ticket | Implemented for Fuji MVP | Attendee wallet sends `registerEvent`; contract and receipt determine success; API mirrors verified `TicketMinted`. No zkEmail/student gate. |
| View ticket list/details | Implemented with limits | Reads owner, event and check-in state from Fuji. Wallet access begins only after pressing the explicit verification/load button. Event history searches only last 200,000 blocks. |
| Organizer check-in | Implemented as token ID flow | Organizer submits transaction; backend validates `TicketCheckedIn` receipt and event/token relationship. No camera/QR or staff roles. |
| Verify VNU student | Not implemented | `.eml` input is disabled. No circuit/proof/verifier; no student state is created. |
| Edit/cancel event | Not implemented in UI | API supports metadata PATCH/DELETE; current UI does not provide a complete edit/cancel workflow. On-chain cancel is absent from management UI. |
| Share event | Implemented | Share/copy link; public event details are readable. `UNLISTED` direct page/API reads are restricted to organizer after this audit. |
| Mobile menu/navigation | Implemented | Browser audit checked route rendering and horizontal overflow including effective 200% zoom width. |

## Recovery and error states

Wallet, RPC and database errors render user-facing messages. A chain transaction can succeed while metadata mirror fails; registration/check-in responses communicate that the chain state remains authoritative. User should verify the transaction before retrying to avoid duplicate/confusing submissions.

## Mismatches corrected

1. `UNLISTED` detail pages were reachable by slug despite API access restriction. Page access now requires public visibility or matching organizer wallet.
2. New metadata defaulted to public before chain creation. API now defaults to `UNLISTED`; public transition requires a verified chain event ID.
3. `/tickets/:id` automatically requested wallet access on page load. It now waits for an explicit button action.
4. Switching wallet account/chain left a stale client session displayed. EIP-1193 account/chain changes now clear UI and revoke the current session.

## Not validated in browser

Real MetaMask sign-in, transaction signing/reverts, real ticket mint, and real organizer check-in were not triggered. Public Fuji read-only deployment checks were performed earlier; this audit is not a contract security review.

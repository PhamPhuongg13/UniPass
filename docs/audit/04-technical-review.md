# Technical review

## Data and APIs

- Zod validates event input; dates, capacity, categories, cover URL and transaction hashes are constrained.
- Auth uses a random nonce, wallet signature, origin/chain-bound message, one-time consumption and hashed opaque session token in an HTTP-only cookie.
- Event creation receipts are parsed and checked against event ID, organizer, capacity and deadline before database linking.
- Registration and check-in endpoints validate transaction receipt destination, sender and expected ticket logs, then verify chain state before updating mirrors.
- `UNLISTED` page and API access now share organizer-only behavior. Draft creation defaults to `UNLISTED`; publishing requires a verified chain event link.
- Short-lived JSON-RPC providers are destroyed after server-side register/check-in reads.

## Operational constraints

- Event/ticket mirrors are not an indexer and can become stale. Ticket list scans only the last 200,000 blocks, so older tickets can be omitted.
- No chain reorg finality policy or background reconciliation exists.
- No pagination for event listing/organizer lists beyond fixed bounds.
- No automated backup, observability, health dashboard, CI or production runtime config was found.
- External font/image resources are loaded at runtime; offline rendering falls back to system fonts and sample images may not load.
- `npm run lint` cannot run: ESLint is not installed. TypeScript checking is available and passed as noted in the test report.

## Runtime configuration

Required local settings include database URL, app origin, auth session secret and Fuji contract addresses/RPC URL. `.env` is gitignored and `.env.example` remains placeholder-only. Production deployment must use a managed PostgreSQL instance, protected environment variables, reliable Fuji/mainnet RPC policy, TLS and cookie-origin matching.

## Ownership boundary

The contract addresses and ABI fragments came from the owner. No Solidity source was copied or changed. Proof-gated student eligibility cannot be added correctly as a frontend-only feature; it needs owner-authored contract/verifier deployment and a reviewed proof/nullifier protocol.

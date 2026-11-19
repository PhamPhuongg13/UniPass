# UniPass project status

Updated: 2026-11-19

## Release position

**Hackathon MVP is not production-ready for student-gated registration.** New standalone secured V2 contract sources and an EIP-712 backend issuer scaffold are implemented and locally tested. They are not deployed or active. The deployed V1 contract remains directly registrable without student eligibility. The exact pinned zkEmail v2 Noir artifact remains unavailable (HTTP 404), so there is no verified student proof and the issuer is fail-closed.

## Feature matrix

| Feature | Current state | Verification | Remaining |
|---|---|---|---|
| Discovery/event pages | Implemented; sample content is labeled | Playwright 11 routes × 12 widths | Replace sample content with organizer-confirmed events |
| Wallet authentication | EIP-1193 and API session flow | Mock provider + ephemeral ECDSA in Playwright | Real MetaMask and Fuji untested |
| Student proof | Pinned v2 local upload/validation scaffold | No proof; artifact endpoint 404 | Restore exact artifact, real proof+verification, audit circuit guarantees |
| Organizer metadata | Authenticated DB create/edit | DB-backed Playwright | V2 chain event publishing not wired/verified; no Fuji transaction |
| Current V1 registration | UI action disabled; contract remains open | Source review | Unsafe for student-only use; migrate to separately deployed V2 |
| V2 registration | EIP-712 wallet/event/chain/contract/expiry/nonce/purpose and issuer; nontransferable NFT mint | Solidity compile + local EVM adversarial tests | Deploy V2, configure issuer only after eligibility policy passes, wire frontend transaction lifecycle |
| Ticket reads | Owner reads, cached metadata, deployment-block backfill and periodic indexer sync | 2 historical mint logs/mirrors cross-checked against Fuji `ownerOf`; ticket state matrix | Actual owner’s browser session not exercised; RPC service availability can vary |
| QR check-in | Short-lived credential, hash-only persistence, camera/manual UX, receipt reconciliation | Unit + Playwright disconnected-state tests | Live Fuji ticket, owner/staff scan and reconciliation untested; QR is bearer during TTL |
| V2 staff roles | Event-scoped contract role and organizer UI/receipt-mirror endpoint | Local EVM role grant/revoke tests; typecheck/build | Requires V2 deployment and mapped V2 events before operational use |
| Database | PostgreSQL 17, 7 additive migrations, existing rows preserved | Prisma validate/status and authenticated Playwright | Production backup/retention/managed DB policy |
| Fuji integration | Read/write adapters and handoff | No write sent | Funded test wallet, approved deployment, live MetaMask test |

## Recent work

- Added separate `contracts/UniPassEventManagerV2.sol` and `contracts/UniPassTicketV2.sol`; deployed V1 is untouched.
- Added local Solidity compiler/EVM harness, 16 unit tests, EIP-712 registration-authorization preparation and fail-closed issuer endpoint.
- Added event-specific staff contract methods, organizer staff UI, receipt validation and database mirror.
- Applied additive migration `20261119230000_registration_v2_and_staff`; database schema is current, with no reset or data deletion.
- Fixed Playwright capture resource pressure. Final browser suite: 6/6; 11 routes checked at 12 widths for horizontal overflow.

## Verified commands

`npm run typecheck` PASS; `npm run test:unit` PASS 21/21; `npm run contracts:compile` PASS; `npm run test:contracts` PASS; `npx prisma validate` PASS; `npx prisma migrate status` PASS (7/7 current); `npm run build` PASS; `npm run test:e2e` PASS 7/7. Fresh `npm audit --json`: 25 advisories (15 low, 10 high, 0 moderate/critical); no forced major upgrades. Build still reports the legacy ethers v5 missing-browser-crypto warning; affected code throws rather than falling back to weak randomness.

## Hard blockers and required actions

1. zkEmail team restores the exact Blueprint v2 artifact `73537fac-12da-4aa8-9338-2858780e0caf`; do not change Blueprint version. Real validation/proof/verification is still blocked.
2. V2 contracts require owner review and deployment from Remix on Fuji. No V2 address or transaction hash exists yet. Follow `docs/REMIX_INTEGRATION_HANDOFF.md`.
3. The deployed V1 registration selector remains unprotected. Do not use V1 for student-only events.
4. V2 issuer endpoint must stay disabled until proof policy/circuit, session binding, event policy and deployed issuer key are approved. The application currently creates no approved `StudentEligibility` records.
5. Real MetaMask, Fuji transactions, live QR scanning and on-chain staff check-in have not been tested.

## Phase 1 synchronization update — 2026-11-19

- Verified Ticket deployment transaction `0x9a92c7d9d04bb107aa11e2355d9c7947ade6d89d8bb4c73a9122167054498c3d`, receipt block `61293842`, status 1, contract address matched. `TICKET_DEPLOYMENT_BLOCK=61293842` is configured in `.env.example` and ignored local `.env`.
- Full TicketMinted history was scanned from deployment; PostgreSQL has 2 mint logs and 2 ticket mirrors. Both recipients match live Fuji `ownerOf`. The supplied wallet has one ticket in `balanceOf` and one matching indexed row.
- Standard `npm run index:fuji:tickets` completed against the tested Fuji PublicNode RPC and reported `caughtUp=true`. The original public RPC had returned a 429/1015 throttle response.
- A reorg/replay bug that removed but did not recreate `RegistrationMirror` rows was fixed; two mirrors were restored from confirmed `TicketMinted` events, and a regression test covers this path.
- No DB reset/drop/truncation occurred; seven migrations are current. Two derived `RegistrationMirror` rows were temporarily removed by the first replay and restored from canonical mint events after the indexer fix; their original `createdAt` timestamps could not be recovered. No Solidity changes, Fuji transaction writes, MetaMask transactions or student-gated registrations were performed.
- See [`docs/EXECUTION_REPORT.md`](docs/EXECUTION_REPORT.md) for exact commands and state limitations.

See [IMPLEMENTATION_REPORT.md](IMPLEMENTATION_REPORT.md), [QA_REPORT.md](QA_REPORT.md), [SECURITY_REVIEW.md](SECURITY_REVIEW.md), [FUJI_INTEGRATION_REPORT.md](FUJI_INTEGRATION_REPORT.md), [ZKEMAIL_EXECUTION_REPORT.md](ZKEMAIL_EXECUTION_REPORT.md), and [FINAL_HANDOFF.md](FINAL_HANDOFF.md).

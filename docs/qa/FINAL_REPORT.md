# UniPass full E2E / blockchain QA — final report

**Date:** 2026-11-19
**Verdict:** **CONDITIONAL GO for a controlled UI walkthrough; NO-GO for live ticket demo/production sign-off until blockers below are cleared.**
**Scope:** source, UI, API, Prisma, contract adapter, RPC/indexer, regression tests, privacy/security and Vietnamese user guides. Solidity source and deployed contracts were not changed; no chain write was sent.

## Final implementation update — 2026-11-19

This later addendum supersedes the earlier V2/deployment, migration-count, test-count, staff-role and audit findings below.

- New, separate candidate contracts `contracts/UniPassEventManagerV2.sol` and `contracts/UniPassTicketV2.sol` implement EIP-712 authorization, replay/capacity/duplicate protections, non-transferable tickets and event staff. They are locally compiled/tested only; not deployed. Existing V1 is unchanged and remains directly registrable.
- Backend registration issuer stays fail-closed; zkEmail pinned v2 Noir artifact is still 404. No real proof or eligibility established.
- PostgreSQL 17 is up and `npx prisma migrate status` reports 7/7 migrations current; no data reset/deletion.
- Final QA: unit 16/16, local EVM contract tests PASS, Playwright 6/6, typecheck, Prisma validation, production build PASS. Playwright checks 11 routes at 12 widths: 195, 260, 312, 320, 360, 375, 390, 414, 768, 1024, 1280 and 1440px. Local EVM/browser provider are not Fuji/MetaMask tests.
- Fresh npm audit: 15 low and 10 high advisories. No forced major updates. Build still prints the transitive ethers v5 `Missing strong random number source` warning; sensitive randomness uses Node crypto and the warning source throws if called without Web Crypto.
- No Fuji writes, V2 addresses, deployment hashes or real MetaMask tests were produced.

For authoritative final feature matrix and run evidence, use the top-level [`QA_REPORT.md`](../../QA_REPORT.md), [`PROJECT_STATUS.md`](../../PROJECT_STATUS.md) and [`FINAL_HANDOFF.md`](../../FINAL_HANDOFF.md).

The original findings and test table below are the initial audit baseline. The dated follow-up at the end supersedes its database/migration, test-count, and zkEmail status entries.

## Main repair

The My Tickets page previously used ethers `queryFilter` to scan about 200,000 blocks and displayed the raw JSON-RPC error. Avalanche Fuji rejected the inclusive `eth_getLogs` range because its documented provider response reported a 100-block maximum.

The page now reads an authenticated wallet-scoped database index and only performs direct owner/status contract reads after an explicit click. If that index is down or empty, it checks `balanceOf` and searches up to 512 recent IDs from `nextTokenId` using `ownerOf` in groups of eight—no log scan. Full historical coverage still requires the incremental worker, which uses 90-block batches (hard cap 100), a per-run budget, checkpoints, short reorg replay and bounded retry with jitter. No page load launches historical scanning. The UI does not show raw provider payloads and labels cached ownership as unverified when Fuji is unavailable. The user-provided before screenshot was not copied because it contains a wallet address. `screenshots/my-tickets-after-1440.png` captures the post-fix disconnected-wallet state; an authenticated list could not be captured because DB was unavailable, so it is not a live-ticket screenshot.

## Regression results

| Area / command | Result | Evidence |
|---|---|---|
| Unit RPC/indexer/ticket lookup tests | **PASS 6/6** | range boundaries, retry bounds, direct lookup, scan cap and RPC error behavior |
| Browser E2E | **PASS 3/3** | `npm run test:e2e`; 11 routes, 10 viewport widths (195–1440px), no horizontal overflow; no automatic wallet connection on ticket detail; 55 screenshots |
| TypeScript | **PASS** | `npm run typecheck` |
| Production build | **PASS** | `npm run build`; Next routes compiled |
| Prisma schema/client | **PASS** | `npx prisma validate`, `npm run db:generate`, schema diff generation |
| New DB migration applied | **BLOCKED** | `npm run db:migrate`: localhost PostgreSQL did not respond; this new index migration is not confirmed applied |
| Fuji direct ticket read | **PASS** | Read-only calls confirmed chain 43113, wallet balance 1, next token ID 2, and current token ID 1 / event ID 2 |
| Fuji ticket history worker | **BLOCKED** | No verified Ticket deployment block was supplied; worker intentionally refuses to guess |
| Live registration/check-in | **BLOCKED** | No wallet-signed transactions; no live writes were authorized or sent |
| zkEmail proof | **NOT IMPLEMENTED** | No production circuit/prover/verifier or sender mailbox control binding |
| QR issue/scan and staff check-in roles | **NOT IMPLEMENTED** | Not present in current product code |

An early E2E run hit a 180-second timeout because it navigated to every route once per viewport. The test was changed to navigate once per route and resize in place; the full suite then passed 3/3. No regression failure remains in the final E2E run.

## Findings and fixes

| ID | Severity | Finding | Resolution |
|---|---|---|---|
| RPC-001 | P1 | Oversized `eth_getLogs` request and raw RPC error on My Tickets | Replaced client history scan with cached index, bounded incremental worker, safe UI states; unit and browser checks pass |
| OPS-001 | P1 operational | New index requires DB migration and correct historical start block | Added additive schema/migration and resumable worker. Operational application is blocked on DB availability and owner-confirmed block |
| ZK-001 | P0 release blocker | Supplied EventManager flow has no zkEmail proof verifier; it does not enforce student-only registration | Documented; requires owner-side contract/verifier and independently reviewed proof flow |
| QR-001 | P2 | No actual QR issuance/scanning or staff role | Correctly labeled unavailable; no mock is claimed as real |

## Remaining actions

1. Start the local/managed PostgreSQL instance and run `npm run db:migrate`; verify the new `TicketChainLog` and `ChainSyncCheckpoint` tables.
2. In Remix or a trusted explorer, confirm the Ticket deployment block, addresses, bytecode, `TicketMinted` event signature, and manager/ticket linkage. Set `TICKET_DEPLOYMENT_BLOCK` privately, then run `npm run index:fuji:tickets` until caught up. Do not use the later `setTicketContract` block as the deployment block.
3. Run read-only Fuji ownership and index recovery smoke tests with that configured deployment. Use a disposable wallet and explicit approval before any write transaction.
4. Keep student registration marked **not verified** until a reviewed zkEmail proof binds sender policy, mailbox control/challenge, wallet, expiry and replay prevention and is enforced by the deployed contract.
5. Build and threat-test QR/staff check-in before advertising those workflows.

The follow-up read-only Fuji check confirmed the user's ticket exists on-chain. The new UI fallback discovers recent token IDs without the missing database index; live rendering in the user's authenticated browser could not be reproduced in this environment.

## Deliverables

- QA docs: `docs/qa/00_FEATURE_INVENTORY.md` through `09_RELEASE_READINESS.md`, plus this report.
- Vietnamese user guides: [`docs/guides/README.md`](../guides/README.md) and nine linked role-based guides.
- Index worker: `scripts/index-fuji-tickets.mjs`; notification utility: `scripts/notify-ntfy.mjs`.
- DB migration: `prisma/migrations/20261119170000_ticket_chain_index/`.

No notification topic or secret is stored in project documentation or source. Current report verdict requires an **attention/blocked** notification, not a success notification.

## iPhone notification

The blocked-status ntfy push was sent with `curl` after the final regression run and report preparation; ntfy returned HTTP 200. The topic was supplied only at runtime and is not recorded here or in tracked configuration.

## Follow-up QA — 2026-11-19

The earlier database-unavailable findings above are superseded by this follow-up. The existing Homebrew PostgreSQL 17 service was running; sandboxed localhost access caused the earlier false “down” diagnosis. With approved local-service access, PostgreSQL accepted connections. `npm run db:migrate` applied the two pending additive migrations without reset or deletion, and `npx prisma migrate status` now reports the schema up to date (5 migrations).

| Check | Result | Evidence |
|---|---|---|
| Unit regressions | **PASS 11/11** | `npm run test:unit`, including synthetic Noir output decoder layout |
| Authenticated backend + organizer metadata | **PASS** | Playwright ephemeral ECDSA wallet login; session and challenge binding/hash-only persistence; invalid challenge rejected; metadata event saved and marked `PENDING` on-chain; fixture rows cleaned up |
| Wallet connect UI | **PASS (test provider)** | Browser UI signed in with a mock EIP-1193 transport backed by a real ephemeral ethers wallet and loaded the challenge UI. This does not test the MetaMask extension or Fuji RPC. |
| Browser E2E | **PASS 5/5** | `npx playwright test --grep-invert 'capture key routes'`; screenshot capture excluded to avoid overwriting deliverables |
| Responsive routes | **PASS** | 11 routes × 10 viewport widths (195–1440px), no horizontal overflow; 90-second first-load timeout avoids false failure during Next dev compilation |
| TypeScript, Prisma validation, production build | **PASS** | `npm run typecheck`, `npx prisma validate`, `npm run build` |
| Database migration state | **PASS** | `npm run db:migrate`; `npx prisma migrate status` says up to date |
| Pinned zkEmail v2 `validateEmail` | **PASS** | SDK v2 validates fixture; header 693 bytes/body 363 bytes, configured limits 1152/1024 |
| Pinned v2 proof | **BLOCKED** | Conductor metadata link works, but linked public Noir circuit JSON object returns HTTP 404; no proof or `verifyProof` result |
| Real MetaMask/Fuji write | **NOT RUN** | No user wallet transaction was sent; API tests used an ephemeral software wallet only |
| QR scan / staff authorization | **NOT IMPLEMENTED** | Demo screen remains labeled unavailable; no actual QR scan flow |

The missing artifact URL is `https://storage.googleapis.com/zkemail_blueprints/73537fac-12da-4aa8-9338-2858780e0caf/noirCircuitJson.json`. Blueprint v2 stays pinned; no other version was selected. Solidity remains unchanged and student-only registration is not enabled.

## Final implementation continuation — 2026-11-19

This section supersedes the QR/check-in, registration, migration and test status above.

- The user registration action is now disabled in UniPass with an explicit warning that the currently deployed contract still permits direct `registerEvent` calls. This closes the app UI path only; it is not on-chain access control.
- Ticket check-in now has a server-issued 32-byte credential (two-minute expiry; hash-only database storage), Fuji owner/event reads, QR rendering, ZXing camera scanning, manual paste fallback, organizer-only server authorization, receipt validation and atomic one-use audit persistence. It is code-complete for a controlled test, but no real QR issuance against Fuji, camera scan, organizer transaction or contract permission was tested.
- Organizer event creation now stores the transaction hash before receipt polling and offers a reconciliation retry for the same hash.
- Migration `20261119220000_ticket_checkin_credentials` applied additively. No database reset/deletion; six migrations are up to date.
- Unit tests: **13/13 PASS**. `npm run typecheck`, `npx prisma validate`, `npm run db:migrate`, `npx prisma migrate status`, and `npm run build` pass. Production build logs a `Missing strong random number source` warning during static generation; zkEmail remains blocked and no proof success is inferred.
- Playwright: **6/6 pass across runs**: full run passed all six; after tightening the disconnected QR ticket assertion, the five non-screenshot tests were rerun and passed 5/5. Coverage includes 11 routes × 10 widths and authenticated backend API with ephemeral test wallet. It does not cover actual MetaMask or Fuji writes.
- `npm audit --json` could not contact `registry.npmjs.org` (`getaddrinfo ENOTFOUND`); current advisories remain unknown. The install-time npm snapshot reported 28 vulnerabilities (12 low, 3 moderate, 13 high), so run a fresh audit from a networked environment before release. No force upgrade was used.

No Fuji transaction was sent, no Solidity was modified, and no student eligibility proof was verified. See the top-level `PROJECT_STATUS.md`, `IMPLEMENTATION_REPORT.md`, `QA_REPORT.md`, `SECURITY_REVIEW.md`, `FUJI_INTEGRATION_REPORT.md`, `ZKEMAIL_EXECUTION_REPORT.md`, and `FINAL_HANDOFF.md` for the handoff matrix.

# UniPass status

Updated: 2026-11-19

## Final continuation update — 2026-11-19 (supersedes older status below)

- Existing PostgreSQL 17 service was restarted; database remained intact. Additive migration `20261119230000_registration_v2_and_staff` applied and `npx prisma migrate status` confirms 7/7 migrations current.
- Added standalone, **not deployed** V2 manager/ticket candidate contracts with EIP-712 registration authorization, anti-replay/capacity/duplicate checks, non-transferable tickets and event-scoped staff. Compile and adversarial local EthereumJS VM tests pass.
- Prepared fail-closed backend issuer and V2 staff management UI/receipt mirror. No V2 contract address exists; no student eligibility row is created; issuer is disabled.
- Final tests: unit 16/16, Playwright 6/6, typecheck, Prisma validate/status, build and contract compile/local EVM passed. `npm audit`: 15 low + 10 high; pinned zkEmail/Prisma/tool dependencies still need reviewed remediation.
- zkEmail v2 artifact remains HTTP 404; no real proof or verified student status. V1 is still permissionlessly registrable directly. No Fuji transaction or real MetaMask extension was tested.

## Current release state

**MVP implemented for wallet-based event tickets on Avalanche Fuji. Not production-ready and not student-verified.** The supplied contracts allow wallet registration without zkEmail proof. The verification screen is intentionally marked as in development until proof generation and on-chain verification exist.

## Implemented

- Neo-brutalist responsive student and organizer UI, discovery search/category/sort, sample event details and ticket artwork.
- Wallet challenge/signature sessions, event metadata storage and organizer ownership checks.
- Organizer event draft flow; metadata remains `UNLISTED` until its `EventCreated` transaction is verified against capacity, deadline and wallet.
- Fuji registration/mint, NFT ownership and check-in state reads, owner-only token ID check-in and verified transaction mirrors.
- Student verification preview that makes its unavailable state explicit.
- Playwright browser audit covering 11 routes, 10 effective widths and 55 full-page screenshots; ticket-specific post-fix screenshot under `docs/qa/screenshots/`. Reports in [`docs/audit/`](audit/00-executive-summary.md) and [`docs/qa/`](qa/FINAL_REPORT.md).

## Milestones

- **M0 — Repository audit:** complete. Architecture, API, data, contract boundary and release risks are captured in `docs/audit/`.
- **M1 — Experience and responsive UI:** complete for MVP. Mobile menu, narrow viewport reflow, reduced-motion support and no-overflow checks validated.
- **M2 — Backend/data:** implemented with Prisma/PostgreSQL, origin-bound auth and event APIs. Needs production rate limiting, service error distinction, retention cleanup and managed infrastructure.
- **M3 — Fuji integration:** implemented from owner-provided ABI/address and successful `setTicketContract` receipt. Fuji state was checked read-only. No app transaction was sent during this audit.
- **M4 — Ticket workflows:** create/publish, register/mint, ownership read, and organizer token ID check-in implemented. No QR/staff role support. Ticket history uses a persistent incremental index (90-block requests); the verified deployment block is configured and the index is caught up through the current Fuji safe head.
- **M5 — zkEmail:** setup/dependency exploration only. No working circuit, proof generator or deployed verifier exists. Owner-side verifier-enabled contract is required for student-gated registration.
- **Post-MVP audit:** complete as a source/browser review. Findings and remediation priorities are in `docs/audit/00-executive-summary.md` through `07-remediation-log.md`.

## Outstanding before production

1. Owner deploys a reviewed EventManager/verifier that binds a valid `@vnu.edu.vn` proof to wallet, event and one-time nullifier. Then implement and test proof generation.
2. Add production hosting, managed database, secrets, backups, monitoring and distributed rate limiting.
3. Keep the chain-index worker running with PostgreSQL and a working Fuji RPC; add complete event edit/cancel UX, staff roles and privacy-reviewed media upload.
4. Run real MetaMask/Fuji acceptance tests; add configured ESLint and CI; re-run dependency advisory scan from a networked environment.

## Latest validation

- `npm run test:e2e`: **passed 3/3**. 11 routes at 195, 260, 312, 320, 375, 390, 768, 1024, 1280 and 1440 CSS px; no horizontal overflow. Ticket detail does not request wallet access automatically. 55 screenshots under `docs/audit/screenshots/` plus the ticket fix screenshot in `docs/qa/screenshots/`.
- `npm run test:unit`: passed 6/6 for block range boundaries, retry behavior and direct token lookup fallback.
- `npx prisma validate`, `npm run db:generate`, `npm run typecheck`, and `npm run build`: passed.
- `npm run db:migrate`: blocked for the new index migration because PostgreSQL at localhost:5432 did not respond during this audit. Earlier migrations were applied in a prior session; the new migration is not confirmed applied.
- Fuji ticket indexer/live registration: blocked until the owner supplies the verified Ticket deployment block and starts the database.
- Lint: not configured because ESLint dependency/configuration is absent.
- Online `npm audit` could not reach npm registry (`getaddrinfo ENOTFOUND registry.npmjs.org`). Prior snapshot reported 25 advisories; fresh status remains unverified. No force upgrade was applied.
- Earlier work: prior Prisma migrations were applied to local PostgreSQL 17; a disposable wallet API smoke flow passed and rows were cleaned; read-only Fuji contract linkage was verified. Those checks predate this new index migration.

See [`docs/audit/`](audit/00-executive-summary.md) for full inventory, journeys, visuals, technical/security findings and follow-up plan.

## Follow-up — 2026-11-19

This section supersedes the earlier localhost database and migration blockers above.

- PostgreSQL 17 was already running. Sandbox restrictions blocked localhost probes; approved local-service access confirmed it accepts connections.
- `npm run db:migrate` applied both pending additive migrations (`ticket_chain_index`, `student_email_challenge`) without resetting or deleting data. `npx prisma migrate status` reports all 5 migrations applied.
- zkEmail v2 is pinned and `validateEmail` passes for the current local fixture. Local proof generation is **BLOCKED** because the Registry returns a link to a missing Noir artifact (Conductor link request 200; Google Storage object request 404). No proof, verified public outputs, or student eligibility result exists. Preserve the v2 pin; do not switch or create another version.
- Authenticated backend integration passed with an ephemeral wallet and test-created metadata cleaned up. Final non-screenshot browser suite passed 5/5, including the wallet-connect UI with a mocked EIP-1193 transport and 11 routes × 10 responsive widths. Unit tests passed 11/11. Typecheck, Prisma validation, migration status and production build passed.
- `next.config.ts` includes a narrowly scoped webpack parser option for the SDK's embedded Noir WASM data URL. Production build succeeds; build output has large embedded WASM serialization warnings.
- Organizer metadata creation is tested; no on-chain event create, registration/mint, MetaMask/Fuji transaction, or check-in was performed. QR scanning/staff authorization remain unimplemented. Student-gated registration remains disabled.

See [`docs/zkemail/EXECUTION_REPORT.md`](zkemail/EXECUTION_REPORT.md), [`docs/zkemail/REMIX_HANDOFF.md`](zkemail/REMIX_HANDOFF.md), and [`docs/qa/FINAL_REPORT.md`](qa/FINAL_REPORT.md) for the exact commands, artifact URL/status, security limitations and contract handoff.

## Final implementation continuation — 2026-11-19

- Added expiring QR ticket credentials and camera/manual organizer check-in. Credential secrets are only returned once to the ticket holder; the database stores their hash. The issuance/read/receipt flow is implemented but no real Fuji check-in transaction was submitted, so live check-in remains unverified.
- Persisted event creation transaction hashes before receipt waits and added a reconcile action to avoid duplicate organizer create transactions after reload.
- Student register control is now disabled in UniPass until deployed contracts enforce eligibility. Direct calls to the current contract remain possible; this is not an on-chain gate.
- Applied the additive `ticket_checkin_credentials` migration to the existing PostgreSQL without resetting data; all six migrations are up to date.
- Latest regression: unit tests **13/13**, Playwright **6/6**, TypeScript, Prisma validation, migration status and production build passed. Build emits a `Missing strong random number source` warning; it does not prove the browser prover is usable. npm audit was blocked by registry DNS.
- No real MetaMask extension, funded Fuji transaction, zkEmail proof, staff role, or contract eligibility verification was tested.

## Phase 1 database and NFT synchronization — 2026-11-19

- Verified Ticket contract creation transaction `0x9a92c7d9d04bb107aa11e2355d9c7947ade6d89d8bb4c73a9122167054498c3d`, Fuji receipt block `61293842`, status 1, matching contract address. Configured this exact public block in `.env.example` and the ignored local `.env`.
- PostgreSQL 17 accepts connections with local-service access. All 7 additive Prisma migrations are applied; no DB reset/drop/truncation occurred. The first indexer replay temporarily removed two derived `RegistrationMirror` rows; the fixed worker rebuilt both from canonical mint logs. Their prior `createdAt` timestamps were not recoverable.
- The original Fuji RPC returned HTTP 429 / Cloudflare 1015 for log scanning. The tested PublicNode Fuji endpoint is configured in local `.env`; a full idempotent scan from deployment completed and the regular `npm run index:fuji:tickets` command caught up the reorg tail.
- Database index: 2 `TicketMinted` logs and 2 mirrors. Read-only `ownerOf` checks matched both indexed recipients; the existing user-supplied wallet has balance 1 and a matching indexed/verified token.
- `npm run test:unit` **21/21**, `npm run typecheck`, `npm run build`, and `npm run test:e2e` **7/7** passed. A replay regression test covers recovery of `MINTED` registration mirrors. The UI state matrix keeps cached metadata separate from ownership; unverified tickets do not expose ownership-dependent actions.
- No registration, mint or check-in transaction was sent. Deployed V1 registration remains unrestricted and zkEmail v2 artifact is unavailable; student-only registration stays disabled. Details/evidence: [`docs/EXECUTION_REPORT.md`](EXECUTION_REPORT.md).

Top-level handoff documents: [`PROJECT_STATUS.md`](../PROJECT_STATUS.md), [`IMPLEMENTATION_REPORT.md`](../IMPLEMENTATION_REPORT.md), [`QA_REPORT.md`](../QA_REPORT.md), [`SECURITY_REVIEW.md`](../SECURITY_REVIEW.md), [`FUJI_INTEGRATION_REPORT.md`](../FUJI_INTEGRATION_REPORT.md), [`ZKEMAIL_EXECUTION_REPORT.md`](../ZKEMAIL_EXECUTION_REPORT.md), and [`FINAL_HANDOFF.md`](../FINAL_HANDOFF.md).

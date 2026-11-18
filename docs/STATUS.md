# UniPass status

Updated: 2026-11-19

## Current release state

**MVP implemented for wallet-based event tickets on Avalanche Fuji. Not production-ready and not student-verified.** The supplied contracts allow wallet registration without zkEmail proof. The verification screen is intentionally marked as in development until proof generation and on-chain verification exist.

## Implemented

- Neo-brutalist responsive student and organizer UI, discovery search/category/sort, sample event details and ticket artwork.
- Wallet challenge/signature sessions, event metadata storage and organizer ownership checks.
- Organizer event draft flow; metadata remains `UNLISTED` until its `EventCreated` transaction is verified against capacity, deadline and wallet.
- Fuji registration/mint, NFT ownership and check-in state reads, owner-only token ID check-in and verified transaction mirrors.
- Student verification preview that makes its unavailable state explicit.
- Playwright browser audit covering 11 routes, 10 effective widths and 55 full-page screenshots. Reports in [`docs/audit/`](audit/00-executive-summary.md).

## Milestones

- **M0 — Repository audit:** complete. Architecture, API, data, contract boundary and release risks are captured in `docs/audit/`.
- **M1 — Experience and responsive UI:** complete for MVP. Mobile menu, narrow viewport reflow, reduced-motion support and no-overflow checks validated.
- **M2 — Backend/data:** implemented with Prisma/PostgreSQL, origin-bound auth and event APIs. Needs production rate limiting, service error distinction, retention cleanup and managed infrastructure.
- **M3 — Fuji integration:** implemented from owner-provided ABI/address and successful `setTicketContract` receipt. Fuji state was checked read-only. No app transaction was sent during this audit.
- **M4 — Ticket workflows:** create/publish, register/mint, ownership read, and organizer token ID check-in implemented. No QR/staff role support; history scan is bounded to recent blocks.
- **M5 — zkEmail:** setup/dependency exploration only. No working circuit, proof generator or deployed verifier exists. Owner-side verifier-enabled contract is required for student-gated registration.
- **Post-MVP audit:** complete as a source/browser review. Findings and remediation priorities are in `docs/audit/00-executive-summary.md` through `07-remediation-log.md`.

## Outstanding before production

1. Owner deploys a reviewed EventManager/verifier that binds a valid `@vnu.edu.vn` proof to wallet, event and one-time nullifier. Then implement and test proof generation.
2. Add production hosting, managed database, secrets, backups, monitoring and distributed rate limiting.
3. Add complete event edit/cancel UX, durable chain indexer/reorg reconciliation, pagination, staff roles and privacy-reviewed media upload.
4. Run real MetaMask/Fuji acceptance tests; add configured ESLint and CI; re-run dependency advisory scan from a networked environment.

## Latest validation

- `npm run test:e2e`: **passed 3/3**. 11 routes at 195, 260, 312, 320, 375, 390, 768, 1024, 1280 and 1440 CSS px; no horizontal overflow. Ticket page does not request wallet access on arrival. 55 screenshots saved under `docs/audit/screenshots/`.
- `npx prisma validate`: passed.
- `npm run typecheck`: passed after fixing a test typing error.
- `npm run build`: passed after final API provider cleanup; all routes compiled.
- Lint: not configured because ESLint dependency/configuration is absent.
- Online `npm audit` could not reach npm registry (`getaddrinfo ENOTFOUND registry.npmjs.org`). Prior snapshot reported 25 advisories; fresh status remains unverified. No force upgrade was applied.
- Earlier work: Prisma migrations applied to local PostgreSQL 17; disposable wallet API smoke flow passed and rows were cleaned; read-only Fuji contract linkage verified.

See [`docs/audit/`](audit/00-executive-summary.md) for full inventory, journeys, visuals, technical/security findings and follow-up plan.

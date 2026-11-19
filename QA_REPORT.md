# QA report

Updated: 2026-11-19

## Final regression run

| Command | Result | Evidence / limits |
|---|---|---|
| `npm run typecheck` | PASS | `tsc --noEmit`; rerun after production build completed. |
| `npm run test:unit` | PASS — 16/16 | Includes EIP-712 encoding/binding, QR credential storage/format, Fuji index ranges/retries, student challenge and zk output decoders. No proof mocked as verified. |
| `npm run contracts:compile` | PASS | Local solc 0.8.38 compiled EventManagerV2 and TicketV2. OpenZeppelin emits a forward-compatibility warning that the identifier `error` will become a Solidity keyword. |
| `npm run test:contracts` | PASS | Local EthereumJS VM: valid registration/mint, unsupported V1 selector, forged/wrong wallet/chain/contract/event/purpose/issuer, expiry/TTL, revoke/replay, duplicate/capacity, issuer rotation, organizer staff grant/revoke, staff check-in and duplicate rejection. This is local EVM evidence, not Fuji. |
| `npx prisma validate` | PASS | Current Prisma schema is valid. |
| `npx prisma migrate status` | PASS | PostgreSQL 17 at `localhost:5432`; 7 migrations found, database up to date. No reset/deletion. Run required elevated local-network permission because sandbox blocks loopback. |
| `npm run build` | PASS | Next production build completed. It prints `WARNING: Missing strong random number source` twice during static generation; see Security review. |
| `npm run test:e2e` | PASS — 6/6 | Local Chromium/Next/Postgres. Authenticated API and UI use an ephemeral software key/EIP-1193 mock, not MetaMask. Route overflow checked on 11 routes at 12 widths: 195, 260, 312, 320, 360, 375, 390, 414, 768, 1024, 1280 and 1440px. |
| `npm audit --json` | WARN — 25 advisories | 15 low, 10 high, 0 moderate/critical after non-force fixes. High findings are in pinned zkEmail dependency tree, Prisma 6 line, solc/tmp and deepmerge-ts. No force/major upgrade performed. |
| Real zkEmail v2 proof | BLOCKED | Pinned artifact remains HTTP 404; no real proof or verified public outputs. |
| Fuji transactions / MetaMask | NOT RUN | No funded transaction or production deployment authorized/performed. |

### Playwright resilience fix

The first full run passed 5/6; screenshot capture exhausted the local dev server while saving 55 full-page Chromium images, yielding `net::ERR_CONNECTION_REFUSED` at `/verify-student`. Updated the capture test to save two viewport captures per route; the separate responsive test exercises twelve widths on all eleven routes. Final rerun passed 6/6 in 51.5 seconds. A typecheck also once overlapped `next build` regenerating `.next/types` and reported missing generated files; rerunning typecheck after build completion passed.

### Randomness warning investigation

The warning is emitted by the transitive ethers v5 `@ethersproject/random` browser module when static rendering has no browser `crypto.getRandomValues`. That module throws `UNSUPPORTED_OPERATION` if called; it has no weak `Math.random` fallback. UniPass challenge and QR credential generation use Node's cryptographic `randomBytes`, and no warning was suppressed or insecure fallback added. The warning remains visible until the legacy dependency path or Next rendering behavior changes.

### Coverage limits

The V2 contract paths were exercised in a local EVM with signed authorization data. The authenticated issuer route remains disabled because there is no independently verified eligibility record/artifact. V2 event create, deployment, real Fuji issuer configuration, production wallet ownership, real QR scan, and live check-in reconciliation remain unverified. The currently deployed V1 contract continues to permit direct registration; only a separately deployed V2 has the new enforcement.

## Phase 1 regression update — 2026-11-19

The latest Phase 1 run supersedes the earlier counts above: `npm run test:unit` **21/21**, `npm run typecheck` **PASS**, `npm run build` **PASS**, `npm run test:e2e` **7/7**, and `npx prisma migrate status` **PASS** (7 migrations, current). The unit suite includes a replay test confirming mint logs reconstruct `MINTED` registration mirrors. The E2E suite includes the ticket-detail check that ownership-dependent check-in is unavailable before direct ownership verification. It uses an ephemeral ECDSA key through a mocked EIP-1193 provider and does not perform a Fuji transaction.

The Ticket indexer backfilled from the verified deployment block and matched both stored mint recipients against live Fuji `ownerOf`. The actual user wallet has one ticket according to `balanceOf`, one indexed mint record and one matching `ownerOf`. The full authenticated browser journey using that wallet, including live QR check-in, remains **NOT RUN**. See [`docs/EXECUTION_REPORT.md`](docs/EXECUTION_REPORT.md).

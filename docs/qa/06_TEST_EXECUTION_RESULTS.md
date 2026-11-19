# Test execution results

| Command | Status | Evidence / limit |
|---|---|---|
| `npm run test:unit` | PASS — 6 tests | inclusive ranges, retry bounds, direct latest-token lookup, 512-ID cap and RPC failure behavior |
| `npm run typecheck` | PASS | `tsc --noEmit` after Prisma generation |
| `npm run build` | PASS | Next production build generated routes |
| `npm run db:generate` | PASS | Prisma Client 6.19.3 |
| `npm run db:migrate` | BLOCKED | `localhost:5432` did not respond; Prisma engine returned no detail |
| `npm run test:e2e` | PASS — 3/3 | 11 routes, 10 viewport widths, wallet access remains explicit, 55 captures; final My Tickets capture under `docs/qa/screenshots/` |
| Fuji Ticket read-only smoke | PASS | configured contract returned chain 43113, balance 1, nextTokenId 2, owned token ID 1 / event ID 2; no wallet address stored in report |
| Fuji historical indexing | BLOCKED | trusted Ticket deployment block and DB migration still required |
| Fuji writes | BLOCKED | no transaction sent; no write test authorized in this audit |

Do not interpret uncompleted tests as passed. See the final continuation appended below for current counts.

## Continuation — 2026-11-19

| Command | Result | Evidence / limit |
|---|---|---|
| `npm run test:unit` | PASS — 13/13 | Added hash-only and format tests for QR check-in credentials |
| `npm run typecheck` | PASS | `tsc --noEmit` |
| `npx prisma validate` | PASS | Schema valid |
| `npm run db:migrate` | PASS | Additive QR credential migration applied; no reset/deletion |
| `npx prisma migrate status` | PASS | Six migrations; database up to date |
| `npm run build` | PASS | Production compilation and route generation completed; emits `Missing strong random number source` during static rendering |
| `npm run test:e2e` | PASS — 6/6 | Authenticated DB/API, mocked EIP-1193, 11 routes × 10 widths, wallet-free ticket page and disconnected QR state. Not real MetaMask or Fuji transaction testing. |
| `npm audit --json` | BLOCKED | npm advisory endpoint DNS returned `ENOTFOUND registry.npmjs.org`; do not infer an advisory count |
| zkEmail proof and live Fuji writes | BLOCKED / NOT RUN | v2 artifact 404; no transaction submitted |

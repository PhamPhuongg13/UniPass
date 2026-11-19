# UniPass Phase 1 — Database and NFT synchronization

Updated: 2026-11-19

## Phase 2 zkEmail status update (2026-11-19)

Latest pinned-v2 results: local fixture parsing **PASS**, v2 `validateEmail` **PASS**, Noir WASM initialization **PASS**; compiled circuit JSON retrieval **FAIL** because the Registry-linked GCS object returned HTTP 404. Proof generation and `verifyProof` are **NOT RUN**, so decoded proof outputs and student eligibility remain unverified. This pre-launch QA also hardened serializable challenge-rate claims, auth input limits, and on-chain event metadata integrity (cannot fake sync success, unlink, or delete linked/pending event metadata); regression tests pass. Full details are in [`QA_REPORT.md`](QA_REPORT.md) and [`zkemail/EXECUTION_REPORT.md`](zkemail/EXECUTION_REPORT.md). No Solidity changes/deployments were made. Latest unit suite passed 21/21, typecheck passed, production build passed, Playwright passed 8/8, and the focused malformed-proof backend test passed 1/1. Student verification remains disabled pending restoration of the exact pinned v2 artifact and successful real proof validation.

## Result summary

| Area | Result | Evidence |
|---|---|---|
| PostgreSQL connectivity | **PASS** | PostgreSQL 17 is running; privileged local probe reported `localhost:5432 - accepting connections`. Unprivileged sandbox probes cannot reach host loopback. |
| Prisma migrations | **PASS** | `npx prisma migrate status`: 7 migrations found; schema is up to date. `npm run db:generate` and `npm run db:migrate` completed; no reset or destructive operation was run. |
| Ticket deployment block | **PASS** | Contract-creation tx `0x9a92c7d9d04bb107aa11e2355d9c7947ade6d89d8bb4c73a9122167054498c3d`, Fuji receipt block `61293842`, status 1, receipt contract address matched Ticket `0xB2c64E5aF70bAA9DFb66E77e02DDfe8757877631`. The public deployment block is configured in `.env.example` and ignored local `.env`. |
| Historical Ticket index | **PASS** | Idempotent scan started at block `61293842`; latest checkpoint is `nextBlock=61329528`, `caughtUp=true`. PostgreSQL contains 2 `TicketMinted` logs and 2 mirrors. |
| Indexed ownership cross-check | **PASS** | Read-only Fuji `ownerOf` checks matched both indexed mint recipients (2/2; 0 RPC read errors). `nextTokenId=3`. For the existing user-supplied wallet, `balanceOf=1`, one indexed row and one matching `ownerOf`. |
| My Tickets UI state handling | **PASS (logic/UI regression coverage)** | Cached metadata and chain ownership remain separate; RPC failure keeps cached metadata labeled unverified, and ownership actions stay unavailable until direct `ownerOf` succeeds. State matrix unit test and ticket-focused E2E passed. A live browser session for the actual NFT owner was not exercised. |
| Full real registration → mint → QR check-in | **NOT RUN** | No transaction was submitted. The current deployed V1 registration function is not student-gated; testing a new registration would bypass the eligibility policy. Real user-wallet session/staff check-in was unavailable. |
| zkEmail student eligibility | **BLOCKED** | Pinned v2 Noir artifact remains unavailable (previously observed HTTP 404). No proof was generated or verified; student-gated registration remains disabled. |

## Database diagnosis and changes

The Homebrew PostgreSQL 17 data directory was intact. `brew services` reported the service as started, its log showed the server ready on port 5432, and the process was confirmed running. The apparent “unreachable” result came from the restricted command sandbox being unable to access host loopback: elevated, read-only `pg_isready` reported accepting connections and Prisma could then query the database. No database reset, drop, or truncation was performed. A separate indexer replay temporarily removed two derived registration mirrors; the next paragraph documents their reconstruction and the fix.

The database is `unipass` on `localhost:5432`. Seven migrations are present and applied. The checkpoint was rewound to the verified deployment block to guarantee a complete historical scan; no tables or user-authored event records were reset or cleared wholesale. The first history replay exposed an indexer bug: when replacing an existing `TicketChainLog` range, the worker deleted the related `RegistrationMirror` but did not recreate it for the still-valid mint event. This temporarily removed two derived registration mirror rows. I fixed the worker to upsert a `MINTED` registration mirror for every currently observed `TicketMinted` event, reprocessed the affected range, and confirmed both rows were restored with matching canonical tx hashes, event IDs, wallets and block numbers. Their database `createdAt` timestamps were regenerated at restoration time; the old timestamps were not recoverable from the stored chain log. User-authored event metadata, sessions and other records were not deleted.

## Deployment transaction evidence

- Network: Avalanche Fuji, chain ID `43113`.
- Ticket contract: `0xB2c64E5aF70bAA9DFb66E77e02DDfe8757877631`.
- Contract-creation transaction: `0x9a92c7d9d04bb107aa11e2355d9c7947ade6d89d8bb4c73a9122167054498c3d`.
- Receipt: block `61293842`, status `1`, `to=null`, `contractAddress` equals the Ticket address above.
- The owner-provided `setTicketContract` transaction `0xf25869402b7c13303fbaf7cda922f219c8a6b6de8588a669d9c5a70493f214e8` is a separate call at block `61293854`; it is not the Ticket deployment block.
- `.env` remains git-ignored. The verified block is public chain metadata and is documented in `.env.example`; no secrets or private RPC credentials were added.

## Indexer connectivity and final state

The configured `https://api.avax-test.network/ext/bc/C/rpc` endpoint returned HTTP 429 / Cloudflare 1015 during the initial indexer attempt. This is a service throttling response, not evidence of a bad deployment block or missing contract. The alternative `https://avalanche-fuji-c-chain-rpc.publicnode.com` returned chain ID `0xa869` (43113) and served the historical log requests. The local ignored `.env` now points to that tested endpoint; no RPC key or secret was added.

The indexer processes at most 90 blocks per `eth_getLogs` request. A full rescan from deployment was completed in four bounded invocations (9,000 blocks per run maximum), with `caughtUp=true`. Results: 2 mint logs, 2 metadata mirrors, and both `ownerOf` values matched the indexed mint recipient. A later replay around the two mint blocks, after fixing registration-mirror reconciliation, caught back up and the final checkpoint query reported `nextBlock=61329528`, `caughtUp=true`.

After setting the local RPC endpoint, the normal `npm run index:fuji:tickets` command completed with exit code 0 and reported `caughtUp=true`. After the indexer fix, two normal bounded runs replayed the affected mint range and caught up; the final checkpoint query reported `nextBlock=61329528`, `caughtUp=true`.

## My Tickets state behavior

Root cause of the earlier contradictory display: `/api/tickets` could return `status: needs-deployment-block` together with `stale: true` when there was no configured/caught-up checkpoint. The page rendered the missing-setup warning from the status and separately treated `stale` as “synchronizing.” Ticket cards came from cached `TicketChainLog`/`TicketMirror` metadata, so they could also appear even when live Fuji ownership had not yet been confirmed. These are independent conditions and must not be presented as a single success/failure state.

The page has independent data for:

- **Metadata:** cached event/ticket details from the database; this does not establish NFT ownership.
- **Indexer:** deployment-block setup, catching up, caught up, and stale checkpoint status.
- **RPC:** idle/checking, available, partially unavailable, or failed.
- **Ownership:** verified only when Fuji `ownerOf(tokenId)` matches the connected wallet; unverified on generic RPC failures; not-owned only on explicit nonexistent-token or owner mismatch results.

One prioritized contextual notice is shown instead of simultaneous “not synchronized” and “synchronizing” banners. Cached ticket metadata remains visible through RPC errors with an unverified label. Ownership-dependent ticket actions, including QR check-in credentials, require successful direct ownership verification. A failure to read secondary ticket/event fields does not erase a successful `ownerOf` result.

The existing controls/tests include the combinatorial ticket state matrix and an E2E assertion that the check-in action is withheld before wallet ownership is verified. No Solidity files were modified.

## Commands and test results

| Command | Result |
|---|---|
| `npm run db:generate` | **PASS** — Prisma Client generated. |
| `npm run db:migrate` | **PASS** — no pending migrations; existing data preserved. |
| `npx prisma migrate status` | **PASS** — 7 migrations; schema up to date. |
| `NEXT_PUBLIC_AVALANCHE_RPC_URL=https://avalanche-fuji-c-chain-rpc.publicnode.com TICKET_INDEXER_MAX_BLOCKS_PER_RUN=9000 node --env-file=.env --input-type=module -e '…runTicketIndexer…'` | **PASS** — full scan, checkpoint caught up. |
| `npm run index:fuji:tickets` | **PASS** — configured local `.env`, 62-block tail sync, `caughtUp=true`. |
| `npm run test:unit` | **PASS** — 21 tests, 0 failures, including registration-mirror replay recovery. |
| `npm run typecheck` | **PASS** — `tsc --noEmit`, exit 0. |
| `npm run build` | **PASS** — Next.js production build completed. It emitted `WARNING: Missing strong random number source` from transitive `@ethersproject/random@5.8.0` used by `@zk-email/helpers`/`circomlibjs` during build; sensitive challenge creation continues to use Node `crypto.randomBytes`. |
| `npm run test:e2e` | **PASS** — final run after the indexer reconciliation fix: 7 Playwright tests, 0 failures. Includes auth/challenge flow, ticket action gating, route viewport checks, and responsive screenshot audit. These tests do not submit Fuji writes. |

The E2E wallet path uses an ephemeral ECDSA wallet behind a mocked EIP-1193 provider. It is not a MetaMask-extension test. The existing wallet ticket balance and ownership were verified by read-only RPC calls, but the actual user wallet was not connected to a browser in this run.

## Remaining blockers / next actions

1. Keep `TICKET_DEPLOYMENT_BLOCK=61293842` in the deployment environment and run `npm run index:fuji:tickets` periodically. The worker must have PostgreSQL access and a Fuji RPC that supports `eth_getLogs`; the original public endpoint was throttled, so the current local environment uses the tested PublicNode Fuji endpoint.
2. Do not run a new registration/mint test through the current deployed V1 contract: `registerEvent(uint256)` is not protected by verified student eligibility. A secure V2 contract and authorization handoff are documented separately; no Solidity was modified or deployed in this task.
3. The zkEmail v2 Noir artifact must be restored, then the pinned v2 proof must be generated and cryptographically verified before issuing student eligibility.
4. A real user-wallet registration and organizer/staff QR check-in journey remains **NOT RUN** until the Solidity eligibility gate and staff transaction path are deployed and an authorized Fuji test wallet is available.

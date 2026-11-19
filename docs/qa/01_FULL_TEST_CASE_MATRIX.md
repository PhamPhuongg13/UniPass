# Full test case matrix

| ID | Preconditions / action | Expected | Actual / status | Evidence |
|---|---|---|---|---|
| RPC-01 | Build ranges for 0, 1, 90, 91, 100, 101, 201, 100001 blocks | Inclusive, contiguous, max 100 | PASS | `npm run test:unit` |
| RPC-02 | Single block and final partial batch | Exact bounds; no gaps | PASS | unit test |
| RPC-03 | 429/503 then recovery | <=3 retries with jitter | PASS | unit test |
| RPC-04 | Permanent invalid argument | No retry | PASS | unit test |
| TIX-01 | Run without trusted deployment block | Fail with setup guidance before RPC scan | PASS by code path | indexer validates before provider |
| TIX-02 | Checkpoint restart/reorg/duplicate log | Idempotent rows and replay tail | BLOCKED | DB is unavailable; no integration fixture |
| TKT-01 | Explicit ticket load | Reads cache; no client `queryFilter` | PASS by code inspection and build | WalletTickets + API |
| TKT-02 | Empty/many wallet, ownership change, RPC outage | Clear empty/partial states | PARTIAL; live scenarios need Fuji | UI state/code only |
| WAL-01 | MetaMask reject/switch/reload | Wallet-bound session | BLOCKED | no interactive wallet test fixture |
| DISC-01 | Route matrix at responsive widths | 200 pages/no horizontal overflow | E2E result in final report | Playwright config/spec |
| REG-01 | Confirm/reject/duplicate/full/deadline | No false success | BLOCKED live; no contract fixture | no wallet tx sent |
| ORG-01 | Create and unauthorized access | Own event only | BLOCKED integration | database unavailable |
| CHK-01 | Wrong event/already checked/revert | No false check-in | BLOCKED live; QR absent | source review |
| ZKE-01 | `.eml`, DKIM, wallet binding/replay | Verified eligibility | NOT IMPLEMENTED | no prover/verifier |
| API-01 | Authorization and DB transitions | Valid response/ownership checks | PARTIAL review; DB tests blocked | API routes |
| BUILD-01 | Production build and TS validation | Clean build/typecheck | PASS | commands in final report |

Tests needing live contracts, wallet, DB fixtures or operator secrets are BLOCKED, not presumed passed.

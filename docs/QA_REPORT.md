# UniPass pre-launch security and MVP QA

Updated: 2026-11-19

## Release verdict

**Conditional demo readiness for UI, authenticated metadata flows, read-only Fuji ticket ownership and existing tickets. NO-GO for public student registration or a live registration/check-in demo.** The pinned zkEmail v2 Noir artifact still returns HTTP 404. No real proof has been generated or verified. The deployed V1 `registerEvent(uint256)` does not enforce student eligibility; the UI is disabled but cannot secure direct contract calls.

No Solidity was modified, no chain transaction was submitted, and no database reset/deletion was performed. E2E uses temporary generated wallets/rows and cleans them up.

## Audit matrix

| Area | Current implementation | Evidence / status | Remaining issue |
|---|---|---|---|
| Wallet auth | Personal-sign challenge includes app origin, wallet, chain 43113, random nonce, issue/expiry; server verifies signature and claims nonce atomically; HttpOnly, Secure-in-prod, SameSite=Strict cookie with DB token hash | **PASS** for source and E2E signature/session/replay checks (test wallet) | Custom wallet challenge, not full SIWE standard. Real MetaMask/account/network switching not manually tested. Session lifetime is 7 days. |
| Origin/CSRF | Mutations check configured origin; session cookie is SameSite Strict | **PASS** unauthorized/cross-origin E2E checks | Add production proxy/host trust review and edge rate limiting before public launch. |
| Organizer/event auth | Event create requires wallet session; read-private/update/delete routes scope by organizer | **PASS** authenticated API E2E; fake sync/unlink/delete guards added | No complete edit/cancel workflow. On-chain cancellation is not linked to metadata state. |
| Event chain reconciliation | Publish stores hash and sync state; API verifies Fuji chain, receipt, sender, EventCreated ID/capacity/deadline | **PASS (code/unit/browser only)**; fake `SYNCED` without tx now fails closed | No createEvent transaction in this QA. RPC timeouts/reverts only code-handled, not live-tested. |
| Registration eligibility | UI button is disabled; issuer endpoint checks policy but remains `STUDENT_REGISTRATION_ISSUER_ENABLED=false` | **PASS (gate remains closed)** | V1 contract is permissionlessly callable and has no zkEmail check; frontend/API cannot fix this. Requires owner-deployed contract enforcement. |
| Ticket ownership | Cached metadata separate from direct Fuji `ownerOf`; ownership-dependent actions require direct match | **PASS** state matrix and read-only prior Fuji cross-check (2/2 indexed tickets) | No fresh mint/transfer test in browser. |
| QR credentials | Random 32-byte opaque secret; hash stored; 2-minute expiry; binds event/token/owner session; one-use atomic DB claim; current ownership/event checked on Fuji | **PASS (unit/source)**, not live check-in tested | QR is a bearer credential; camera/manual flow and receipt reconciliation have no real Fuji acceptance test. |
| Staff check-in | V2 staff mirror/management endpoints exist; legacy check-in route authorizes event organizer only | **PARTIAL** | V2 is not deployed/configured; staff authorization is not wired end-to-end to the scanner/transaction. Do not advertise staff check-in. |
| Check-in replay | Unique event/token audit and atomic credential consumption; chain receipt/event/token and owner are validated | **PASS (logic)** | No duplicate live transaction or RPC-failure recovery test on Fuji. |
| zkEmail | Local `.eml`, challenge API, pinned v2 validate/prove UI, backend verifier fail-closed | Fixture `validateEmail` **PASS**; circuit retrieval **BLOCKED** (GCS 404), proof/verify **NOT RUN** | No student status. Circuit outputs do not bind wallet/event/chain/expiry/nullifier; regex accepts wrong/42-char nonce and duplicate challenge extraction. |
| Indexing/RPC | 90-block log ranges, <=100 hard cap, 3 retries with jitter, 3 confirmations, 12-block reorg replay, transactional checkpoint; direct ownership never inferred from index | Unit tests **PASS**; prior full Fuji index caught up at block checkpoint | HTTP 429/range handling unit-tested; no live throttling/reorg simulation in this run. |
| XSS/input/privacy | Zod input schemas; React escaped rendering; no `dangerouslySetInnerHTML` found; raw `.eml` stays browser-local; errors avoid email/body logging | Source review **PASS** within inspected paths | No external penetration test, CSP/security-header audit, or production dependency audit in this run. |

### Fixes made in this QA pass

- Prevented an organizer from deleting event metadata after an on-chain event ID or transaction hash has been recorded/persisted. This avoids orphaning a live/pending chain event from UniPass management history.
- Prevented unlinking a confirmed chain event and required a transaction hash plus successful `EventCreated` receipt verification before an update can mark an event `SYNCED`.
- Made login nonce and student-email challenge per-wallet rate checks plus creation/invalidation a serializable database transaction. Under serialization conflict, requests fail closed with a service error rather than exceeding the configured allowance.
- Capped authentication signature input and retained `Cache-Control: no-store` on auth challenge responses.
- Added regressions for event unlink/delete/fake-sync, login nonce simultaneous replay, parallel rate-limit requests, cross-origin requests and unauthenticated student/check-in routes.

## End-to-end journeys

| Flow | Result |
|---|---|
| Visitor landing/discover/event detail | **PASS** browser route/viewport checks. |
| Wallet sign-in + session + challenge | **PASS** with ephemeral ECDSA wallet behind mocked EIP-1193 transport; not MetaMask extension. |
| Organizer metadata creation and authorization | **PASS** API test; temporary test event cleaned up. |
| Organizer createEvent transaction | **NOT RUN**; no funded write was authorized. |
| Student registration / mint | **NOT RUN**; UI is disabled by policy and V1 contract is not eligibility-secure. |
| My Tickets / direct ownership | **PASS** state/error handling tests; previous read-only Fuji owner checks passed for indexed fixtures. |
| QR generation / camera scan / organizer check-in / duplicate live scan | **NOT RUN** on Fuji. Unit credential/replay logic exists; code path depends on real contract permission and transaction. |
| Student email proof | **BLOCKED** at missing compiled artifact; no proof or verified public outputs. |
| Cancellation/reverted transaction lifecycle | **PARTIAL / NOT RUN**; missing complete cancellation UI/reconciliation and no live transaction tests. |

## UI, responsive and accessibility

Playwright checks 11 routes at 195, 260, 312, 320, 360, 375, 390, 414, 768, 1024, 1280 and 1440 CSS pixels and saves desktop/mobile screenshots under `docs/audit/screenshots/`. Overflow checks pass. Ticket detail does not prompt for wallet access on page load; verification remains unavailable without session. This is automated viewport/interaction QA, not a full manual keyboard/screen-reader/contrast audit. No axe scan was run.

## Test results

| Command | Result |
|---|---|
| `npm run test:unit` | **PASS 21/21** (current suite) |
| `npm run typecheck` | **PASS** (`tsc --noEmit`) |
| `npm run build` | **PASS**; Next.js 15.5.29. Existing dependency warning: `Missing strong random number source`; application CSPRNG uses Node `crypto.randomBytes`, no insecure fallback added. |
| `npm run test:e2e` | **PASS 8/8** using Chromium and a real local PostgreSQL database. Includes authenticated API, race/replay/rate-limit and event-link integrity checks, no-session/cross-origin rejection, and 11 routes at 12 widths. A subsequent focused authenticated backend rerun passed **1/1** after adding malformed proof/public-signal rejection checks. E2E provider is mocked; no MetaMask/Fuji writes. |
| `npx prisma validate` / migration status | **PASS in prior Phase 1 verification**; this QA made no schema/migration changes. |
| Fuji writes / real MetaMask | **NOT RUN** |

## Demo readiness and required approvals

Use [`guides/09_KICH_BAN_DEMO.md`](guides/09_KICH_BAN_DEMO.md), student guide [`guides/02_HUONG_DAN_SINH_VIEN.md`](guides/02_HUONG_DAN_SINH_VIEN.md), organizer guide [`guides/03_HUONG_DAN_BAN_TO_CHUC.md`](guides/03_HUONG_DAN_BAN_TO_CHUC.md), and operations guide [`guides/04_HUONG_DAN_ADMIN_VA_VAN_HANH.md`](guides/04_HUONG_DAN_ADMIN_VA_VAN_HANH.md). Do not submit transactions during demo without owner approval and a dedicated Fuji test wallet.

Remaining external actions: restore the exact pinned zkEmail v2 Noir artifact; owner review/deploy a contract that enforces eligibility; provide V2 deployment addresses if staff flow is to be exercised. Live Fuji writes require explicit approval/funded test wallet. See [`EXECUTION_REPORT.md`](EXECUTION_REPORT.md) and [`zkemail/EXECUTION_REPORT.md`](zkemail/EXECUTION_REPORT.md) for detailed evidence.

The final E2E run passed all 8 tests, but Next dev printed a non-fatal `Failed to generate static paths for /api/events/[id]` syntax warning referencing its generated `ethers.js` vendor chunk. API assertions and production build passed; treat this as a dev-bundler warning to monitor, not proof that production is affected. The first run of the added login replay test failed because the test changed the shared cookie before later assertions; moving that race test to the end fixed the test, and the final run passed.

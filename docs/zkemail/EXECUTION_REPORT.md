# UniPass zkEmail execution report

Date: 2026-11-19. Solidity unchanged; student-gated registration remains disabled.

## Pre-launch hardening regression update (2026-11-19)

The latest application QA passed `npm run test:unit` (21/21), `npm run typecheck`, `npm run build`, and `npm run test:e2e` (8/8); the focused authenticated backend rerun passed 1/1 after adding malformed proof-byte/public-signal rejection assertions. E2E covers challenge/session binding, invalid/expired/consumed/wrong-wallet rejection, concurrent challenge rate limits, simultaneous login nonce reuse, organizer metadata integrity, cross-origin/no-session rejection, ticket action gating, and responsive route checks. The browser wallet transport is test-only; no proof was generated and no Fuji transaction was sent. Detailed release/feature matrix: [`../QA_REPORT.md`](../QA_REPORT.md).

Student gating remains disabled. The actual v2 proof gate below still fails at the missing circuit artifact, and this QA did not change or replace the Blueprint.

## Phase 2 verification attempt (2026-11-19, latest)

This section supersedes older statements about fixture validation and the current artifact endpoint. The exact pinned Blueprint remained `PhamPhuongg13/UniPass_Student_Verification@v2` (compiled ID `73537fac-12da-4aa8-9338-2858780e0caf`); no Blueprint version/configuration was changed.

### Real fixture pipeline

Command: `ZKEMAIL_EML_PATH='/Users/vuphuongpham/Downloads/UniPass email verification (2).eml' node --experimental-strip-types scripts/zkemail/run-v2-proof.ts`.

| Step | Result | Evidence |
|---|---|---|
| SDK parse / fixture challenge | **PASS** | 7,300 bytes read locally; SDK canonical header 693 bytes and body 363 bytes; one challenge match, 43 characters, fixture comparison true. The report records only its SHA-256, not its value. |
| Load pinned v2 / compiled metadata | **PASS** | ID above, version 2, compiled; Noir client enum 3, SP1 server enum 2; configured limits 1152/1024 bytes. |
| `validateEmail` | **PASS** | Official SDK Blueprint validation succeeds on the supplied fixture. |
| Initialize Noir WASM | **PASS** | `initNoirWasm()` completed. |
| Retrieve required compiled circuit JSON | **FAIL / BLOCKED** | Conductor JSON-link endpoint returned HTTP 200 (`application/json`, 597 bytes). Its exact GCS object `https://storage.googleapis.com/zkemail_blueprints/73537fac-12da-4aa8-9338-2858780e0caf/noirCircuitJson.json` returned HTTP 404 (`application/xml`, 238 bytes). SDK error: `Failed to download or parse the response data`, from `Blueprint.getNoirCircuit()` (`dist/index-CpetQeNY.mjs:136214`, called at `:143180`, script line 133). |
| `generateProof` | **BLOCKED / NOT RUN** | SDK circuit load fails before witness/proof generation. |
| `verifyProof` / actual public outputs | **NOT RUN** | There is no proof. `sender_domain=vnu.edu.vn` and exact challenge comparison cannot be claimed from proof outputs. |

There was no 502 in this latest attempt: metadata and Conductor link were reachable; the pointed-to proof artifact was missing (404). The SDK-declared artifact methods were also checked previously: Noir circuit ZIP and Noir circuit JSON return 404; regex-graph ZIP returns 200 but is not a proving circuit and cannot substitute for it. No local artifact injection path is documented by SDK 2.0.11. Bounded retries are appropriate only for transient metadata errors; a deterministic object 404 was not retried indefinitely.

### SDK negative checks and security observations

Commands: `ZKEMAIL_EML_PATH='<local fixture>' node scripts/zkemail/test-v2-negative-eml.mjs` and `ZKEMAIL_EML_PATH='<local fixture>' node scripts/zkemail/test-v2-regex-negative.mjs`.

- The original fixture passes `validateEmail`; the SDK-parsed body has one challenge line and the expected local comparison succeeds.
- Altering the signed body while retaining the challenge fails SDK validation with `Failed to verify email with any public key: Key #1: Verification failed: body hash did not verify`. This demonstrates that `validateEmail` checks DKIM/body-hash integrity for the altered fixture; it is not a zk proof and does not show the absent circuit's constraints.
- Replacing the nonce or inserting an invalid character likewise invalidates the fixture's DKIM body hash. Missing/duplicate signed-message `validateEmail` cases were inconclusive in the earlier run because the DNS key lookup returned HTTP 429. They are **not** proof-level tests.
- `testDecomposedRegex` on the actual SDK-canonicalized fixture: challenge extractor returned one 43-character output matching the fixture. A different 43-character value **and a 42-character value both extract successfully**; only the exact server-side comparison can reject those outputs after a real verified proof. An invalid character and missing challenge were rejected by the extractor. Two challenge lines returned one extracted match; therefore this API result does not establish that the compiled circuit rejects duplicate challenge occurrences.
- `sender_domain` extractor passed the fixture and returned the VNU domain. Uppercase `FROM:` in a synthetic canonical-header test did not match the lowercase literal. A synthetic display line with an external address in display text and a VNU address later in the line still extracted the VNU domain. A synthetic header containing multiple `From` fields also returned one VNU match. These are regex extraction observations, not signed-header or circuit tests; they expose ambiguity requiring scrutiny of DKIM signed-header selection and circuit behavior.
- Actual v2 decomposed parts (from SDK metadata): `sender_domain` header parts `(\\r\\n|^)from:[^\\r\\n]*@` (private), `vnu[.]edu[.]vn` (public), `[>\\r\\n]` (private); `challenge` body parts `(\\r\\n|^)UNIPASS-CHALLENGE:` (private), `[A-Za-z0-9_-]+` (public), `\\r\\n` (private). Challenge max length is 96; the regex does not itself constrain exactly 43 characters. Backend exact matching can enforce the issued 43-character nonce only after real proof verification, but it cannot repair an ambiguous circuit extraction or prove wallet ownership.
- The earlier Registry UI showing `\\r\\n` for outputs remains unresolved. Local regex output is correct on this fixture, but only a generated and verified proof can distinguish UI serialization from a compiled circuit extraction defect.
- Modified proof, forged public-output proof, replayed valid proof, cross-wallet proof, and expired-nonce **proof-level** cases are **NOT RUN** because no proof exists. Backend challenge/session tests reject wrong wallet, expired and consumed challenge records before any proof verifier call; those tests do not replace proof-level checks.

Security conclusion: even a future valid proof of a signed VNU-domain message containing a server nonce would not alone prove that the uploading wallet personally controls the sender mailbox, because an `.eml` is transferable and the current circuit outputs do not bind the wallet. A university domain also does not distinguish enrolled students from alumni, staff, or aliases. No student-eligibility state is issued; on-chain gating remains disabled.

### Regression run (latest)

- `npm run test:unit` — **PASS 21/21**. Includes challenge/session helpers, decoder negative checks, and independent ticket state matrix.
- `npm run typecheck` — **PASS** (`tsc --noEmit`).
- `npm run build` — **PASS**. Next.js 15.5.29 production build completed. It emitted `WARNING: Missing strong random number source` from a transitive SDK/dependency during build; challenge generation itself uses Node `crypto.randomBytes` and no weak fallback was introduced.
- `npm run test:e2e` — **PASS 7/7** using Chromium and an ephemeral test wallet/provider; includes authenticated challenge issuance, ownership-gated ticket UI, responsive route checks, and verification-unavailable UI. This is not a real MetaMask or Fuji write test.

### Required next action

The Registry/operator must restore the immutable v2 Noir JSON artifact at the exact object URL above (or correct its artifact pointer while preserving the pinned v2 identity). Then rerun `scripts/zkemail/run-v2-proof.ts` and require successful real proof generation, `verifyProof`, and exact decoded output comparisons before the API can issue any student status. Do not substitute a regex graph, fabricate an artifact, or use another Blueprint version.

## Follow-up execution — database, QA and pinned v2 artifact retry (2026-11-19)

This follow-up supersedes earlier statements in this report that PostgreSQL was unavailable or that the two latest migrations had not been applied. It does not change the zkEmail security gate.

### Database

- **PostgreSQL: PASS.** The existing Homebrew `postgresql@17` service was already running and listening on localhost:5432. Connection probes inside the restricted execution sandbox failed; the same probe with approved local-service access returned `accepting connections`. This was a sandbox networking restriction, not a stopped database.
- **Migrations: PASS.** `npm run db:migrate` applied only `20261119170000_ticket_chain_index` and `20261119180000_student_email_challenge`. Both migrations create tables/indexes; no rows were deleted, no reset was performed.
- **Migration status: PASS.** `npx prisma migrate status` reported “Database schema is up to date!” (5 migrations found).

### Authenticated backend and app QA

- **Authenticated backend E2E: PASS.** `tests/e2e/authenticated-backend.spec.ts` used a throwaway ethers wallet to request and sign a login challenge, verified the session cookie, issued a student-email challenge, confirmed 43-character nonce format/Fuji chain/purpose and hash-only persistence, checked that an altered challenge is rejected before Registry access, and created an unlisted organizer event metadata row with `blockchain.status=PENDING`. Test-created rows were cleaned up by their generated wallet/slug.
- **Browser E2E: PASS 5/5.** `npx playwright test --grep-invert 'capture key routes'` passed backend authentication/organizer metadata, wallet-connect UI and challenge issuance using a test EIP-1193 provider backed by a real ephemeral ECDSA wallet, all 11 public/organizer route viewport checks (10 widths, 195–1440 px), no eager wallet prompt on ticket detail, and the disconnected-wallet verification state. Screenshot capture was excluded to preserve audit images. A first-load `discover` timeout occurred at the old 30-second navigation limit; the route passed on focused retry and in the final full run after increasing that limit to 90 seconds.
- **Wallet: PARTIAL.** The app's connect, signature, server session, and challenge UI path passed against a mocked EIP-1193 transport with a real throwaway ECDSA signature. This does not test the MetaMask extension, RPC connectivity, network switching, or a real user wallet.
- **Organizer: PARTIAL.** Event metadata API creation and pending-chain labeling passed. No `createEvent` transaction was sent.
- **Registration/ticket/QR: BLOCKED for live transactions.** Browser route and non-eager-wallet checks passed. No registration, NFT mint, ticket ownership, or check-in transaction was sent. QR issuance/scanning/staff roles remain unimplemented; sample check-in screen is explicitly a demo.
- **Blockchain: NOT CLAIMED.** No contract write occurred. Existing `registerEvent(uint256)` is callable without zkEmail enforcement. Student-only registration remains disabled.

### Pinned Blueprint v2 — retry and proof status

Command: `ZKEMAIL_EML_PATH='/Users/vuphuongpham/Downloads/UniPass email verification (2).eml' node --experimental-strip-types scripts/zkemail/run-v2-proof.ts`. The script emits sanitized measurements and HTTP status/path only; raw email and challenge value are not logged.

| Operation | Result | Evidence |
|---|---|---|
| Load pinned `PhamPhuongg13/UniPass_Student_Verification@v2` | **PASS** | Registry returned compiled ID `73537fac-12da-4aa8-9338-2858780e0caf`, version 2; client framework enum 3 (Noir), server enum 2 (SP1), both reported compiled. |
| SDK `validateEmail` | **PASS** | Supplied fixture passes v2 validation. SDK parse: canonical header 693 bytes, body 363 bytes; configured maxima 1152/1024. Challenge count in SDK-validated body is one, expected nonce comparison passes; the nonce itself is not recorded. |
| Initialize official Noir prover runtime | **PASS** | `initNoirWasm()` completes. Frontend build now includes this runtime via a targeted Next/Webpack URL-parser rule. |
| Retrieve compiled Noir circuit JSON | **FAIL / BLOCKED** | Conductor link endpoint `https://conductor.zk.email/blueprint/noir-circuit-json/73537fac-12da-4aa8-9338-2858780e0caf` returned HTTP 200 JSON (595 bytes) containing the artifact link; the linked public object `https://storage.googleapis.com/zkemail_blueprints/73537fac-12da-4aa8-9338-2858780e0caf/noirCircuitJson.json` returned HTTP 404, XML (238 bytes). |
| Generate proof | **NOT RUN TO COMPLETION** | Official SDK fails in `Blueprint.getNoirCircuit()` before witness/proof generation with `Error: Failed to download or parse the response data`; stack: `index-CpetQeNY.mjs:136214` → `getNoirCircuit` at `:143180` → `generateLocalProof` at `:142547`. This is a missing compiled circuit artifact, distinct from the earlier metadata 502. |
| `verifyProof`, public output decoding, tamper/negative proof tests | **NOT RUN** | There is no real proof. No `sender_domain`/`challenge` proof output has been verified. Registry's earlier `\r\n` output display remains unresolved. |

The Node test process emits `WARNING: Missing strong random number source` while initializing the SDK runtime. Proof generation stopped earlier at the missing circuit artifact, so this warning's effect on Node proving is undetermined. Browser-local proving uses the browser runtime path but has not completed; no entropy fallback or mock proof was used.

The first retry during this turn established metadata availability and `validateEmail` PASS but found the missing artifact. A second bounded retry reproduced the same Conductor 200 → Google Storage 404 path. Do not retry indefinitely; the required Registry-side action is to restore/republish the v2 Noir circuit JSON at the exact object path or provide an SDK-compatible artifact URL for this immutable v2. Do not create another Blueprint version or switch versions.

### Regression commands

- `npm run test:unit` — **PASS 11/11**, including a synthetic test for the SDK 2.0.11 Noir public-output layout. This decoder test does not substitute for decoding a real cryptographically verified proof.
- `npm run typecheck` — **PASS**.
- `npx prisma validate` — **PASS**.
- `npx prisma migrate status` — **PASS**, up to date.
- `npm run build` — **PASS** after Next/Webpack config was adjusted so the SDK's embedded Noir WASM data URL is left to the browser URL implementation. Webpack reported large-string serialization performance warnings for SDK WASM bundles; no build errors remain.
- `npx playwright test --grep-invert 'capture key routes'` — **PASS 5/5** on final run.

### Remaining blockers and manual next steps

1. Registry/operator must restore the missing v2 Noir artifact at the object URL above (or fix its URL metadata). No app-side substitution is safe for immutable compiled circuit artifacts.
2. Rerun the pinned-v2 script. Only a completed `generateProof` + `verifyProof` and exact decoded outputs can turn the proof gate into PASS.
3. Once the artifact is restored, independently test the server-side Noir verification path with a real locally generated proof before any API response can be treated as proof-verified.
4. Do not enable student-gated registration. Even successful v2 domain/challenge outputs are not circuit-bound to wallet, event, or expiry and do not distinguish enrolled students from staff/alumni/aliases.

## Historical pinned v2 execution before this follow-up (2026-11-19)

Used only `UniPass email verification (2).eml` via `ZKEMAIL_EML_PATH`, with the pinned slug `PhamPhuongg13/UniPass_Student_Verification@v2`. Scripts report byte counts, hashes, match booleans and sanitized errors only; they never print, upload or commit raw email content.

| Operation | Result | Evidence |
|---|---|---|
| Locate exact fixture | **PASS** | File exists at the path supplied in this turn. |
| SDK `parseEmail` | **PASS (parse only)** | Parsed DKIM signature and public key (each 256 bytes); SDK canonical header 693 bytes, body 363 bytes. Parsing alone does not cryptographically verify DKIM. |
| Expected challenge in SDK body | **PASS** | Exactly one match, 43 characters, equal to the supplied nonce. SHA-256: `f39968014c8e6da950251fb67dc4a1dade107912798474da25e972b320110c29`. |
| Sender-domain candidate regex via SDK `testDecomposedRegex` | **PASS** | One output, 10 characters, exact comparison passed; SHA-256 `5e0fafcfb11c281ef59768c3522aa176a2e321ca7b0b62dc437b9f8d72ce99b1`. |
| Challenge candidate regex via SDK `testDecomposedRegex` | **PASS** | One output, 43 characters, exact expected-nonce comparison passed; output hash matches the body nonce hash above. |
| Load exact v2 Blueprint | **BLOCKED** | `getBlueprint` failed after 3 attempts with HTTP 502 before metadata or `validateEmail` could run. Stack points to SDK `getBlueprintBySlug` (`dist/index-CpetQeNY.mjs:142688`). |
| `validateEmail` | **NOT RUN** | Blocked by Registry HTTP 502; no claim of DKIM/circuit validation. |
| Local proof generation / `verifyProof` | **NOT RUN** | Blocked before Blueprint retrieval. |
| Proof public outputs and negative proof tests | **NOT RUN** | No proof is available to decode or tamper. |

Actual command: `ZKEMAIL_EML_PATH='<local fixture path>' node --experimental-strip-types scripts/zkemail/run-v2-proof.ts`. Bounded retry made 3 requests, with delays of 250 ms then 500 ms. All returned `502` from `https://conductor.zk.email/blueprint/by-slug/PhamPhuongg13%2FUniPass_Student_Verification/2`; query strings and response bodies were not logged. SDK stack: `Error: HTTP error! status: 502` at `sg (dist/index-CpetQeNY.mjs:136085:53)` and `ac.getBlueprintBySlug (dist/index-CpetQeNY.mjs:142688:11)`. The process also emitted `WARNING: Missing strong random number source`; it still parsed the message and ran local regex compilation.

### Offline artifact loading check

The installed SDK exposes public Blueprint retrieval by slug/id, a constructor that requires Blueprint props and a base URL, and artifact download/access methods such as `getVkey`, `getZKeyDownloadLink`, and `getNoirCircuit`. `createProver({ isLocal: true })` still needs the compiled Blueprint metadata and proving artifacts; it is not an offline loader for an arbitrary saved artifact bundle. No v2 metadata/verifier artifacts were found in the repository. I did not synthesize metadata, select another version, or bypass the Registry.

### Registry `\\r\\n` output observation

The SDK decomposed-regex compiler independently extracted the expected `vnu.edu.vn` and challenge values from this fixture. Candidate extraction therefore works locally on this message. This does not prove the Registry's compiled circuit uses the same configuration. The earlier `"\\r\\n"` display remains unresolved between UI serialization and a mismatch in the compiled proof/configuration. Resolving it requires decoding public outputs from that exact proof; Registry 502 prevented that check.

### State at the previous turn (superseded by the follow-up above)

The correct fixture has been located and its nonce confirmed in the SDK-parsed body. Frontend and backend challenge plumbing is implemented, but the Registry outage blocks `validateEmail`, local proving and cryptographic proof verification. The server will consume a challenge only after the pinned verifier accepts the proof and independently decoded outputs match. There is no student-verified state and event registration remains unchanged. The challenge migration was generated but not applied because the local PostgreSQL service is unavailable. No Solidity changes or deployment were made; on-chain gating remains disabled.

### Independent application work completed

- `/verify-student` now has responsive local `.eml` upload, challenge instructions, copy controls, expiry countdown, progress/error/retry states, and a pinned-v2 browser flow (`validateEmail` → local prover → `verifyProof` → exact local public-output comparison → minimal proof submission). The raw email stays in the browser.
- `POST /api/student-verification/challenge` issues a CSPRNG 32-byte/43-character nonce, binds it to the authenticated wallet session, request origin, Fuji chain ID 43113, purpose and 10-minute expiry, stores only its SHA-256 hash, rate-limits issuance, and invalidates earlier pending challenges for the session.
- `POST /api/student-verification/verify` accepts proof data and public signals only, checks the current session/challenge/expiry, pins the immutable v2 ID and its actual Noir client/SP1 server metadata, retries Registry access at most three times, verifies a minimal SDK `Proof` with `blueprint.verifyProof(..., { noirWasm })`, decodes Noir signals using the SDK 2.0.11 output layout, requires exact domain/challenge, and atomically consumes the challenge once. The minimal server `Proof` object deliberately omits private circuit input. Artifact 404 currently blocks verification before it can return true. Responses state `studentEligibility: not-established` and `onChainVerified: false`.
- The `StudentEmailChallenge` Prisma model and SQL migration are present. `prisma generate` and `prisma validate` passed; `prisma migrate status` could not connect to local `localhost:5432` and returned `Schema engine error:` with no further detail. No DB migration was applied.
- The public SDK has no documented local artifact-bundle loader. The public Blueprint constructor requires compiled props and a base URL; local proving still requires metadata and proving artifacts. No exact v2 artifact bundle was available locally, so no Registry fallback was attempted.

### Repository checks in this run

- `npm run typecheck` — **PASS** (`tsc --noEmit`, exit 0; includes both zkEmail scripts).
- `npm run test:unit` — **PASS**, 10 passed / 0 failed.
- `scripts/zkemail/check-v2-fixture-regex.ts` — **PASS** for both candidate extractors using SDK `testDecomposedRegex` on the supplied fixture.
- `scripts/zkemail/run-v2-proof.ts` — **BLOCKED at pinned Blueprint retrieval**, 3 bounded attempts, all HTTP 502; validation/proof/verification were not reached.
- `npm run db:generate` — **PASS**; Prisma Client generated for the challenge model. The migration is not applied to any database.
- `npx prisma validate` — **PASS**; Prisma schema is valid.
- `npm run build` — **PASS** (Next.js production build).
- Focused Playwright: public/organizer pages fit 10 viewport widths — **PASS**; ticket page does not request wallet access early — **PASS**; verification page stays disabled without a wallet — **PASS** after correcting a test text assertion.
- Challenge issuance/verification API integration against a live database — **BLOCKED / NOT RUN**; local PostgreSQL at `localhost:5432` is unavailable and migration is unapplied.

## Earlier v1 / candidate-regex investigation (`@zk-email/sdk@2.0.11`)

- Loaded public compiled v1 `PhamPhuongg13/UniPass_Student_Verification@v1`: status compiled, version 1, sender domain `vnu.edu.vn`, verifier metadata chain 84532.
- Fixture measured 7,222 bytes raw; SDK `parseEmail` gave canonical header **689 bytes** and canonical body **295 bytes**. `extractEMLDetails` reported headerLength 689/body max 295/domain `vnu.edu.vn`/selector `google`. These are for the existing message, not the proposed self-addressed challenge email.
- SDK `testDecomposedRegex` independently ran v1 fields. `email_sender`: **FAIL**, reproduces `ParseError(4, TargetNotRepeatable)` then `RuntimeError: unreachable`. `sender_domain`: SDK emitted RuntimeError during the same process after the WASM panic, so its per-field v1 result is not independently reliable.
- Candidate `sender_domain` regex: **PASS** on existing SDK-canonicalized fixture (one match, output length 10).
- Candidate `challenge` regex: **PASS** on synthetic CRLF body and exact 43-character token (one output, length 43). Existing fixture has no challenge, so this says nothing about real signed challenge validation.
- Initial synthetic challenge test failed because the test token exceeded the declared 43-character maximum. Corrected synthetic test passed. This was a test fixture error, not circuit evidence.
- The previous 6,923-byte header was raw-format measurement; SDK canonical header is 689. **No reason to raise v2's header limit above 1152 is established yet.**

## Status

| Gate | Result | Evidence / next action |
|---|---|---|
| v1 Registry load | PASS | SDK metadata load |
| v1 `email_sender` regex | FAIL | SDK panic reproducible |
| Proposed `sender_domain` regex | PASS (regex only) | SDK compiler on existing canonical header |
| Proposed challenge regex | PASS (synthetic only) | SDK compiler on synthetic CRLF/43-character token |
| Header/body size for supplied challenge fixture | PASS (measurement) | New fixture SDK canonical sizes 693/363; prior v2 limits were 1152/1024, though exact metadata could not be fetched in this run |
| Registry 1152 limit acceptance for supplied challenge mail | BLOCKED | Fixture measures 693/363 bytes; Registry metadata endpoint returned 502 during this run |
| Header case/spoof/fold/multiple From negatives | NOT TESTED | See matrix in `BLUEPRINT_V2_CHANGES.md` |
| DKIM circuit verification / body coverage | BLOCKED | Correct challenge fixture parses and exposes signature/key fields, but no proof was generated |
| Real proof generation / verification at that time | NOT RUN | Historical result before v2/fixture update; pinned v2 attempt is documented above |
| Registry v2 compiled at that time | BLOCKED | Historical result; v2 is now loaded and compiled as documented above |
| Direct Fuji proof verification | NOT IMPLEMENTED | Blueprint verifier is Base Sepolia 84532; no Fuji verifier/contract gate |

## Immediate next action

Retry `scripts/zkemail/run-v2-proof.ts` against the same fixture when the Registry endpoint is available. Do not treat SDK parsing or regex compilation as a real proof PASS.

## Trust limitations

A valid proof of a DKIM-authenticated self-addressed challenge plus server-side nonce-to-session mapping would show that the circuit accepted a signed message and the app matched its nonce to a wallet session. It does not cryptographically prove personal mailbox ownership or direct chain eligibility. Uploaded `.eml` is transferable. Domain `vnu.edu.vn` does not distinguish students from staff, alumni or aliases. No email contents, private address, proof or raw nonce are recorded in this report; `.eml` remains ignored by Git.

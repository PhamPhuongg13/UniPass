# UniPass Blueprint v2 — Registry configuration and tested limits

**Status: proposed; not created or compiled in Registry.** The configuration below uses the exact fields exposed by `@zk-email/sdk@2.0.11` and tested decomposed regexes. Registry-level limits and a real challenge `.eml` still require compilation and testing.

## Results that are actually measured

- Loaded v1 `PhamPhuongg13/UniPass_Student_Verification@v1` from the Registry SDK: compiled, version 1; `senderDomain=vnu.edu.vn`; header limit 1152; outputs `email_sender` (hashed) and `sender_domain`.
- Fixture is 7,222 bytes. SDK `parseEmail` canonicalizes its header to **689 bytes** and body to **295 bytes**. SDK `extractEMLDetails` reports `headerLength=689`, `emailBodyMaxLength=295`, selector `google`, sender domain `vnu.edu.vn`. Therefore the sample does **not** establish that an 8192-byte header is needed. Keep v2 at 1152 initially; raise only if the actual self-addressed challenge email's SDK measurement exceeds 1152.
- SDK `testDecomposedRegex` on the v1 fields: `email_sender` reproduces `TargetNotRepeatable` / `RuntimeError: unreachable`. Do not attribute parser position 4 to a particular decomposed part; the SDK gives no reliable source mapping.
- Proposed `sender_domain` regex below compiles and matches the existing fixture (one output, 10 characters).
- Proposed challenge regex below compiles against a synthetic CRLF body with an exact 43-character token (one output, 43 characters). Existing fixture contains no challenge, so this is **not** a real-email test.
- No proof has been generated or verified. Regex tests do not verify DKIM, sender control or circuit-level properties.

## Registry step-by-step

1. In Registry open `PhamPhuongg13/UniPass_Student_Verification`, create a **new version**; do not overwrite v1.
2. Set title `UniPass Student Mailbox Challenge`; circuit name `UniPass_Student_Verification`; version 2; sender domain `vnu.edu.vn`; email query `from:vnu.edu.vn` (discovery hint only, not a cryptographic constraint); `ignoreBodyHashCheck=false`.
3. Set `emailHeaderMaxLength=1152` for the first draft. SDK-canonicalized sample header is 689 bytes. After the new self-addressed challenge email is received, measure it with SDK `extractEMLDetails`; if its canonical header exceeds 1152, increase to the smallest Registry/compiler-supported value that fits. Registry support for 8192/16384 has **not** been tested.
4. Measure actual challenge body using `extractEMLDetails`. The sample body is 295 bytes; set body limit to measured challenge-email size plus modest margin, subject to Registry compiler limits. Do not select an arbitrary large limit.
5. Remove v1 `email_sender` extraction. It is not needed for the minimal challenge proof, avoids the compiler panic and avoids a public/linkable email hash.
6. Add the two fields exactly as below. Use field names `sender_domain` and `challenge`; set locations and max lengths shown. Do not add unsupported custom constraints or external inputs.
7. Run each field in Registry's decomposed regex tester. Compile the v2 circuit. Inspect generated public signals and verifier chain before publishing. If compiler does not accept these parts or output lengths, stop and revise; do not infer success from visual inspection.
8. Keep verifier target off-chain/unspecified for this draft if the editor permits. v1's verifier chain is Base Sepolia 84532, not Fuji. Do not use it as UniPass/Fuji verification.

## Exact field definitions

### Field A — sender_domain

- `name`: `sender_domain`
- `location`: `header`
- `maxLength`: `32`
- `isHashed`: `false`
- parts, in order:

| `isPublic` | `regexDef` |
|---:|---|
| `false` | `(\\r\\n|^)from:[^\\r\\n]*@` |
| `true` | `vnu[.]edu[.]vn` |
| `false` | `[>\\r\\n]` |

The SDK canonicalizes the fixture's header and this exact field passed `testDecomposedRegex`. This proves only that the regex finds the string in the supplied parsed header. It does not enforce a unique `From` header, independently prove DKIM `d=` alignment, or defend against all display-name/header spoofing. SDK DKIM parsing may authenticate the canonical header/body, but the circuit/verification path must be checked to ensure the revealed field comes from the DKIM-authenticated header and the DKIM signing domain is exposed/constrained. Do not claim alignment from the Registry `senderDomain` setting alone.

### Field B — challenge

- `name`: `challenge`
- `location`: `body`
- `maxLength`: `43`
- `isHashed`: `false`
- parts, in order:

| `isPublic` | `regexDef` |
|---:|---|
| `false` | `(\\r\\n|^)UNIPASS-CHALLENGE:` |
| `true` | `[A-Za-z0-9_-]+` |
| `false` | `\\r\\n` |

This compiles with the SDK against synthetic CRLF body data with a 43-character value. It is not yet tested with an actual challenge email. SDK `maxLength` is an upper bound, not a fixed-length guarantee. The verifier must compare the single extracted public output exactly to the expected 43-character nonce. Reject if the circuit/SDK permits ambiguous multiple matches or does not authenticate the extracted body under the valid DKIM signature. A JavaScript comparison cannot turn an unconstrained extraction into a cryptographic claim.

## Self-addressed mailbox-control UX (MVP)

1. User connects MetaMask; server creates a CSPRNG 32-byte nonce, binds its hash to wallet, app origin, chain 43113, purpose and a 10-minute expiry; persist single-use state.
2. Show exact subject/body for the user to send **from their VNU mailbox to the same VNU address**. The message body line must be `UNIPASS-CHALLENGE:<nonce>` and be signed by DKIM. Do not put nonce only in subject/header.
3. User opens the received message and downloads the **original** `.eml`, then uploads it locally.
4. Local SDK validates DKIM/email, loads compiled v2, generates a local proof, calls `verifyProof`, and compares its authenticated challenge output to the server's pending nonce. Raw email/witness stay in browser; proof is submitted to UniPass backend only if server-side verification is needed and user has been told what is sent.
5. Server verifies proof independently, binds nonce to its authenticated wallet session/origin/chain/expiry, and atomically consumes nonce. Return a short-lived **off-chain challenge verification** result, never a permanent client-set student flag.

The proof does not directly bind to the wallet unless wallet is itself an authenticated circuit input/public signal. MVP wallet binding is the backend's nonce-to-session mapping plus proof verification, not an on-chain property. Possession of a portable `.eml` alone is transferable. A self-addressed, fresh challenge sent from a VNU mailbox is evidence that a message with that nonce was DKIM-signed by an aligned VNU domain; an uploader could still receive a forwarded file. Strong mailbox-control assurance requires a trusted delivery/response channel or another authenticated interaction. Domain membership also does not distinguish students from staff, alumni or aliases.

## Negative cases / current status

| Case | Result |
|---|---|
| SDK-canonicalized lowercase `From` fixture | Proposed domain extractor PASS |
| Uppercase `From` name / mixed-case domain | NOT TESTED; parser normalization must be verified against challenge fixture |
| Display name containing fake address | NOT TESTED; regex can match last `@` on same line; require canonical sender format or reject in parser, and inspect compiler match uniqueness |
| Multiple `From` headers | NOT TESTED; regex selects a match, does not prove header uniqueness. Reject before proof and ensure DKIM covers canonical header; circuit-only uniqueness not shown |
| Folded `From` | NOT TESTED; test SDK canonicalized header. Current regex may not model all legal folds |
| Non-VNU domain | NOT TESTED with synthetic header; regex should fail to match but must execute SDK test |
| Challenge exactly 43 chars / CRLF | Synthetic compiler PASS |
| Challenge too long | Not independently recorded; field max 43 should reject over-limit outputs; run SDK test |
| Challenge missing | Existing sample has no challenge; current run's body extractor result was not treated as negative test evidence |
| Multiple challenge lines | NOT TESTED; SDK uses first match per docs; parser must reject duplicates |

Only the rows with PASS are established by SDK test execution. Registry compilation and real signed challenge email are required to finalize.

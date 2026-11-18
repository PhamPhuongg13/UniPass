# Security review

This is a source-level MVP review, not a formal penetration test, contract audit or production sign-off.

| Severity | Finding | State / action |
| --- | --- | --- |
| **P1 — student eligibility claim** | The deployed EventManager registers a wallet without zkEmail or student-status proof. | **Open by design boundary.** Keep student verification claims disabled. Owner must deploy reviewed proof verification bound to VNU domain, wallet, event and nullifier. |
| **P1 — production deployment** | No production hosting/secrets/managed database/monitoring config was present. | **Open.** Do not treat a local Fuji MVP as a public production release. |
| **P2 — rate limiting** | Challenge endpoint limits requests per wallet, but there is no shared IP/distributed limiter for auth or event mutation endpoints. | **Open.** Add distributed throttling, abuse monitoring and cleanup for expired nonce/session rows. |
| **P2 — indexer completeness** | Ticket history scans only 200,000 recent blocks and has no durable cursor/reorg repair. | **Open.** Add paginated event indexing and reconciliation before relying on mirror counts. |
| **P2 — check-in operations** | Manual token ID entry is available; QR scanner and staff roles are not. | **Open.** Keep organizer-only scope; add independently authenticated staff policy before venue use. |
| **P2 — upload and data privacy** | Event cover is a URL; no managed upload validation/storage or privacy retention policy. | **Open.** Restrict safe media sources, define retention and provide deletion/consent details. |
| **P2 — dependency advisories** | A previous npm audit snapshot reported 25 advisories; the fresh audit endpoint could not be reached. | **Unverified.** Re-run `npm audit` on a networked CI, inspect transitive zkEmail/snarkjs paths, apply reviewed non-breaking fixes. No `--force` upgrade was applied. |
| **P3 — email proof UX** | Verification page describes intended local processing but has no usable proof path. | **Clearly labeled pending.** Avoid implying an email is verified. |

## Controls observed

- Session messages bind origin and Fuji chain; nonce is random, short-lived and consumed transactionally.
- Session values are stored as hashes; browser cookie is HTTP-only and same-site.
- Mutating event endpoints compare request origin to configured app origin.
- Event ownership is checked against authenticated wallet for update/delete/check-in.
- Event detail and GET API now prevent non-owner access to `UNLISTED` metadata.
- Chain receipts and expected logs are verified before mirrors are written.
- `.env`, `.eml`, proving artifacts and build output are ignored by Git.

## Remaining design concerns

- Session lookup failure is returned as `wallet: null`, which can obscure a database outage as a logged-out UI. Consider returning 503 and showing a service error state.
- Auth challenge nonce records need scheduled expiration cleanup; per-wallet request cap can be bypassed with many wallets.
- Cookie/session expiration cleanup and secure production proxy settings should be checked on target host.
- No independent test covers CSRF/origin edge cases, cookie flags, transaction replay/reorg, malicious event content or a deployed verifier.

## Release decision

**Not approved for production or verified-student claims.** Suitable only as a clearly labeled Fuji testnet ticket MVP while owner-side student proof enforcement and operational controls remain open.

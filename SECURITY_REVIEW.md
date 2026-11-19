# Security review

Updated: 2026-11-19

## Final V2 authorization review (2026-11-19)

Separate `UniPassEventManagerV2` source was added; no deployed contract was changed. EIP-712 checks issuer signature and explicitly checks wallet, event, `block.chainid`, contract address, purpose, expiry and max 10-minute lifetime. Nonces are one-use/revocable, wallet/event duplicate registration is prevented, capacity and deadlines are checked, mint failure reverts the state update, and issuer rotation/zero-address pause are supported. V2 ticket transfers are blocked. Event staff is scoped by event and can be changed only by that event's organizer. Local EVM negative tests passed for the cases listed in `QA_REPORT.md`.

The backend issuer verifies DB eligibility for the pinned Blueprint ID and `vnu.edu.vn`, wallet session, V2 event/organizer/issuer state on Fuji, and has a fail-closed feature flag. It is **not enabled**; no approved StudentEligibility record can currently be created. EIP-712 only attests that the configured issuer approved a registration; it is not a zkEmail verifier. Do not enable it before real proof and eligibility controls are accepted.

## Remaining critical findings

- Deployed V1 `registerEvent(uint256)` remains permissionless with respect to student eligibility. Frontend disablement is not contract security. Do not use it for student-only events. The V2 source has not been deployed.
- Blueprint v2 compiled Noir circuit JSON for ID `73537fac-12da-4aa8-9338-2858780e0caf` remains HTTP 404. No real proof or outputs were verified. University email domain is not equivalent to current student status; transferable .eml files also need challenge proof over signed body and a fresh wallet-bound nonce.
- V2 deployment, live issuer key match, Fuji registration/mint receipts, actual ticket ownership and live organizer/staff QR check-in remain untested. No funded transaction, address update or deployment occurred.
- The existing two-minute QR is a bearer credential and can be relayed during its lifetime; it does not by itself prove the attendee's identity. Backend one-use checks reduce replay; stronger possession can use wallet challenge/signature at admission.
- Per-wallet authorization count has database-level rate limits but requires production distributed abuse controls. Expired credential/audit retention policy is also outstanding.
- Build emits `WARNING: Missing strong random number source` from transitive ethers v5 `@ethersproject/random` during static rendering when Web Crypto is absent. It throws if used and has no weak fallback; current sensitive challenge/QR generation uses Node crypto. Warning remains unsuppressed.
- `npm audit` reports 25 advisories (15 low, 10 high, no moderate/critical). Safe non-force fixes were applied. High issues include pinned zkEmail packages/old snarkjs path and the Prisma 6 line; resolving requires dependency/vendor review or a major upgrade, which was not forced.

## Resolved or reduced

- Student registration is disabled in UniPass while the deployed contract lacks proof enforcement.
- Ticket QR credentials use 32 bytes from Node `crypto.randomBytes`; only a SHA-256 hash is persisted. Credentials are event/token/owner/session bound, expire in two minutes and are consumed once in an atomic database transaction.
- QR issuance checks authenticated wallet session and current Fuji NFT ownership; check-in preparation rechecks ownership, event and chain state. Final API checks organizer session and ownership, successful Fuji transaction receipt, target, sender, event log and ticket/event binding.
- Event chain transaction hashes are persisted before receipt wait so refresh/retry can reconcile the same transaction.
- Organizer authorization is checked on server routes. No private key or raw student email is introduced by these changes.

## Unresolved risks and boundaries

- **P0:** Current EventManager permits direct registration without zkEmail eligibility. Disabled UI is not an on-chain control. Do not claim student-only registration.
- **P0:** Exact pinned v2 Noir artifact is missing; no real proof or verified output exists. Blueprint domain output does not establish mailbox control unless challenge extraction is actually enforced by the circuit and verified.
- **P1:** QR is a bearer credential. A recipient can forward/screenshot it within two minutes. One-use state and live owner checks reduce replay, but do not prove that the person presenting it is the ticket owner. A staffed visual/identity policy or ticket-owner wallet signature challenge is needed for stronger possession control.
- **P1:** No staff role model; the current flow is organizer-only. Deployed `checkInStudent` permissions must be confirmed before live use.
- **P1:** No distributed/IP rate limiting for issuance APIs; current per-wallet limits depend on database state and need abuse testing.
- **P2:** Expired credentials are retained; add retention cleanup/TTL policy after retention requirements are decided.
- **Operational:** `npm audit` could not contact the registry; dependency vulnerability status is unknown.

No Solidity was modified, no deployment was performed, no private key was accessed, and no Fuji transaction was sent.

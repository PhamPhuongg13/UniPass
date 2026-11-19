# Remix handoff — zkEmail on Avalanche Fuji

## Phase 2 proof and verifier update (2026-11-19)

Latest SDK run against the pinned v2 loaded its compiled metadata and passed `validateEmail`, but failed at `Blueprint.getNoirCircuit()`: Conductor returned an artifact link and the linked Noir circuit JSON object returned HTTP 404. No proof, verification key/circuit hash, actual public signals, generated verifier ABI, or proof test vector was produced. Direct Fuji verification is therefore **BLOCKED**; do not deploy a guessed verifier or use Registry's Base Sepolia metadata as Fuji compatibility evidence.

The SDK metadata exposes only public `sender_domain` and `challenge` extractors. Their local decomposed-regex checks do not establish the compiled circuit's exact DKIM header selection. In particular, the extractor test returned a VNU match for a synthetic multiple-From header and for a line containing an external address in display text before a VNU address. These synthetic results are a warning about ambiguous extraction, not a cryptographic exploit demonstration; resolve against the exact restored circuit with adversarial signed fixtures and decoded verified outputs before integration. `validateEmail` rejected a modified signed body with a DKIM body-hash mismatch, but this is SDK validation, not proof verification.

Current v2 public outputs do not include wallet, event, chain, expiry, purpose, or nullifier. Exact server-side nonce matching can compare a decoded 43-character output to a fresh nonce only after proof verification, but cannot turn the proof into a circuit-level wallet binding. The self-sent `.eml` is transferable; possession of it does not establish that the connected wallet owner personally controls the university mailbox. A VNU domain also does not establish enrolled-student status.

**Next Registry/operator action:** restore the v2 Noir JSON at `https://storage.googleapis.com/zkemail_blueprints/73537fac-12da-4aa8-9338-2858780e0caf/noirCircuitJson.json` (or repair that artifact pointer without changing the pinned Blueprint). Then generate and verify a real proof, inspect decoded public signals and run adversarial signed-email cases. Until those results exist, keep the server eligibility gate and student-gated registration disabled. Do not change Solidity or deploy based on this handoff.

## Final V2 contract-source update (2026-11-19)

This earlier handoff describes the deployed V1 interfaces and proof-verifier gap. Separate candidate contracts now exist at `contracts/UniPassEventManagerV2.sol` and `contracts/UniPassTicketV2.sol`; they implement issuer EIP-712 registration authorization and event-scoped staff, and compile/local-EVM test successfully. They are not deployed and do not verify zkEmail on chain. Existing deployed V1 remains directly registrable. Follow [`docs/REMIX_INTEGRATION_HANDOFF.md`](../REMIX_INTEGRATION_HANDOFF.md) for V2 Remix order. No V2 address/hash is available.

**No Solidity change or deployment was made.** Existing `registerEvent(uint256 eventId)` does not verify zkEmail. Registry v1 verifier metadata targets Base Sepolia (84532), not Fuji (43113). Registry `verifyProofOnChain` is not verification by UniPass EventManager.

## Current deployment and verification evidence (2026-11-19)

The application ABI currently uses `UniPassEventManager.registerEvent(uint256 eventId)`, `getEvent(uint256)`, `registered(uint256,address)`, `canRegister(uint256)`, and Ticket methods `ownerOf(uint256)`, `eventOfTicket(uint256)`, `checkedIn(uint256)`, and `checkInStudent(uint256)`. The register function has no proof/attestation parameter and the current contract cannot enforce student status.

Pinned Blueprint v2 metadata currently reports client Noir (framework enum 3) and server SP1 (enum 2). `validateEmail` succeeds on the supplied signed challenge email, but local proof generation is currently blocked before witness generation: the compiled circuit JSON object at `gs://zkemail_blueprints/73537fac-12da-4aa8-9338-2858780e0caf/noirCircuitJson.json` is missing (its HTTPS object URL returns 404). No proof has passed cryptographic verification, and no public-output layout should be used in Solidity until the actual artifact/proof has been recovered and independently checked.

## Exact candidate Solidity interfaces (design only; not deployed)

### Direct proof verification — blocked by current v2 outputs

Once a future reviewed circuit exposes the needed public values and the Registry provides a Fuji-compatible generated verifier, use the generated verifier's exact ABI rather than guessing it. The application-facing method should be equivalent to:

```solidity
function registerEventWithEmailProof(
    uint256 eventId,
    bytes calldata proof,
    uint256[] calldata publicSignals
) external;
```

The contract must verify the generated proof in the same transaction, check `msg.sender` equals the wallet signal, require the chain and event/purpose scope to match, check expiry, enforce an unused challenge/nullifier, and then perform registration/mint atomically. A verifier returning false or reverting must revert the whole registration. Derive the verifier interface, signal order, proof encoding, and public input count from the exact generated v2+ artifacts and test vectors; they cannot be specified truthfully from the currently missing artifact.

This cannot be implemented securely with current v2: known public outputs are only `sender_domain` and `challenge`; they do not bind `msg.sender`, event ID, chain, purpose, expiry, or a replay-resistant identity nullifier. A circuit-level body challenge alone is not proof of an on-chain wallet.

### Backend-signed EIP-712 attestation — viable contract-side alternative

If keeping the currently pinned proof circuit, the MVP alternative is a UniPass backend that verifies a real proof and signs a short-lived attestation. A proposed typed payload is:

```solidity
struct StudentAttestation {
    address wallet;
    uint256 eventId;
    uint256 chainId;
    bytes32 purpose;
    uint64 expiresAt;
    bytes32 nullifier;
    uint64 signerEpoch;
}

function registerEventWithAttestation(
    uint256 eventId,
    uint64 expiresAt,
    bytes32 nullifier,
    uint64 signerEpoch,
    bytes calldata signature
) external;
```

The EIP-712 domain must include `chainId` and the EventManager verifying contract. The contract must require payload wallet = `msg.sender`, payload event ID = argument, chain ID = `block.chainid`, purpose = the fixed registration purpose, `expiresAt > block.timestamp` and within a short maximum lifetime, current authorized signer epoch, valid ECDSA/EIP-1271 signer policy, and an unused nullifier. Mark the nullifier consumed before external mint/registration calls in the same transaction; revert atomically on any later failure. Provide signer rotation/revocation, and choose whether the nullifier is globally unique per identity or scoped per event. The backend signer is a trust assumption; this does not make the email-to-wallet binding a circuit guarantee.

## Remix deployment order and tests

1. Do not deploy a verifier from the current incomplete artifact. Obtain a reproducible compiled artifact, generated verifier source/ABI, public signal schema, VK/circuit hashes, and valid proof vector from Registry first.
2. For direct verification, deploy the exact generated verifier to Fuji (43113), compare its bytecode/key hash with the reviewed artifact, then deploy the updated EventManager configured with that verifier and existing Ticket contract.
3. For the attestation approach, deploy the updated EventManager with the backend signer address/epoch and existing Ticket contract. Confirm chain ID 43113 and the EIP-712 domain separator in Remix.
4. Test valid registration; wrong wallet, event, chain, purpose, signer, expiry, or signer epoch; malformed/invalid proof or signature; reused challenge/nullifier; verifier revert; duplicate registration; sold-out/cancelled event; and Ticket mint failure. Assert failed cases leave both registration and replay mappings unchanged.
5. Only after successful Fuji tests, update `NEXT_PUBLIC_EVENT_MANAGER_ADDRESS`, `NEXT_PUBLIC_TICKET_ADDRESS`, and the matching frontend ABI/address. Keep the student gate disabled until those deployed contracts enforce it.

Current regression verified authenticated off-chain challenge/session, event metadata persistence, EIP-712 authorization encoding and candidate contract behavior in a local VM. No MetaMask-triggered contract write or live registration/check-in was performed. QR scanning exists in the app; real Fuji use remains unverified. Candidate V2 staff roles exist in source and UI, but require a deployed/mapped V2 event.

## Two distinct integration models

### A. Off-chain wallet-bound challenge attestation (MVP candidate)

1. Backend creates 32-byte CSPRNG nonce and stores only its hash with authenticated wallet session, origin, chain ID 43113, purpose, expiry and unused state.
2. Student sends a message from VNU mailbox to itself, receives original DKIM-signed `.eml`, and proves locally that authenticated body contains nonce and From/domain match v2.
3. Backend verifies the proof itself, checks public challenge equals outstanding nonce, current session wallet/origin/chain match record, expiry is valid, then atomically marks nonce consumed. Issue short-lived server attestation.
4. Existing registration remains wallet-only. The attestation is not enforced by chain and cannot stop a caller bypassing the app.

This model binds proof to wallet through backend state/session, not a circuit signal. A self-addressed message with a valid VNU DKIM signature does not cryptographically establish that the uploader personally controls the mailbox; `.eml` is transferable and VNU may issue addresses to non-students. Rate-limit challenges, use short expiry, consume once, bind to origin/session and disclose this limitation.

### B. Direct Fuji verifier integration (future, stronger bypass resistance)

Owner must deploy a verifier compatible with the exact v2 circuit on chain 43113 and update EventManager so `registerEvent` verifies proof/signals in the same transaction. Circuit/public signals must bind at least nonce, wallet, chain/event scope and a replay-resistant nullifier; contract checks nonce expiry/consumption and `msg.sender` itself. Neither v1 Registry verifier nor server attestation provides this.

## Required owner artifacts before contract work

- Compiled v2 immutable ID, proof system, verifier source/ABI/address/VK hash on Fuji, public signal order/types, exact proof encoding and reproducible test vectors.
- Confirm verifier bytecode and circuit hash correspond to Registry v2. Do not reuse Base Sepolia verifier metadata.
- Specify whether duplicate policy is one mailbox per event or global. Derive nullifier inside the circuit/verifier with domain separation; never accept user-chosen nullifier or expose raw email/unkeyed address hash.
- Confirm student eligibility criterion. DKIM `d=vnu.edu.vn` and a VNU sender domain cannot distinguish enrolled students from staff, alumni or aliases. Need authoritative policy/credential or roster-backed issuance.
- Gas estimate and test valid proof, wrong wallet/event/chain, expired/replayed nonce, duplicate registration, malformed/tampered proof and verifier failure.

Registry action: owner creates and compiles v2 first. No student-gated UI/registration claim until a Fuji contract consumes the proof and enforces the policy. Do not modify deployed contracts through the frontend.

## Current v2 application plumbing (not on-chain verification)

The app now issues a 32-byte random challenge tied server-side to the authenticated wallet session, `APP_ORIGIN`, Fuji chain ID 43113, purpose, and a 10-minute expiration. The database stores only the SHA-256 nonce hash. Issuing a newer challenge invalidates older outstanding challenges for that session. Failed proof checks do not consume the nonce; successful backend verification consumes it atomically once.

The browser reads `.eml` locally, validates and proves with the pinned v2 slug, verifies the proof locally, and submits only proof bytes/public signals to `/api/student-verification/verify`. The server pins the same Blueprint and is configured to reconstruct a minimal SDK `Proof` for the Noir client verifier, initialize the official Noir runtime, verify cryptographically, and decode the Noir public output layout before matching `sender_domain` and `challenge`. This path remains blocked because the compiled circuit JSON link resolves to HTTP 404. No successful backend proof verification exists. Any eventual backend success is explicitly **not** student eligibility and is not enforced by the existing EventManager.

## Remix work required before any on-chain student gate

1. Confirm the deployed v2 proof system, verifier source, verification key, exact public signal order/types, compiled circuit hash, and a valid proof test vector. Do not infer these from the Registry UI's formatted output.
2. Deploy the matching verifier to Fuji (43113) and verify its bytecode/key hash against the pinned v2 artifact. Implement the exact generated interface; the verifier ABI is circuit/framework-specific and cannot be safely guessed here.
3. For direct proof verification, v2 must expose public signals binding the fresh challenge, wallet, chain ID, event/purpose scope, expiration, and a replay-resistant nullifier. Current v2 outputs only `sender_domain` and `challenge`, so it cannot directly bind `msg.sender`, event scope, or nullifier.
4. Update EventManager registration to require `msg.sender` equal the wallet signal, chain/event/purpose/expiry match, verifier returns true, and nullifier is atomically unused before mint/registration. Add a consumed-challenge/nullifier mapping and a policy for one identity across all events versus one event.
5. If circuit v2 cannot be changed, use an EIP-712 backend attestation containing wallet, event ID, chain ID, purpose, expiry, and one-time nullifier. EventManager must recover an authorized UniPass signer, require signer rotation/revocation controls, compare `msg.sender`, enforce expiry and consume the nullifier atomically. This is backend trust, not a zkEmail verifier.
6. Deploy verifier before the updated EventManager; then deploy/configure signer or verifier address, and only afterward update the frontend ABI/address and enable registration UI. Test wrong wallet, wrong event/chain/purpose, expired attestation, replay, invalid proof, duplicate identity, and verifier revert in Remix.

**Current blocker:** no real v2 proof has passed verification. The pinned Blueprint load endpoint returned HTTP 502. No Solidity changes or deployment are requested or performed by this integration work.

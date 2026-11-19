# Security and privacy review

## Findings

- **P0 blocker — eligibility:** supplied EventManager ABI has no proof argument or verifier. Wallet registration is not restricted to VNU students. Verification page is not cryptographic verification.
- **P0 blocker — mailbox control:** an uploaded signed email alone cannot show its uploader controls the sender. No production proof, fresh challenge binding, expiry or replay defense was verified.
- **High — index trust:** wrong Ticket address/start block omits history. Worker checks chain bytecode and refuses to guess start block; operator must verify facts.
- **Medium — stale mirror:** index can lag. UI says only direct chain reads verify current ownership; cached items remain marked unverified during RPC failure.
- **Medium — QR/staff:** QR scan and staff roles are absent. Token-ID check-in is not proof of physical presence; QR replay controls do not exist.

Ticket API binds to session wallet and rejects a different requested wallet. No private key is requested/stored. Notification utility has a fixed status allowlist and reads topic at runtime; no topic value is stored in this repository. No production penetration test, live session replay suite, proof attack testing or wallet-signed Fuji write test was run.

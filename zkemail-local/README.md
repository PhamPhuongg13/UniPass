# zkEmail local setup

This directory is reserved for isolated circuit experiments. Do not place a real VNU `.eml`, witness, proof, private key or generated proving key in source control. `.gitignore` excludes `.eml`, `.wtns`, `.zkey` and the local artifacts/proofs folders.

## Status (19 November 2026)

- Installed project dependencies from the official zkEmail Verifier setup: `@zk-email/helpers` 6.4.2, `@zk-email/circuits` 6.3.4 and `snarkjs` 0.7.6. They are recorded in `package.json`/`package-lock.json`; nothing was installed globally.
- Node is `v24.18.0`; npm is `11.16.0`.
- `rustc`, `cargo` and native `circom` are not on PATH. No circuit compilation or proof attempt has been made.
- npm reported 25 dependency advisories after installation (12 low, 3 moderate, 10 high). Review before production; no automatic audit fix was run.

## What remains before proof generation

1. Circuit policy: owner confirmed `@vnu.edu.vn` as the initial allowed domain. Keep this constrained inside the circuit; do not trust a client-side string check.
2. Add a custom circuit which validates DKIM and the signed `From` field, constrains the allowed domain, and binds event ID, wallet and a circuit-constrained nullifier. Keep email and identity private.
3. Compile the circuit and generate a trusted setup/verifying key. The official zkEmail guide requires Rust/Circom for compilation and describes generating inputs from the raw signed `.eml`; proof generation can be resource-intensive.
4. Deploy the corresponding verifier and have the owner update their Solidity registration flow to verify the proof and consume the nullifier. The currently supplied EventManager ABI has no verifier/proof argument, so it cannot enforce zkEmail. The app must not label registrations student-verified until this exists.
5. Build browser-local `.eml` input/proof generation, validate a synthetic fixture, then a real test mailbox proof. Never upload a student's raw `.eml` to the app server. Do not place raw mail, witnesses, proofs, private keys or zkeys in the repository.

The owner confirmed `@vnu.edu.vn` as the initial allowed domain. This is recorded as `NEXT_PUBLIC_STUDENT_EMAIL_DOMAIN=vnu.edu.vn` for configuration/documentation only; a public environment value is not a security check. The intended input is an original DKIM-signed `.eml` from an eligible VNU mailbox. Current contract registration only checks event state/capacity and mints a non-transferable ticket; it does not check student proof.

Official references: [zkEmail package setup](https://docs.zk.email/zk-email-verifier/setup), [zkEmail usage guide](https://docs.zk.email/zk-email-verifier/usage-guide), [Circom installation](https://docs.circom.io/getting-started/installation/).

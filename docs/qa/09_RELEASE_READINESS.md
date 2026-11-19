# Release readiness

## Verdict: NO-GO for student-gated production; CONDITIONAL GO for controlled UI demo

Build, typecheck and unit regressions pass. The ticket UI no longer issues large historical log queries. No Solidity write was sent.

Before demo with real tickets: get DB online and apply migration; verify deployed ABI/address and deployment block; index and test checkpoint recovery; complete E2E; do read-only Fuji smoke and wallet-signed tests with disposable account. Before production: student eligibility is not enforced by supplied contracts; zkEmail proof and sender mailbox control are absent; QR scan/staff roles are absent. Do not describe UniPass as student-verified or QR-enabled.

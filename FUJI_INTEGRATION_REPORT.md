# Avalanche Fuji integration report

Updated: 2026-11-19

## Verified status

- Target: Avalanche Fuji, chain ID `43113`.
- Existing V1 deployment (owner-provided, unchanged): EventManager `0xE68758a23ce897ea9961808f7aCeAc6E60a863e9`; Ticket `0xB2c64E5aF70bAA9DFb66E77e02DDfe8757877631`. The owner supplied `setTicketContract` receipt `0xf25869402b7c13303fbaf7cda922f219c8a6b6de8588a669d9c5a70493f214e8`, block `61293854`. Existing adapters remain in place; no deployed address or ABI was silently switched.
- No transaction was sent to Fuji; therefore there is no new hash, receipt, event ID, mint, or check-in to report. Real MetaMask extension was not tested. Browser wallet tests use a mocked EIP-1193 provider and ephemeral software key.
- PostgreSQL was reachable after restarting the existing Homebrew PostgreSQL 17 service; seven additive migrations are applied. No data reset/deletion occurred.

## V2 source and local tests

Added independent `contracts/UniPassEventManagerV2.sol` and `contracts/UniPassTicketV2.sol`. V2 uses EIP-712 issuer authorizations bound to wallet, event ID, Fuji chain, verifying contract, expiration, nonce and purpose; signature/issuer rotation, pause, nonce revocation/replay prevention, duplicate and capacity checks are enforced by contract. Ticket NFT is non-transferable. Event-scoped staff assignment and check-in are included.

`npm run contracts:compile` compiled with solc 0.8.38. `npm run test:contracts` passed locally in EthereumJS VM, including invalid/wrong-bound authorization, expiry, replay, duplicate, capacity, issuer rotation and staff grant/revoke/check-in. This is local EVM evidence only, not deployment or Fuji verification.

## Blocking deployment and live verification

V2 has no deployed address. V1 continues to permit direct calls to `registerEvent(uint256)` without a student-proof gate; keep student-only events closed. The server issuer feature flag remains `false`, no `StudentEligibility` row exists, and pinned zkEmail v2 artifact is still unavailable. Do not enable eligibility or registration based on EIP-712 alone.

After the owner approves/deploys using Remix: deploy TicketV2 with the new manager address, deploy ManagerV2 with owner/issuer, call `setTicketContract`, verify code/ownership/issuer and event creation, then update the server/client V2 manager address and map metadata to V2 event IDs. Only then test a funded Fuji test wallet. Before any eligibility-gated test, restore and verify the exact pinned zkEmail artifact. Full interfaces and checks are in [`docs/REMIX_INTEGRATION_HANDOFF.md`](docs/REMIX_INTEGRATION_HANDOFF.md).

## Ticket history verification — 2026-11-19

- Read-only contract-creation lookup and Fuji receipt confirmed Ticket deployment transaction `0x9a92c7d9d04bb107aa11e2355d9c7947ade6d89d8bb4c73a9122167054498c3d` at block `61293842` (status 1, deployed address matched). This is distinct from the owner-supplied `setTicketContract` transaction at block `61293854`.
- The public deployment block and tested Fuji RPC are documented in `.env.example` and configured in ignored local `.env`. A full log scan and the standard indexer command both completed with `caughtUp=true` using `https://avalanche-fuji-c-chain-rpc.publicnode.com` after the original public RPC returned HTTP 429 / 1015.
- Two indexed mint logs were reconciled with two database mirrors. Both live `ownerOf` reads matched their indexed recipients. The already user-supplied wallet has `balanceOf=1` and one matching indexed token.
- These are read-only chain verifications. No contract write, registration, mint, staff check-in or QR check-in transaction was sent. Student-only registration remains blocked by the deployed V1 contract and unavailable pinned zkEmail proof path.
- See [`docs/EXECUTION_REPORT.md`](docs/EXECUTION_REPORT.md) for the exact commands and test results.

# UniPass final handoff

Updated: 2026-11-19

## Implementation summary

- Added standalone candidate EventManagerV2/TicketV2 sources. V2 validates issuer EIP-712 authorization bound to wallet/event/chain/contract/expiry/nonce/purpose, rejects replay/duplicates/sold-out and mints non-transferable NFT tickets. Event-scoped staff grants/revokes and single check-in enforcement are included.
- Added an EIP-712 issuer endpoint scaffold that fails closed, verifies DB eligibility and live Fuji manager/event state, enforces per-wallet request limits, and stores an authorization audit record. The endpoint cannot issue now: feature flag false, no approved eligibility row, and no V2 deployment.
- Added V2 organizer staff UI and receipt reconciliation; requires a live V2 event mapping.
- Retained QR ticket pass/scanner/backend check-in flow, short-lived opaque credentials and hash-only storage. Current production/fuji behaviors remain unverified.
- Preserved the existing DB data. Applied additive migration `20261119230000_registration_v2_and_staff`; 7 migrations current.
- Kept pinned zkEmail v2, student registration disabled, and deployed V1 contract/config unchanged.

## Feature matrix

| Flow | Status and evidence |
|---|---|
| Visitor/discovery/responsive UI | Playwright checks 11 routes at 12 widths; no horizontal overflow in test |
| Wallet auth | API/UI tested with ephemeral ECDSA and mocked EIP-1193; real MetaMask not tested |
| Organizer metadata | DB-backed authenticated E2E tested; V1/V2 Fuji event create transaction not tested |
| zkEmail | Blocked: exact v2 artifact 404; no real proof, cryptographic verification or eligibility result |
| Registration | V1 UI closed but deployed V1 direct call remains open. Candidate V2 EIP-712 registration passes local VM tests only; not deployed/wired/active |
| NFT ticket | Candidate V2 mint/ownership locally EVM-tested; no Fuji mint. Existing live owner-read behavior not confirmed in this regression |
| QR check-in | Credential helpers, disconnected page and receipt logic implemented; no real camera/Fuji transaction or check-in tested |
| Staff roles | Candidate V2 contract + UI/receipt mirror; local role/revocation tests pass. Requires deployment and V2 event link |
| Fuji | No transaction sent, no new V2 address/hash/receipt |

Existing owner-supplied V1 Fuji deployments remain configured: EventManager `0xE68758a23ce897ea9961808f7aCeAc6E60a863e9`, Ticket `0xB2c64E5aF70bAA9DFb66E77e02DDfe8757877631`, chain ID `43113`. The owner supplied successful `setTicketContract` transaction `0xf25869402b7c13303fbaf7cda922f219c8a6b6de8588a669d9c5a70493f214e8` (block `61293854`). No transaction was submitted in this continuation.

## Final test results

- `npm run typecheck` — PASS.
- `npm run test:unit` — PASS, 16/16.
- `npm run contracts:compile` — PASS, candidate bytecode compiled with local solc 0.8.38.
- `npm run test:contracts` — PASS, local EthereumJS VM adversarial suite. Not a Fuji result.
- `npx prisma validate` — PASS.
- `npx prisma migrate status` — PASS, 7/7 migrations current; required elevated permission because the sandbox blocks localhost network connections.
- `npm run build` — PASS; emits a legacy ethers v5 missing-browser-crypto warning during static generation.
- `npm run test:e2e` — PASS, 6/6. Includes mocked wallet and DB-backed APIs, not real MetaMask/Fuji.
- `npm audit --json` — 25 advisories: 15 low, 10 high, none moderate/critical. No force/major SDK upgrade was applied.

See [QA_REPORT.md](QA_REPORT.md) for the exact commands and the first failed/repaired screenshot-run details.

## Security and remaining blockers

1. **Critical:** deployed V1 `registerEvent(uint256)` is not eligibility-gated. Do not use it for student-only access. Candidate V2 is not deployed.
2. **Critical/external:** pinned Blueprint `PhamPhuongg13/UniPass_Student_Verification@v2` compiled artifact `73537fac-12da-4aa8-9338-2858780e0caf` returns HTTP 404. No verified proof or public outputs exist.
3. **Eligibility:** VNU domain alone cannot distinguish current students from alumni/staff; proof also needs an authenticated challenge over signed body. Never create StudentEligibility from an unverified result.
4. **Wallet/event/expiry/replay policy:** V2 contract authorization enforces these fields, but the backend issuer must remain disabled until proof verification and eligibility are approved. The current circuit does not directly bind every contract field.
5. **Real QA:** No real MetaMask extension, funded Fuji deployment, registration/mint, QR camera scan, staff check-in or live receipt reconciliation was performed.
6. **Dependency audit:** 10 high advisories remain in pinned zkEmail/transitives, Prisma 6 and tooling paths. Resolution requires reviewed dependency replacement/vendor work or a major upgrade. No force update was applied.

## Owner Remix action

Review [`docs/REMIX_INTEGRATION_HANDOFF.md`](docs/REMIX_INTEGRATION_HANDOFF.md). V2 deployment must be explicitly authorized and funded with Fuji test AVAX. Deploy ManagerV2, deploy TicketV2(manager), call `setTicketContract`, create/link V2 events, and verify role/issuer settings before updating app addresses. Do not activate registration until the exact v2 proof is restored and policy is approved. No Solidity source from the owner's Downloads was modified; candidate V2 sources are separate app additions.

## Start locally

```sh
cp .env.example .env
# Preserve the existing DATABASE_URL and set APP_ORIGIN and public Fuji config.
npm install
npm run db:generate
npm run db:migrate
npm run dev
```

Never commit `.eml` files, private keys, seed phrases, or secret environment values.

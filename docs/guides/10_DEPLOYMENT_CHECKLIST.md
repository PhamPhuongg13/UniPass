# 10 · Deployment and environment checklist

## Required environment

- `APP_ORIGIN`: exact HTTPS app origin; no wildcard/trailing path.
- `SESSION_SECRET`: strong random secret stored in deployment secret manager; rotate without exposing it.
- `DATABASE_URL`: managed PostgreSQL TLS connection, least-privileged app user, backups/restore drill.
- `NEXT_PUBLIC_CHAIN_ID=43113` and a Fuji RPC with a tested quota.
- `NEXT_PUBLIC_EVENT_MANAGER_ADDRESS`, `NEXT_PUBLIC_TICKET_ADDRESS`: verify bytecode, chain ID, contract linkage and ABI against Remix receipts.
- `TICKET_DEPLOYMENT_BLOCK`: exact Ticket creation receipt block, not a later setter transaction.
- `TICKET_INDEXER_CONFIRMATIONS`, `TICKET_INDEXER_REORG_WINDOW`, per-run budget appropriate for provider.
- `STUDENT_REGISTRATION_ISSUER_ENABLED=false` until real zkEmail proof verification and an approved eligibility policy exist.
- Do not configure `UNIPASS_REGISTRATION_ISSUER_PRIVATE_KEY` while disabled. Never prefix private keys with `NEXT_PUBLIC_`.

## Release gates

- Apply additive Prisma migrations and confirm `npx prisma migrate status`; never reset production data.
- Run unit, typecheck, build and Playwright in CI.
- Verify a read-only Fuji `eth_chainId`, contract code and `ticketContract()` linkage.
- Run and monitor the ticket indexer from the verified deployment block; confirm checkpoint and bounded log ranges.
- Confirm student registration stays disabled and the deployed contract's direct registration semantics are understood. Current V1 is not student-gated.
- Do not declare staff check-in live until a deployed/configured V2 contract and complete scanner authorization path are verified.
- Do not declare zkEmail verified until pinned v2 artifact is restored, real proof generation and cryptographic verification pass, public outputs are decoded correctly, and mailbox/student/wallet limitations are approved.
- Run a funded Fuji transaction or real MetaMask acceptance only with explicit owner authorization and a dedicated test wallet.

## Operational checks

- HTTPS and secure cookies in production; origins enforced through trusted proxy configuration.
- Database backups, monitoring, retention and restore test.
- Distributed rate limiting/WAF; current database limits are per wallet and serializable but are not a global IP defense.
- RPC alerting for 429/timeouts; indexer retry and reorg checkpoint monitoring.
- Review dependency advisories from a networked environment; do not run `npm audit fix --force` as a release shortcut.
- Logs must omit `.eml`, email addresses, raw challenge, proof witness, session tokens, database URLs, private keys and mnemonic phrases.

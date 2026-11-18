# Remediation log and follow-up

## Completed in this audit

- Direct event page previously exposed `UNLISTED` events; page now requires public visibility or owner session.
- Public event API default previously allowed metadata to appear before chain creation; POST now defaults `UNLISTED`, and a public visibility change requires a verified linked chain event.
- Ticket detail previously triggered wallet access during page load; user must explicitly request ownership verification.
- EIP-1193 account/chain changes now clear visible wallet session and revoke its server cookie.
- Signer address is re-read after network switch to avoid stale account use.
- Narrow viewport overflows fixed for homepage, event draft form and organizer tabs.
- Read-only chain status resets on event change and destroys provider on unmount; register/check-in API providers are destroyed after use.
- Added repeatable Playwright audit and retained 55 screenshots.
- Added test artifact folders to `.gitignore`.

## Remaining prioritized work

1. **P0 for student verification:** owner supplies a verifier-enabled EventManager and reviewed circuit interface; implement local proof generation for `@vnu.edu.vn`; bind proof to wallet/event/nullifier; test invalid, expired, replayed and wrong-domain proofs. Keep feature unavailable until deployed and verified.
2. **P1 for public launch:** configure production domain, TLS, managed PostgreSQL, secret manager, RPC, backups, monitoring, rate limit and incident process.
3. **P1 for ticket operations:** durable chain indexer with block cursor/finality/reorg replay; paginated history and reconciliation.
4. **P2:** implement staffed check-in/QR only after role model, session policy and anti-replay design are approved.
5. **P2:** event edit/cancel UX, cover upload, retention/privacy controls and user-facing outage distinction.
6. **P2:** install/configure ESLint and CI; rerun online npm advisory audit and remediate by reviewed lockfile updates.
7. **P2:** run real MetaMask/Fuji create/register/check-in acceptance test on disposable event and test failure/retry/metadata mismatch cases.

## Release note

No Solidity, deployment or owner transaction was performed by this remediation. GitHub push is a separate owner-authorized repository action and must occur only after final static/build checks and a clean secret/diff review.

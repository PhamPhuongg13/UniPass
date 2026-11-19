# Visual and interaction QA

Playwright covers 195, 260, 312, 320, 375, 390, 768, 1024, 1280 and 1440 CSS px; existing screenshots include representative 100–200% zoom approximations under `docs/audit/screenshots/`. Final E2E outcome is recorded in `06_TEST_EXECUTION_RESULTS.md`.

## Ticket-list repair

- Before: supplied screenshot shows raw RPC JSON in My Tickets; request spans about 200,000 blocks and the Fuji provider caps each inclusive `eth_getLogs` range at 100.
- Root cause: client `queryFilter` scans historical logs during the user action and renders the provider exception.
- After: ticket IDs come from a DB index; explicit read-only owner/state checks verify current chain state with concurrency 4. No client `queryFilter` exists. Worker uses resumable 90-block batches. Errors are human-readable; cached rows remain visibly unverified.
- The user screenshot contains a wallet address and was not copied into repository files. `screenshots/my-tickets-after-1440.png` shows the post-fix disconnected-wallet state with no raw RPC payload. An authenticated ticket list could not be captured because the database was offline; this image is not evidence of a live indexed ticket.

No full visual sign-off is claimed for blocked browser checks; recheck on a real iPhone and desktop before external release.

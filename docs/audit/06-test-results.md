# Test and validation results

## Browser

Command: `npm run test:e2e`

**Passed: 3 tests.**

1. All 11 routes return HTTP 200 and have no document-level horizontal overflow at 195, 260, 312, 320, 375, 390, 768, 1024, 1280 and 1440px.
2. Opening `/tickets/1` does not call wallet access until explicit user action.
3. Captured 55 full-page screenshots (11 routes × 5 effective viewport sizes) under `docs/audit/screenshots/`.

Playwright dev server is isolated at port 3017. Initial checks found and helped fix overflow in homepage CTA/header, organizer form controls and demo management tabs.

## Static/build checks

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed, including Playwright test TypeScript. |
| `npx prisma validate` | Passed on the current schema/migrations. |
| `npm run build` | Passed after final API provider cleanup; all App Router pages and API routes compiled. |
| Lint | Not configured: ESLint dependency/configuration is absent. |
| `npm audit` | Registry unavailable (`getaddrinfo ENOTFOUND registry.npmjs.org`); no current online advisory result. Prior snapshot: 25 advisories. |

## Earlier integration validation

Before this audit, `npx prisma generate`, migration deploy and a disposable wallet API smoke flow passed; API smoke rows were removed. Read-only RPC checks confirmed Fuji chain ID, contract bytecode and EventManager-to-Ticket link. No real wallet transaction was sent by the app during audit.

## Limits

This browser suite does not authenticate a real wallet or submit chain transactions, does not assert database authorization against a production database, does not scan dependencies offline, and does not prove zkEmail correctness. It does not replace contract/security review.

# Repository inventory

## Stack and layout

- Next.js 15 App Router, React 19, strict TypeScript, CSS design system and Lucide icons.
- PostgreSQL + Prisma 6. Local schema contains organizer profiles, event metadata, registration/ticket mirrors, check-in audit records, auth nonces and sessions.
- Ethers 6 browser/server integration. Fuji chain ID `43113`; supplied EventManager/Ticket addresses are configured via public environment variables.
- `@zk-email/helpers` and circuits packages are installed, but no runnable VNU circuit, verifier, proof flow or fixture is present.
- Owner Solidity files remain outside the repo. The repo contains ABI fragments for only the functions/events used by the UI/API.
- Playwright Chromium is installed as a development dependency for responsive visual audits.

## Pages and states reviewed

`/` (home), `/discover`, `/events/build-night` (sample), `/my-events`, `/tickets/1`, `/verify-student`, `/profile`, `/organizer`, `/organizer/events/new`, `/organizer/events/demo`, `/organizer/events/demo/check-in`.

The catch-all route also handles persisted event IDs/slugs, organizer event management and check-in links, plus unknown routes. Protected organizer flows require the wallet session. Sample pages clearly label demo information.

## API surface reviewed

- `POST /api/auth/challenge`, `POST /api/auth/verify`, `GET|DELETE /api/auth/session`
- `GET|POST /api/events`
- `GET|PATCH|DELETE /api/events/:id`
- `POST /api/events/:id/register`
- `POST /api/events/:id/check-in`

## Core flow and authority

The contract is authoritative for event creation, registration, ticket ownership and check-in. PostgreSQL stores organizer-facing metadata and verified transaction mirrors. Ticket discovery scans a bounded recent block range; it is not a durable chain indexer.

## Environment and deployment

`.env` is ignored; `.env.example` contains only placeholders. No production host, CI workflow, deployment manifest or managed database configuration was found. `README.md` and `docs/DATABASE_SETUP.md` describe local setup. Do not commit secrets, private keys, `.eml` files or proof artifacts.

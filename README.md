# UniPass

Student-focused event discovery and organizer tools, built with Next.js App Router, TypeScript, PostgreSQL/Prisma, ethers v6 and a Vietnamese-first neo-brutalist design.

## Local development

```sh
npm install
cp .env.example .env
# Set DATABASE_URL, SESSION_SECRET and APP_ORIGIN in .env
npm run db:generate
npm run db:migrate
npm run dev
```

The organizer API requires PostgreSQL and an origin-bound wallet signature. Event metadata is separate from on-chain event creation. Verified student registration, ticket claims and check-in stay disabled until the owner supplies deployed Remix ABIs/addresses and a working zkEmail verifier.

## Validation

```sh
npm run typecheck
npm run build
```

See [docs/STATUS.md](docs/STATUS.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/DATABASE_SETUP.md](docs/DATABASE_SETUP.md), [docs/DESIGN_REFERENCE_AUDIT.md](docs/DESIGN_REFERENCE_AUDIT.md), and [docs/REMIX_INTEGRATION_HANDOFF.md](docs/REMIX_INTEGRATION_HANDOFF.md).

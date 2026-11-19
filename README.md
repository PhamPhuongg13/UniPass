# UniPass

Student-focused event discovery and organizer tools, built with Next.js App Router, TypeScript, PostgreSQL/Prisma, ethers v6 and a Vietnamese-first neo-brutalist design.

## Local development

```sh
npm install
if [ ! -f .env ]; then cp .env.example .env; fi
# Set DATABASE_URL, SESSION_SECRET and APP_ORIGIN in .env
npm run db:generate
npm run db:migrate
npm run dev
```

If port 3000 is occupied, Next.js will start on another local port. Wallet sign-in accepts HTTP loopback origins (`localhost`/`127.0.0.1`) on any port in development only; production still requires `APP_ORIGIN` to exactly match the deployed site origin.

The organizer API requires PostgreSQL and an origin-bound wallet signature. On Avalanche Fuji, organizers can create an event in both UniPass and the EventManager; attendees can register with a wallet and mint an NFT ticket; organizers can check in a ticket by token ID. The supplied EventManager does not verify zkEmail or student status, so these testnet registrations are wallet-based and must never be described as student-verified. zkEmail remains a separate pending milestone.

For the supplied Remix contracts, set the `NEXT_PUBLIC_*` Fuji values in `.env` (already set in the current local workspace), then start PostgreSQL and run the commands above. The manager and ticket addresses are public testnet configuration; never add wallet secrets to `.env` or source control.

## Validation

```sh
npm run typecheck
npm run build
```

See [docs/STATUS.md](docs/STATUS.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/DATABASE_SETUP.md](docs/DATABASE_SETUP.md), [docs/DESIGN_REFERENCE_AUDIT.md](docs/DESIGN_REFERENCE_AUDIT.md), and [docs/REMIX_INTEGRATION_HANDOFF.md](docs/REMIX_INTEGRATION_HANDOFF.md).

# UniPass architecture

## Implementation plan

1. M0: audit the empty workspace, verify public references, record risks and the Remix handoff.
2. M1: deliver the Vietnamese-first responsive experience with explicitly labeled sample event data and honest disconnected/pending states.
3. M2–M5: add persistence/auth foundations, safe wallet and contract adapters, ticket/check-in interfaces, then inspect the zkEmail toolchain independently.
4. M6–M7: wait for owner-provided ABI, addresses and approved verifier; integrate only against real artifacts, then harden and exercise end-to-end flows.

## Current structure

- `src/app`: Next.js App Router pages, authenticated API routes and global design system.
- `src/components`: shared wallet sign-in navigation and organizer metadata form.
- `src/lib/web3`: ethers v6 EIP-1193 wallet helpers and Fuji configuration.
- `src/lib/contracts`: provisional typed interfaces, deliberately unavailable until ABI is supplied.
- `prisma/schema.prisma`: metadata and chain-mirror models; initial PostgreSQL migration is in `prisma/migrations`. The migration has not yet been run against a database.
- `zkemail-local/`: reserved for isolated local circuits and artifacts; real `.eml` files and proof output are ignored.

## Trust boundaries

Metadata is editable application data. Registration, minted tickets, ownership and check-in must be confirmed by the deployed contracts and indexed idempotently. A metadata row or QR code is never proof of a successful chain action. Student eligibility is not shown as verified until a real DKIM proof is checked by an approved verifier. Never send original mail to a third party.

Wallet authentication uses server-created origin-bound five-minute nonces, EIP-191 signature verification, atomic one-time consumption, a seven-day hashed server session and an HttpOnly/SameSite cookie. Origin is checked for authenticated writes. Every event write verifies the session wallet owns the organizer record; client-supplied wallets are not authorization. Challenge throttling is currently per wallet and is not a production-grade distributed rate limiter.

## Initial plan / limitations

The project folder was empty. Git resolves to the parent home directory, not this project, so project changes are kept inside `UniPass` and the parent Git status is not used as a project baseline. The app uses labeled in-file seed listings plus a PostgreSQL metadata API. Runtime data awaits local database setup. No real QR scan, ticket transfer, on-chain registration, or zkEmail verification is enabled. See `STATUS.md` for milestone state.

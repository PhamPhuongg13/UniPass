# Local database setup

1. On macOS with Homebrew, install and start PostgreSQL:

   ```sh
   brew install postgresql@17
   brew services start postgresql@17
   pg_isready -h localhost -p 5432
   ```

   Homebrew initializes a local database cluster. Create the UniPass database with your macOS account:

   ```sh
   createdb unipass
   ```

   Set a password for the macOS database role (replace `vuphuongpham` with the account shown before `$` in your terminal prompt). In `psql`, enter a local password you choose:

   ```sh
   psql postgres
   ```

   ```sql
   ALTER ROLE vuphuongpham WITH LOGIN PASSWORD 'choose-a-local-password';
   \q
   ```

2. Copy `.env.example` to `.env`. For a Homebrew database, set `DATABASE_URL` to use your macOS account and a local password, for example `postgresql://vuphuongpham:YOUR_PASSWORD@localhost:5432/unipass?schema=public`. Set a random `SESSION_SECRET` and `APP_ORIGIN=http://localhost:3000`. Prisma CLI reads `.env`; Next.js also reads it.
3. Run each command separately, waiting for it to finish:

   ```sh
   npm run db:generate
   npm run db:migrate
   npm run dev
   ```

   Open `http://localhost:3000` after `npm run dev` prints that the server is ready. `db:generate` only creates Prisma Client; it does not start PostgreSQL or create the database.

Event metadata is an editorial record, not the source of truth for capacity, student eligibility, registration, NFT ownership or check-in. Those remain dependent on the deployed contracts. Organizer APIs require a one-time wallet challenge and a server-backed HttpOnly session. Do not expose API writes directly until the application origin and database are configured.

The first migration is in `prisma/migrations/20261118000000_initial`; it has not been applied to a database during this implementation. The API does not store uploaded cover files yet: `coverUrl` accepts a URL only. Configure rate limiting for authentication challenges and public reads before production use.

import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
const LOCK_KEY = BigInt(841771021);
export async function withRelayerLock<T>(send: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return db.$transaction(async tx => { await tx.$queryRaw`SELECT pg_advisory_xact_lock(${LOCK_KEY})::text`; return send(tx); }, { timeout: 120_000 });
}

import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;
export async function upsertStudentEligibility(tx: Tx, input: {
  wallet: string; emailNullifier: string; senderDomain: string; verificationMode: string;
  blueprintId: string; policyVersion: string; sourceChallengeHash: string;
  beforeWrite?: () => Promise<boolean>;
}) {
  const now = new Date();
  const existing = await tx.studentEligibility.findUnique({ where: { emailNullifier: input.emailNullifier } });
  const rebindCount = existing && existing.wallet !== input.wallet ? existing.rebindCount + 1 : existing?.rebindCount ?? 0;
  if (rebindCount > 5) return { code: "limit" as const };
  if (input.beforeWrite && !await input.beforeWrite()) return { code: "challenge" as const };
  if (existing) await tx.studentEligibility.delete({ where: { wallet: existing.wallet } });
  await tx.studentEligibility.deleteMany({ where: { wallet: input.wallet } });
  const expiresAt = new Date(now.getTime() + 180 * 24 * 60 * 60_000);
  await tx.studentEligibility.create({ data: {
    wallet: input.wallet, chainId: 43113, senderDomain: input.senderDomain,
    blueprintId: input.blueprintId, policyVersion: input.policyVersion,
    verificationMode: input.verificationMode, emailNullifier: input.emailNullifier,
    rebindCount, sourceChallengeHash: input.sourceChallengeHash, verifiedAt: now, expiresAt,
  } });
  return { code: "ok" as const, expiresAt, rebound: Boolean(existing && existing.wallet !== input.wallet) };
}

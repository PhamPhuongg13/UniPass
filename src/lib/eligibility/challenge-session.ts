import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getRequestOrigin, getSessionContext } from "@/lib/auth";
import { hashEmailChallenge, STUDENT_EMAIL_CHAIN_ID, STUDENT_EMAIL_PURPOSE } from "@/lib/zkemail/challenge.mjs";

const error = (message: string, status: number) => ({ error: NextResponse.json({ error: message }, { status }) });

export async function claimStudentChallengeAttempt(request: Request, challengeId: string, challengeValue: string) {
  let origin: string | null;
  try { origin = getRequestOrigin(request); }
  catch { return error("UniPass secure origin is not configured.", 503); }
  if (!origin) return error("Invalid origin.", 403);
  let session;
  try { session = await getSessionContext(); }
  catch { return error("Could not verify wallet session.", 503); }
  if (!session) return error("Wallet session expired. Sign in again.", 401);
  const nonceHash = hashEmailChallenge(challengeValue);
  let challenge;
  try { challenge = await db.studentEmailChallenge.findUnique({ where: { id: challengeId } }); }
  catch { return error("Could not access challenge store.", 503); }
  const now = new Date();
  if (!challenge || challenge.nonceHash !== nonceHash || challenge.wallet !== session.wallet || challenge.sessionId !== session.id || challenge.origin !== origin || challenge.chainId !== STUDENT_EMAIL_CHAIN_ID || challenge.purpose !== STUDENT_EMAIL_PURPOSE) return error("Challenge does not belong to current wallet or session.", 401);
  if (challenge.consumedAt || challenge.expiresAt <= now) return error("Challenge expired or was used. Create a new code.", 409);
  try {
    const claim = await db.studentEmailChallenge.updateMany({ where: { id: challenge.id, consumedAt: null, expiresAt: { gt: now }, attempts: { lt: 5 } }, data: { attempts: { increment: 1 } } });
    if (claim.count !== 1) return error("Too many attempts. Create a new challenge.", 429);
  } catch { return error("Could not check attempt limit.", 503); }
  return { session, origin, nonceHash, challenge };
}

export async function consumeStudentChallenge(tx: Prisma.TransactionClient, input: { session: { id: string; wallet: string }; origin: string; nonceHash: string; challenge: { id: string } }) {
  const now = new Date();
  const active = await tx.authSession.findFirst({ where: { id: input.session.id, wallet: input.session.wallet, expiresAt: { gt: now } }, select: { id: true } });
  if (!active) return false;
  const claim = await tx.studentEmailChallenge.updateMany({ where: { id: input.challenge.id, nonceHash: input.nonceHash, wallet: input.session.wallet, sessionId: input.session.id, origin: input.origin, chainId: STUDENT_EMAIL_CHAIN_ID, purpose: STUDENT_EMAIL_PURPOSE, consumedAt: null, expiresAt: { gt: now } }, data: { consumedAt: now } });
  return claim.count === 1;
}

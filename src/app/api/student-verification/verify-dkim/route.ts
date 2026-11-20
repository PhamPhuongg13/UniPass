import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { isEmailChallenge } from "@/lib/zkemail/challenge.mjs";
import { claimStudentChallengeAttempt, consumeStudentChallenge } from "@/lib/eligibility/challenge-session";
import { verifyStudentEmail } from "@/lib/eligibility/dkim-verify.mjs";
import { deriveEmailNullifier, getNullifierSecret } from "@/lib/eligibility/nullifier.mjs";
import { upsertStudentEligibility } from "@/lib/eligibility/upsert-student";

export const runtime = "nodejs";
const input = z.object({ challengeId: z.string().min(1).max(64), challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/), eml: z.string().min(1) }).strict();
const messages: Record<string, string> = {
  INVALID_EMAIL: "Invalid email file.", TOO_LARGE: "Email file exceeds 2 MB.", INVALID_CHALLENGE: "Invalid challenge.",
  DKIM_FAILED: "Invalid DKIM signature.", SIGNING_DOMAIN: "Email was not signed by an accepted school domain.",
  FROM_UNSIGNED: "DKIM did not sign the From header.", BODY_LENGTH_LIMIT: "DKIM signature does not cover the full email.",
  FROM_COUNT: "Email must have exactly one From header.", FROM_ADDRESS: "Invalid From address.",
  FROM_ALIGNMENT: "From domain does not match DKIM signature.", CHALLENGE_MISSING: "Email is missing the challenge.",
  CHALLENGE_MISMATCH: "Challenge in email does not match.",
};

export async function POST(request: Request) {
  let parsed;
  try {
    if (Number(request.headers.get("content-length") || 0) > 2_010_000) return NextResponse.json({ error: messages.TOO_LARGE }, { status: 413 });
    const raw = await request.text();
    if (Buffer.byteLength(raw) > 2_010_000) return NextResponse.json({ error: messages.TOO_LARGE }, { status: 413 });
    parsed = input.safeParse(JSON.parse(raw));
  } catch { return NextResponse.json({ error: "Invalid email data." }, { status: 400 }); }
  if (!parsed.success || !isEmailChallenge(parsed.data.challenge)) return NextResponse.json({ error: "Invalid challenge or email format." }, { status: 400 });
  if (Buffer.byteLength(parsed.data.eml) > 2_000_000) return NextResponse.json({ error: messages.TOO_LARGE }, { status: 413 });
  const claim = await claimStudentChallengeAttempt(request, parsed.data.challengeId, parsed.data.challenge);
  if ("error" in claim) return claim.error;
  const result = await verifyStudentEmail(parsed.data.eml, { expectedChallenge: parsed.data.challenge });
  if (!result.ok) return NextResponse.json({ error: messages[result.code] || "Could not verify email." }, { status: 400 });
  let secret: Buffer;
  try { secret = getNullifierSecret(); }
  catch { return NextResponse.json({ error: "Email security secret is not configured on the server." }, { status: 503 }); }
  const emailNullifier = deriveEmailNullifier(secret, result.normalizedSender);
  try {
    const outcome = await db.$transaction(tx => upsertStudentEligibility(tx, {
      wallet: claim.session.wallet, emailNullifier, senderDomain: result.domain,
      verificationMode: "dkim", blueprintId: "dkim-v1", policyVersion: "dkim-v1",
      sourceChallengeHash: claim.nonceHash,
      beforeWrite: () => consumeStudentChallenge(tx, claim),
    }), { isolationLevel: "Serializable" });
    if (outcome.code === "limit") return NextResponse.json({ error: "Email was rebound to a wallet more than five times." }, { status: 429 });
    if (outcome.code === "challenge") return NextResponse.json({ error: "Challenge or wallet session expired." }, { status: 409 });
    return NextResponse.json({ verified: true, mode: "dkim", domain: result.domain, expiresAt: outcome.expiresAt.toISOString(), rebound: outcome.rebound }, { headers: { "Cache-Control": "no-store, private" } });
  } catch { return NextResponse.json({ error: "Could not record verification. Please retry." }, { status: 503 }); }
}

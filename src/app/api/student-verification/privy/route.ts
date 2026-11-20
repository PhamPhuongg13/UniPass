import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getRequestOrigin, getSessionContext } from "@/lib/auth";
import { getVerifiedPrivyUser } from "@/lib/privy/server";
import { selectSchoolEmail } from "@/lib/eligibility/privy-email.mjs";
import { deriveEmailNullifier, getNullifierSecret } from "@/lib/eligibility/nullifier.mjs";
import { upsertStudentEligibility } from "@/lib/eligibility/upsert-student";
import { schoolLabel } from "@/lib/schools";

export const runtime = "nodejs";
const input = z.object({ accessToken: z.string().min(1) }).strict();
export async function POST(request: Request) {
  try { if (!getRequestOrigin(request)) return NextResponse.json({ error: "Invalid origin." }, { status: 403 }); }
  catch { return NextResponse.json({ error: "APP_ORIGIN is not configured." }, { status: 503 }); }
  const session = await getSessionContext().catch(() => null);
  if (!session) return NextResponse.json({ error: "Sign in to UniPass first." }, { status: 401 });
  if (!process.env.PRIVY_APP_SECRET) return NextResponse.json({ error: "PRIVY_APP_SECRET is not configured." }, { status: 503 });
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Privy access token is missing." }, { status: 400 });
  try {
    const { user, wallet } = await getVerifiedPrivyUser(parsed.data.accessToken);
    if (wallet !== session.wallet) return NextResponse.json({ error: "Privy wallet does not match UniPass session." }, { status: 403 });
    const selected = selectSchoolEmail(user.linked_accounts);
    if (!selected) return NextResponse.json({ code: "NO_SCHOOL_EMAIL" }, { status: 404 });
    const emailNullifier = deriveEmailNullifier(getNullifierSecret(), selected.email);
    const sourceChallengeHash = createHash("sha256").update(`privy:${user.id}:${Date.now()}:${randomBytes(16).toString("hex")}`).digest("hex");
    const outcome = await db.$transaction(tx => upsertStudentEligibility(tx, {
      wallet, emailNullifier, senderDomain: selected.domain, verificationMode: "privy-email",
      blueprintId: "privy-email-v1", policyVersion: "privy-email-v1", sourceChallengeHash,
    }), { isolationLevel: "Serializable" });
    if (outcome.code === "limit") return NextResponse.json({ error: "Email was rebound to a wallet more than five times." }, { status: 429 });
    if (outcome.code !== "ok") return NextResponse.json({ error: "Could not save verification." }, { status: 409 });
    return NextResponse.json({ verified: true, school: schoolLabel(selected.domain), expiresAt: outcome.expiresAt.toISOString() }, { headers: { "Cache-Control": "no-store, private" } });
  } catch { return NextResponse.json({ error: "Could not verify school email through Privy." }, { status: 503 }); }
}

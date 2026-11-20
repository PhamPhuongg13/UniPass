import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { schoolLabel } from "@/lib/schools";
import { getSessionWallet } from "@/lib/auth";

export const runtime = "nodejs";
export async function GET() {
  try {
    const wallet = await getSessionWallet();
    if (!wallet) return NextResponse.json({ verified: false }, { headers: { "Cache-Control": "no-store, private" } });
    const eligibility = await db.studentEligibility.findUnique({ where: { wallet } });
    if (!eligibility || eligibility.revokedAt || eligibility.expiresAt <= new Date() || !eligibility.emailNullifier) return NextResponse.json({ verified: false }, { headers: { "Cache-Control": "no-store, private" } });
    return NextResponse.json({ verified: true, mode: eligibility.verificationMode, domain: eligibility.senderDomain, school: schoolLabel(eligibility.senderDomain), expiresAt: eligibility.expiresAt.toISOString() }, { headers: { "Cache-Control": "no-store, private" } });
  } catch { return NextResponse.json({ error: "Could not check verification status." }, { status: 503 }); }
}

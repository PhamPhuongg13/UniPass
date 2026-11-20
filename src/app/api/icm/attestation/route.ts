import { NextResponse } from "next/server";
import { Wallet } from "ethers";
import { getRequestOrigin, getSessionWallet } from "@/lib/auth";
import { db } from "@/lib/db";
import { icmPublicConfig, bridgeContract } from "@/lib/icm/contracts";
import { signPassportAttestation } from "@/lib/icm/attestation.mjs";
import { createReadOnlyFujiProvider } from "@/lib/contracts/chain";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try { if (!getRequestOrigin(request)) return NextResponse.json({ error: "Invalid origin." }, { status: 403 }); }
  catch { return NextResponse.json({ error: "APP_ORIGIN is not configured." }, { status: 503 }); }
  const wallet = await getSessionWallet().catch(() => null);
  if (!wallet) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const config = icmPublicConfig(); if (!config) return NextResponse.json({ error: "UniPass L1 is not configured." }, { status: 503 });
  const eligibility = await db.studentEligibility.findUnique({ where: { wallet } });
  if (!eligibility || !eligibility.emailNullifier || eligibility.revokedAt || eligibility.expiresAt <= new Date()) return NextResponse.json({ error: "Get your active UniPass first." }, { status: 403 });
  const provider = createReadOnlyFujiProvider();
  try {
    const signer = new Wallet(process.env.UNIPASS_REGISTRATION_ISSUER_PRIVATE_KEY!);
    if (String(await bridgeContract(provider).issuer()).toLowerCase() !== signer.address.toLowerCase()) return NextResponse.json({ error: "Issuer configuration mismatch." }, { status: 503 });
    const signed = await signPassportAttestation(process.env.UNIPASS_REGISTRATION_ISSUER_PRIVATE_KEY!, config.bridge, wallet, eligibility.senderDomain, eligibility.expiresAt);
    return NextResponse.json(signed, { headers: { "Cache-Control": "no-store, private" } });
  } catch { return NextResponse.json({ error: "Could not sign passport attestation." }, { status: 503 }); }
  finally { provider.destroy(); }
}

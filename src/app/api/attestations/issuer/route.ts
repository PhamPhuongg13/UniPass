import { NextResponse } from "next/server";
import { Wallet } from "ethers";
export async function GET() {
  const configured = process.env.REGISTRATION_ISSUER_ADDRESS || process.env.NEXT_PUBLIC_REGISTRATION_ISSUER_ADDRESS;
  const derived = process.env.UNIPASS_REGISTRATION_ISSUER_PRIVATE_KEY ? new Wallet(process.env.UNIPASS_REGISTRATION_ISSUER_PRIVATE_KEY).address : null;
  if (!configured || !derived || configured.toLowerCase() !== derived.toLowerCase()) return NextResponse.json({ error: "Issuer is not configured." }, { status: 503 });
  return NextResponse.json({ issuer: derived });
}

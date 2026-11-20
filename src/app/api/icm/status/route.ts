import { NextResponse } from "next/server";
import { getSessionWallet } from "@/lib/auth";
import { icmConfigured, readIcmStatus } from "@/lib/icm/contracts";
export const runtime = "nodejs";
export async function GET() {
  const wallet = await getSessionWallet().catch(() => null);
  if (!wallet) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!icmConfigured()) return NextResponse.json({ error: "UniPass L1 is not configured." }, { status: 503 });
  try { return NextResponse.json(await readIcmStatus(wallet), { headers: { "Cache-Control": "no-store, private" } }); }
  catch { return NextResponse.json({ error: "Could not read cross-chain status." }, { status: 503 }); }
}

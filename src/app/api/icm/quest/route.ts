import { NextResponse } from "next/server";
import { Wallet, getAddress, isHexString, verifyMessage } from "ethers";
import { getRequestOrigin, getSessionWallet } from "@/lib/auth";
import { createL1Provider, icmPublicConfig, mirrorContract, questContract } from "@/lib/icm/contracts";
import { claimMessage } from "@/lib/icm/quest-message.mjs";
import { withIcmRelayerLock } from "@/lib/icm/lock";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try { if (!getRequestOrigin(request)) return NextResponse.json({ error: "Invalid origin." }, { status: 403 }); }
  catch { return NextResponse.json({ error: "APP_ORIGIN is not configured." }, { status: 503 }); }
  const wallet = await getSessionWallet().catch(() => null); if (!wallet) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const config = icmPublicConfig(); if (!config) return NextResponse.json({ error: "UniPass L1 is not configured." }, { status: 503 });
  const body = await request.json().catch(() => null);
  const deadline = Number(body?.deadline), signature = body?.signature;
  if (!Number.isSafeInteger(deadline) || deadline < Date.now() / 1000 || deadline > Date.now() / 1000 + 600 || typeof signature !== "string" || !isHexString(signature, 65)) return NextResponse.json({ error: "Invalid quest signature or deadline." }, { status: 400 });
  const message = claimMessage(wallet, 1, config.chainId, config.quest, deadline);
  try { if (getAddress(verifyMessage(message, signature)) !== getAddress(wallet)) return NextResponse.json({ error: "Wrong signature." }, { status: 403 }); }
  catch { return NextResponse.json({ error: "Invalid signature." }, { status: 400 }); }
  const provider = createL1Provider();
  try {
    if (!await mirrorContract(provider).isStudent(wallet)) return NextResponse.json({ error: "Passport has not arrived on UniPass L1." }, { status: 409 });
    const relayer = new Wallet(process.env.POLL_RELAYER_PRIVATE_KEY!, provider);
    const result = await withIcmRelayerLock(async () => {
      const quest = questContract(relayer);
      if (await quest.claimed(wallet, 1)) return { error: "Quest already claimed." };
      const sent = await quest.claimFor(wallet, 1, deadline, signature);
      const receipt = await sent.wait(1);
      if (!receipt || receipt.status !== 1) throw new Error("Quest transaction failed");
      return { txHash: sent.hash as string };
    });
    if ("error" in result) return NextResponse.json(result, { status: 409 });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store, private" } });
  } catch { return NextResponse.json({ error: "Could not claim Campus Quest. Retry shortly." }, { status: 503 }); }
  finally { provider.destroy(); }
}

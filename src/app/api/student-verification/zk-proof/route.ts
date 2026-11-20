import { NextResponse } from "next/server";
import { getAddress } from "ethers";
import { getRequestOrigin, getSessionWallet } from "@/lib/auth";
import { db } from "@/lib/db";
import { createReadOnlyFujiProvider } from "@/lib/contracts/chain";
import { zkEmailAddress, zkEmailContract, zkEmailInterface } from "@/lib/contracts/zkemail";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    if (!getRequestOrigin(request)) return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
    const wallet = await getSessionWallet();
    if (!wallet) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
    const { txHash } = await request.json();
    if (typeof txHash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) return NextResponse.json({ error: "Invalid transaction hash." }, { status: 400 });
    const address = zkEmailAddress();
    if (!address) return NextResponse.json({ error: "zkEmail contract is not configured." }, { status: 503 });
    const provider = createReadOnlyFujiProvider();
    let proof: { domain: string; fromDomainHash: string; publicKeyHash: string; proofId: string } | undefined;
    try {
      if (Number((await provider.getNetwork()).chainId) !== 43113) throw new Error("RPC is not Fuji.");
      const receipt = await provider.getTransactionReceipt(txHash);
      if (!receipt || receipt.status !== 1 || receipt.to?.toLowerCase() !== address.toLowerCase()) return NextResponse.json({ error: "No successful zkEmail transaction found." }, { status: 400 });
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== address.toLowerCase()) continue;
        let parsed;
        try { parsed = zkEmailInterface.parseLog({ topics: [...log.topics], data: log.data }); } catch { continue; }
        if (parsed?.name === "StudentEmailProven" && getAddress(String(parsed.args.wallet)).toLowerCase() === wallet.toLowerCase()) {
          proof = { domain: String(parsed.args.domain), fromDomainHash: String(parsed.args.fromDomainHash), publicKeyHash: String(parsed.args.publicKeyHash), proofId: String(parsed.args.proofId) };
          break;
        }
      }
      if (proof) {
        const [current] = await zkEmailContract(provider).attestationOf(wallet);
        if (String(current.proofId).toLowerCase() !== proof.proofId.toLowerCase()) proof = undefined;
      }
    } finally { provider.destroy(); }
    if (!proof) return NextResponse.json({ error: "No matching student proof in this transaction." }, { status: 400 });
    await db.zkEmailAttestation.upsert({ where: { wallet }, create: { wallet, ...proof, txHash }, update: { ...proof, txHash } });
    return NextResponse.json({ verified: true, domain: proof.domain }, { headers: { "Cache-Control": "no-store, private" } });
  } catch {
    return NextResponse.json({ error: "Could not record the on-chain proof. Retry with the same transaction hash." }, { status: 503 });
  }
}

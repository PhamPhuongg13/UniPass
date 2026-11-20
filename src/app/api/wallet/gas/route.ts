import { NextResponse } from "next/server";
import { Wallet, parseEther } from "ethers";
import { db } from "@/lib/db";
import { getRequestOrigin, getSessionContext } from "@/lib/auth";
import { createReadOnlyFujiProvider } from "@/lib/contracts/chain";
import { shouldDrip } from "@/lib/wallet/gas-policy.mjs";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try { if (!getRequestOrigin(request)) return NextResponse.json({ error: "Invalid origin." }, { status: 403 }); }
  catch { return NextResponse.json({ error: "APP_ORIGIN is not configured." }, { status: 503 }); }
  const session = await getSessionContext().catch(() => null);
  if (!session) return NextResponse.json({ error: "Sign in to UniPass first." }, { status: 401 });
  const privateKey = process.env.GAS_FAUCET_PRIVATE_KEY?.trim();
  if (!privateKey) return NextResponse.json({ error: "GAS_FAUCET_PRIVATE_KEY is not configured." }, { status: 503 });
  let amountWei: bigint, minBalanceWei: bigint, dailyCap: number;
  try {
    amountWei = parseEther(process.env.GAS_DRIP_AMOUNT_AVAX || "0.005");
    minBalanceWei = parseEther(process.env.GAS_DRIP_MIN_BALANCE_AVAX || "0.001");
    dailyCap = Number(process.env.GAS_DRIP_DAILY_CAP || "300");
    if (amountWei <= BigInt(0) || minBalanceWei < BigInt(0) || !Number.isSafeInteger(dailyCap) || dailyCap <= 0) throw new Error("Invalid gas config.");
  } catch { return NextResponse.json({ error: "Invalid gas drip configuration." }, { status: 503 }); }
  const provider = createReadOnlyFujiProvider();
  try {
    // One transaction-wide advisory lock serializes every drip, including different wallets.
    // The lock is released on commit or rollback. A confirmed transfer is recorded before commit.
    const result = await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(43113, 20261120)`;
      const now = new Date();
      const since = new Date(now.getTime() - 86_400_000);
      const balanceWei = await provider.getBalance(session.wallet);
      const [lastDrip, dripsToday] = await Promise.all([
        tx.gasDrip.findFirst({ where: { wallet: session.wallet }, orderBy: { createdAt: "desc" } }),
        tx.gasDrip.count({ where: { createdAt: { gte: since } } }),
      ]);
      const policy = shouldDrip({ balanceWei, lastDripAt: lastDrip?.createdAt ?? null, dripsToday, now, config: { minBalanceWei, dailyCap } });
      if (!policy.drip) return { funded: false, reason: policy.reason };
      const faucet = new Wallet(privateKey, provider);
      const transaction = await faucet.sendTransaction({ to: session.wallet, value: amountWei });
      const receipt = await transaction.wait(1);
      if (!receipt || receipt.status !== 1) throw new Error("Gas drip transaction failed.");
      await tx.gasDrip.create({ data: { wallet: session.wallet, txHash: transaction.hash, amountWei: amountWei.toString() } });
      return { funded: true, txHash: transaction.hash };
    }, { timeout: 120_000, maxWait: 120_000 });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "Could not provide testnet AVAX. Please retry." }, { status: 503 }); }
  finally { await provider.destroy(); }
}

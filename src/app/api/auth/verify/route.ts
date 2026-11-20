import { verifyMessage, getAddress } from "ethers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getRequestOrigin, hashToken, newToken, setSessionCookie } from "@/lib/auth";

export const runtime = "nodejs";
const input = z.object({ message: z.string().min(1).max(1200), signature: z.string().regex(/^0x[0-9a-fA-F]+$/).max(2048) }).strict();
const line = (message: string, name: string) => message.split("\n").find(row => row.startsWith(`${name}: `))?.slice(name.length + 2);

export async function POST(request: Request) {
  try {
    const origin = getRequestOrigin(request);
    if (!origin) return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
    const parsed = input.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Invalid signature or message." }, { status: 400 });
    const { message, signature } = parsed.data;
    const wallet = getAddress(line(message, "Wallet") ?? "").toLowerCase();
    const nonce = line(message, "Nonce") ?? "";
    const expiry = new Date(line(message, "Expiration Time") ?? "");
    const issued = new Date(line(message, "Issued At") ?? "");
    if (!message.startsWith("UniPass sign-in\n") || line(message, "Origin") !== origin || line(message, "Chain ID") !== "43113" || !nonce || !Number.isFinite(expiry.getTime()) || !Number.isFinite(issued.getTime()) || expiry <= new Date() || expiry.getTime() > Date.now() + 5 * 60_000 || issued.getTime() > Date.now() + 30_000 || issued.getTime() < Date.now() - 5 * 60_000) {
      return NextResponse.json({ error: "Message expired or does not match this site." }, { status: 400 });
    }
    if (getAddress(verifyMessage(message, signature)).toLowerCase() !== wallet) return NextResponse.json({ error: "Signature does not match wallet address." }, { status: 401 });
    const nonceRow = await db.authNonce.findUnique({ where: { nonceHash: hashToken(nonce) } });
    if (!nonceRow || nonceRow.wallet !== wallet || nonceRow.consumedAt || nonceRow.expiresAt <= new Date()) return NextResponse.json({ error: "Nonce used, expired or missing." }, { status: 401 });
    if (nonceRow.expiresAt.getTime() !== expiry.getTime() || issued.getTime() > nonceRow.createdAt.getTime() + 30_000) return NextResponse.json({ error: "Message does not match the issued challenge." }, { status: 401 });
    const token = newToken();
    const sessionExpiry = new Date(Date.now() + 7 * 24 * 60 * 60_000);
    await db.$transaction(async tx => {
      const claim = await tx.authNonce.updateMany({ where: { id: nonceRow.id, consumedAt: null, expiresAt: { gt: new Date() } }, data: { consumedAt: new Date() } });
      if (claim.count !== 1) throw new Error("Nonce was already consumed.");
      await tx.authSession.create({ data: { wallet, tokenHash: hashToken(token), expiresAt: sessionExpiry } });
    });
    await setSessionCookie(token, sessionExpiry);
    return NextResponse.json({ wallet, expiresAt: sessionExpiry.toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "Nonce was already consumed.") return NextResponse.json({ error: "Nonce was already used." }, { status: 401 });
    return NextResponse.json({ error: "Could not authenticate signature." }, { status: 401 });
  }
}

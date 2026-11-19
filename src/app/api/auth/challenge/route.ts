import { randomBytes } from "node:crypto";
import { getAddress } from "ethers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getRequestOrigin, hashToken } from "@/lib/auth";

export const runtime = "nodejs";
const input = z.object({ address: z.string().regex(/^0x[0-9a-fA-F]{40}$/) });

export async function POST(request: Request) {
  try {
    const origin = getRequestOrigin(request);
    if (!origin) return NextResponse.json({ error: "Origin không hợp lệ." }, { status: 403 });
    const parsed = input.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Địa chỉ ví không hợp lệ." }, { status: 400 });
    const wallet = getAddress(parsed.data.address).toLowerCase();
    const recentChallenges = await db.authNonce.count({ where: { wallet, createdAt: { gte: new Date(Date.now() - 60 * 60_000) } } });
    if (recentChallenges >= 8) return NextResponse.json({ error: "Đã yêu cầu quá nhiều mã đăng nhập cho ví này. Thử lại sau." }, { status: 429, headers: { "Retry-After": "3600" } });
    const nonce = randomBytes(24).toString("base64url");
    const issued = new Date();
    const expires = new Date(issued.getTime() + 5 * 60_000);
    await db.authNonce.create({ data: { wallet, nonceHash: hashToken(nonce), expiresAt: expires } });
    const message = ["UniPass sign-in", `Origin: ${origin}`, `Wallet: ${wallet}`, "Chain ID: 43113", `Nonce: ${nonce}`, `Issued At: ${issued.toISOString()}`, `Expiration Time: ${expires.toISOString()}`].join("\n");
    return NextResponse.json({ message, expiresAt: expires.toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Đăng nhập ví chưa sẵn sàng. Kiểm tra cấu hình máy chủ và cơ sở dữ liệu." }, { status: 503 });
  }
}

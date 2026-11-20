import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getRequestOrigin, hashToken, newToken, setSessionCookie } from "@/lib/auth";
import { getVerifiedPrivyUser } from "@/lib/privy/server";

export const runtime = "nodejs";
const input = z.object({ accessToken: z.string().min(1) }).strict();
export async function POST(request: Request) {
  try { if (!getRequestOrigin(request)) return NextResponse.json({ error: "Invalid origin." }, { status: 403 }); }
  catch { return NextResponse.json({ error: "APP_ORIGIN is not configured." }, { status: 503 }); }
  if (!process.env.PRIVY_APP_SECRET) return NextResponse.json({ error: "PRIVY_APP_SECRET is not configured." }, { status: 503 });
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Privy access token is missing." }, { status: 400 });
  try {
    const { wallet } = await getVerifiedPrivyUser(parsed.data.accessToken);
    const token = newToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60_000);
    await db.authSession.create({ data: { wallet, tokenHash: hashToken(token), expiresAt } });
    await setSessionCookie(token, expiresAt);
    return NextResponse.json({ wallet }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "Could not authenticate Privy session." }, { status: 401 }); }
}

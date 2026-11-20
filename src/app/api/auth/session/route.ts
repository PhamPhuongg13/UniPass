import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { getRequestOrigin, getSessionWallet, hashToken, SESSION_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";
export async function GET() {
  try { return NextResponse.json({ wallet: await getSessionWallet() }, { headers: { "Cache-Control": "no-store" } }); }
  catch { return NextResponse.json({ wallet: null }, { headers: { "Cache-Control": "no-store" } }); }
}
export async function DELETE(request: Request) {
  try { if (!getRequestOrigin(request)) return NextResponse.json({ error: "Invalid origin." }, { status: 403 }); }
  catch { return NextResponse.json({ error: "APP_ORIGIN is not configured." }, { status: 503 }); }
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.authSession.deleteMany({ where: { tokenHash: hashToken(token) } });
  jar.delete(SESSION_COOKIE);
  return NextResponse.json({ ok: true });
}

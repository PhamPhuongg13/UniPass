import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getRequestOrigin, getSessionWallet } from "@/lib/auth";
export async function actionContext(request: Request, id: string, kind: string, creator = false) {
  if (request.method !== "GET") { try { if (!getRequestOrigin(request)) return { error: NextResponse.json({ error: "Invalid origin." }, { status: 403 }) }; } catch { return { error: NextResponse.json({ error: "APP_ORIGIN is not configured." }, { status: 503 }) }; } }
  const wallet = await getSessionWallet().catch(() => null);
  if (!wallet) return { error: NextResponse.json({ error: "Sign in first." }, { status: 401 }) };
  const program = await db.program.findFirst({ where: { OR: [{ id }, { slug: id }] } });
  if (!program || program.kind !== kind) return { error: NextResponse.json({ error: "Program not found." }, { status: 404 }) };
  if (creator && program.createdByWallet.toLowerCase() !== wallet.toLowerCase()) return { error: NextResponse.json({ error: "Creator access required." }, { status: 403 }) };
  return { wallet, program };
}

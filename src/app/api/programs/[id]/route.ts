import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionWallet } from "@/lib/auth";
import { programView } from "@/lib/programs/server";
export const runtime = "nodejs";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try { const program = await db.program.findFirst({ where: { OR: [{ id }, { slug: id }] } }); if (!program) return NextResponse.json({ error: "Program not found." }, { status: 404 }); return NextResponse.json({ program: await programView(program, await getSessionWallet().catch(() => null)) }, { headers: { "Cache-Control": "no-store" } }); }
  catch { return NextResponse.json({ error: "Program is temporarily unavailable." }, { status: 503 }); }
}

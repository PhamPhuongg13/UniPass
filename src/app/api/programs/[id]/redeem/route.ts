import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { actionContext } from "@/lib/programs/api";
import { hashDiscountCode } from "@/lib/programs/code.mjs";
export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await actionContext(request, (await params).id, "DISCOUNT", true); if (context.error) return context.error;
  const parsed = z.object({ code: z.string() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a code." }, { status: 400 });
  let codeHash: string; try { codeHash = hashDiscountCode(parsed.data.code.trim().toUpperCase()); } catch { return NextResponse.json({ code: "INVALID_CODE", error: "Code unknown or already used." }, { status: 409 }); }
  const updated = await db.discountCode.updateMany({ where: { programId: context.program!.id, codeHash, redeemedAt: null }, data: { redeemedAt: new Date() } });
  return updated.count === 1 ? NextResponse.json({ redeemed: true }) : NextResponse.json({ code: "INVALID_CODE", error: "Code unknown or already used." }, { status: 409 });
}

import { NextResponse } from "next/server";
import { actionContext } from "@/lib/programs/api";
import { stampProgram, programResponse } from "@/lib/programs/server";
import { hashDiscountCode, newDiscountCode } from "@/lib/programs/code.mjs";
import { db } from "@/lib/db";
export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const program = await db.program.findFirst({ where: { OR: [{ id }, { slug: id }] } });
  if (!program || !["GIVEAWAY", "DISCOUNT"].includes(program.kind)) return NextResponse.json({ error: "Program not found." }, { status: 404 });
  const context = await actionContext(request, id, program.kind); if (context.error) return context.error;
  try { const result = await stampProgram({ program: context.program!, session: { wallet: context.wallet! }, attemptOnChain: new URL(request.url).searchParams.get("attemptOnChain") === "1" }); if (program.kind === "GIVEAWAY" || result.rejected) return NextResponse.json({ ...result, amount: program.amountPerClaim }); const code = newDiscountCode(); await db.discountCode.create({ data: { programId: program.id, nullifier: result.nullifier, codeHash: hashDiscountCode(code) } }); return NextResponse.json({ txHash: result.txHash, code, qrPayload: JSON.stringify({ kind: "UniPassDiscount", programId: program.id, code }) }); }
  catch (error) { const response = programResponse(error); return NextResponse.json(response.body, { status: response.status }); }
}

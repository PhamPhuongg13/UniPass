import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { schoolLabel } from "@/lib/schools";
import { actionContext } from "@/lib/programs/api";
import { programRecord, stampProgram, programResponse } from "@/lib/programs/server";
export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await actionContext(request, (await params).id, "SCHOLARSHIP"); if (context.error) return context.error;
  const parsed = z.object({ answer: z.string().trim().min(1).max(1000) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Write an answer of up to 1000 characters." }, { status: 400 });
  try { const record = await programRecord(context.program!, context.wallet!); const result = await stampProgram({ program: context.program!, session: { wallet: context.wallet! }, attemptOnChain: new URL(request.url).searchParams.get("attemptOnChain") === "1" }); if (!result.rejected) await db.scholarshipApplication.create({ data: { programId: context.program!.id, nullifier: result.nullifier, answer: parsed.data.answer, school: schoolLabel(record!.senderDomain) } }); return NextResponse.json(result); }
  catch (error) { const response = programResponse(error); return NextResponse.json(response.body, { status: response.status }); }
}

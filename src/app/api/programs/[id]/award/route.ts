import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { actionContext } from "@/lib/programs/api";
import { programNullifier, programResponse, ProgramError } from "@/lib/programs/server";
import { programContract, programProvider, programRelayer } from "@/lib/contracts/program";
import { withRelayerLock } from "@/lib/contracts/relayer-lock";
export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await actionContext(request, (await params).id, "SCHOLARSHIP", true); if (context.error) return context.error;
  const parsed = z.object({ applicationId: z.string().min(1) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose an applicant." }, { status: 400 });
  const program = context.program!;
  try {
    const application = await db.scholarshipApplication.findFirst({ where: { id: parsed.data.applicationId, programId: program.id } });
    if (!application) throw new ProgramError("NOT_FOUND", 404, "Applicant not found.");
    if (application.status === "AWARDED") throw new ProgramError("ALREADY_AWARDED", 409, "This applicant was already awarded.");
    const records = await db.studentEligibility.findMany({ where: { revokedAt: null, expiresAt: { gt: new Date() } } });
    const recipient = records.find(record => programNullifier(program, record.wallet, record) === application.nullifier)?.wallet;
    if (!recipient) throw new ProgramError("WALLET_UNAVAILABLE", 409, "Applicant must renew their passport before award.");
    const provider = programProvider();
    try {
      const contract = programContract(programRelayer(provider));
      const txHash = await withRelayerLock(async tx => {
        if (await contract.awarded(BigInt(program.chainProgramId!), application.nullifier)) throw new ProgramError("ALREADY_AWARDED", 409, "This applicant was already awarded.");
        const amount = BigInt((program.extra as { awardAmount: string }).awardAmount);
        const chainProgram = await contract.getProgram(BigInt(program.chainProgramId!));
        if (amount > BigInt(chainProgram.maxAward) || amount > BigInt(chainProgram.budget)) throw new ProgramError("BUDGET_EXHAUSTED", 409, "Program budget exhausted");
        const sent = await contract.award(BigInt(program.chainProgramId!), application.nullifier, recipient, amount);
        const receipt = await sent.wait(1); if (!receipt || receipt.status !== 1) throw new Error("Award failed");
        await tx.scholarshipApplication.update({ where: { id: application.id }, data: { status: "AWARDED", awardTx: sent.hash } });
        return sent.hash as string;
      });
      return NextResponse.json({ txHash });
    } finally { await provider.destroy(); }
  } catch (error) { const response = programResponse(error); return NextResponse.json(response.body, { status: response.status }); }
}

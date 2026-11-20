import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getAppOrigin } from "@/lib/auth";
import { actionContext } from "@/lib/programs/api";
import { allowedRedirect } from "@/lib/programs/redirect.mjs";
import { programNullifier, programRecord, stampProgram, programResponse, ProgramError } from "@/lib/programs/server";
import { programAddress } from "@/lib/contracts/program";
import { signAttestation } from "@/lib/programs/attestation.mjs";
import { schoolLabel } from "@/lib/schools";
export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await actionContext(request, (await params).id, "ECOSYSTEM"); if (context.error) return context.error;
  const parsed = z.object({ redirect_uri: z.string().max(2048), state: z.string().max(512) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid connection request." }, { status: 400 });
  const program = context.program!;
  const extra = program.extra as { redirectAllowList?: string[] };
  const redirect = allowedRedirect(parsed.data.redirect_uri, extra.redirectAllowList ?? [], getAppOrigin());
  if (!redirect) return NextResponse.json({ error: "Redirect is not allowed for this partner." }, { status: 400 });
  try {
    const record = await programRecord(program, context.wallet!);
    if (!record) throw new ProgramError("VERIFY_STUDENT", 403, "Get your UniPass first.");
    const nullifier = programNullifier(program, context.wallet!, record);
    const existing = await db.programStamp.findUnique({ where: { programId_nullifier: { programId: program.id, nullifier } } });
    let alreadyStamped = Boolean(existing);
    let txHash: string | null = existing?.chainTx ?? null;
    if (!alreadyStamped) { try { txHash = (await stampProgram({ program, session: { wallet: context.wallet! } })).txHash; } catch (error) { if (!(error instanceof ProgramError && error.code === "ALREADY_STAMPED")) throw error; alreadyStamped = true; } }
    const issuedAt = Math.floor(Date.now() / 1000);
    const attestation = { programId: program.id, chainProgramId: program.chainProgramId!, nullifier, school: schoolLabel(record.senderDomain), issuedAt, expiresAt: Math.min(issuedAt + 600, Math.floor(record.expiresAt.getTime() / 1000)), contract: programAddress()! };
    const signature = await signAttestation(process.env.UNIPASS_REGISTRATION_ISSUER_PRIVATE_KEY!, attestation);
    redirect.searchParams.set("attestation", Buffer.from(JSON.stringify(attestation)).toString("base64url"));
    redirect.searchParams.set("signature", signature); redirect.searchParams.set("state", parsed.data.state);
    if (txHash) redirect.searchParams.set("tx", txHash);
    return NextResponse.json({ redirect: redirect.toString(), attestation, signature, alreadyStamped, txHash });
  } catch (error) { const response = programResponse(error); return NextResponse.json(response.body, { status: response.status }); }
}

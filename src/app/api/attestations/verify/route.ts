import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyAttestation } from "@/lib/programs/attestation.mjs";
import { programAddress, programContract, programProvider } from "@/lib/contracts/program";
const schema = z.object({ attestation: z.object({ programId: z.string(), chainProgramId: z.string().regex(/^\d+$/), nullifier: z.string().regex(/^0x[0-9a-fA-F]{64}$/), school: z.string(), issuedAt: z.number().int(), expiresAt: z.number().int(), contract: z.string() }), signature: z.string().regex(/^0x[0-9a-fA-F]+$/) });
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ valid: false, issuer: null, onChain: false }, { status: 400 });
  const issuer = process.env.REGISTRATION_ISSUER_ADDRESS || process.env.NEXT_PUBLIC_REGISTRATION_ISSUER_ADDRESS;
  if (!issuer || !programAddress()) return NextResponse.json({ valid: false, issuer: issuer ?? null, onChain: false }, { status: 503 });
  const a = parsed.data.attestation;
  let valid = false; try { valid = a.contract.toLowerCase() === programAddress()!.toLowerCase() && a.issuedAt <= Math.floor(Date.now() / 1000) && a.expiresAt > Math.floor(Date.now() / 1000) && verifyAttestation(a, parsed.data.signature, issuer); } catch {}
  if (!valid) return NextResponse.json({ valid: false, issuer, onChain: false });
  const provider = programProvider();
  try { const onChain = Boolean(await programContract(provider).nullifierUsed(BigInt(a.chainProgramId), a.nullifier)); return NextResponse.json({ valid, issuer, onChain }); }
  catch { return NextResponse.json({ valid, issuer, onChain: false }, { status: 503 }); }
  finally { await provider.destroy(); }
}

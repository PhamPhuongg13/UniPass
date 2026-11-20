import { Wallet, ZeroAddress, id, toBeHex, zeroPadValue } from "ethers";
import type { Program, StudentEligibility } from "@prisma/client";
import { db } from "@/lib/db";
import { checkEligibility } from "@/lib/eligibility/policy.mjs";
import { deriveProgramNullifier, deriveWalletNullifier, getNullifierSecret } from "@/lib/eligibility/nullifier.mjs";
import { buildStampAuthorization, STAMP_AUTH_TYPES } from "@/lib/contracts/program-authorization.mjs";
import { programAddress, programContract, programProvider, programRelayer } from "@/lib/contracts/program";
import { withRelayerLock } from "@/lib/contracts/relayer-lock";
import { FUJI_CHAIN_ID } from "@/lib/web3/client";

export type ProgramSession = { wallet: string };
export class ProgramError extends Error { constructor(public code: string, public status: number, message: string) { super(message); } }
export function programNullifier(program: Program, wallet: string, record: StudentEligibility | null) {
  if (!program.chainProgramId || !programAddress()) throw new ProgramError("NOT_CONFIGURED", 503, "Program is not on Avalanche.");
  const secret = getNullifierSecret();
  const base = program.eligibility === "OPEN" ? deriveWalletNullifier(secret, wallet) : record?.emailNullifier;
  if (!base) throw new ProgramError("VERIFY_STUDENT", 403, "Get your UniPass before joining.");
  return deriveProgramNullifier(secret, base, { chainId: FUJI_CHAIN_ID, contract: programAddress()!, programId: program.chainProgramId });
}
export async function programRecord(program: Program, wallet: string) {
  const record = program.eligibility === "OPEN" ? null : await db.studentEligibility.findUnique({ where: { wallet } });
  const policy = checkEligibility(program.eligibility, program.allowedSchoolDomains, record);
  if (!policy.eligible) throw new ProgramError(policy.reason, 403, policy.reason === "SCHOOL_NOT_ALLOWED" ? "Your school is not eligible." : "Get your UniPass with a school email first.");
  return record;
}
export async function stampProgram({ program, session, attemptOnChain = false }: { program: Program; session: ProgramSession; attemptOnChain?: boolean }) {
  if (!program.chainProgramId || !programAddress() || !process.env.UNIPASS_REGISTRATION_ISSUER_PRIVATE_KEY) throw new ProgramError("NOT_CONFIGURED", 503, "Programs contract or issuer is not configured.");
  if (program.closesAt <= new Date()) throw new ProgramError("CLOSED", 409, "This program is closed.");
  const record = await programRecord(program, session.wallet);
  const nullifier = programNullifier(program, session.wallet, record);
  const provider = programProvider();
  try {
    if (Number((await provider.getNetwork()).chainId) !== FUJI_CHAIN_ID) throw new Error("Wrong chain");
    const contract = programContract(programRelayer(provider));
    const issuer = new Wallet(process.env.UNIPASS_REGISTRATION_ISSUER_PRIVATE_KEY);
    if (String(await contract.issuer()).toLowerCase() !== issuer.address.toLowerCase()) throw new Error("Issuer mismatch");
    const mirror = await db.programStamp.findUnique({ where: { programId_nullifier: { programId: program.id, nullifier } } });
    const used = Boolean(mirror) || Boolean(await contract.nullifierUsed(BigInt(program.chainProgramId), nullifier));
    // The chain already holds this stamp but our database lost the record (e.g. another app instance stamped it).
    // Rebuild the record from the on-chain Stamped event instead of leaving the student stuck.
    if (used && !mirror && !attemptOnChain) {
      const chainTx = await findStampTx(provider, program.chainProgramId, nullifier);
      if (chainTx) {
        await db.programStamp.upsert({ where: { programId_nullifier: { programId: program.id, nullifier } }, create: { programId: program.id, nullifier, chainTx, recipientWallet: program.kind === "GIVEAWAY" ? session.wallet : null }, update: {} });
        return { rejected: false, txHash: chainTx, nullifier, recovered: true };
      }
    }
    if (used && !attemptOnChain) throw new ProgramError("ALREADY_STAMPED", 409, "This passport already has this stamp.");
    const recipient = program.kind === "GIVEAWAY" ? session.wallet : ZeroAddress;
    const { domain, authorization } = buildStampAuthorization({ programId: program.chainProgramId, nullifier, recipient, verifyingContract: programAddress()! });
    const signature = await issuer.signTypedData(domain, STAMP_AUTH_TYPES, authorization);
    const result = await withRelayerLock(async tx => {
      if (program.kind === "GIVEAWAY" && !used) { const p = await contract.getProgram(BigInt(program.chainProgramId!)); if (BigInt(p.budget) < BigInt(program.amountPerClaim)) throw new ProgramError("BUDGET_EXHAUSTED", 409, "Program budget exhausted"); }
      if (!used && await contract.nullifierUsed(BigInt(program.chainProgramId!), nullifier)) throw new ProgramError("ALREADY_STAMPED", 409, "This passport already has this stamp.");
      const sent = await contract.stamp(authorization, signature, ...(used ? [{ gasLimit: BigInt(300_000) }] : []));
      try { const receipt = await sent.wait(1); if (!receipt || receipt.status !== 1) { if (used) return { rejected: true, txHash: sent.hash as string, nullifier }; throw new Error("Stamp failed"); } }
      catch (error) { if (used) return { rejected: true, txHash: sent.hash as string, nullifier }; throw error; }
      if (!used) await tx.programStamp.create({ data: { programId: program.id, nullifier, chainTx: sent.hash, recipientWallet: recipient === ZeroAddress ? null : session.wallet } });
      return { rejected: false, txHash: sent.hash as string, nullifier };
    });
    return result;
  } finally { await provider.destroy(); }
}
const STAMPED_TOPIC = id("Stamped(uint256,bytes32,address)");
async function findStampTx(provider: ReturnType<typeof programProvider>, chainProgramId: string, nullifier: string) {
  const latest = await provider.getBlockNumber();
  const topics = [STAMPED_TOPIC, zeroPadValue(toBeHex(BigInt(chainProgramId)), 32), nullifier];
  for (let to = latest, i = 0; i < 60 && to > 0; i++, to -= 2048) {
    const logs = await provider.getLogs({ address: programAddress()!, topics, fromBlock: Math.max(0, to - 2047), toBlock: to }).catch(() => []);
    if (logs.length) return logs[logs.length - 1].transactionHash;
  }
  return null;
}
export async function programView(program: Program, wallet: string | null) {
  let stampCount = await db.programStamp.count({ where: { programId: program.id } });
  let source = "mirror";
  let budget: string | null = null;
  if (program.chainProgramId && programAddress()) { const provider = programProvider(); try { const contract = programContract(provider); const onchain = await contract.getProgram(BigInt(program.chainProgramId)); stampCount = Number(await contract.stampCount(BigInt(program.chainProgramId))); budget = String(onchain.budget); source = "chain"; } catch {} finally { await provider.destroy(); } }
  let hasStamped = false; let stampTx: string | null = null;
  if (wallet && program.chainProgramId && programAddress()) {
    try { const record = await programRecord(program, wallet); const nullifier = programNullifier(program, wallet, record); const mirror = await db.programStamp.findUnique({ where: { programId_nullifier: { programId: program.id, nullifier } } }); hasStamped = Boolean(mirror); stampTx = mirror?.chainTx ?? null; if (!hasStamped && program.kind !== "DISCOUNT") { const provider = programProvider(); try { hasStamped = Boolean(await programContract(provider).nullifierUsed(BigInt(program.chainProgramId), nullifier)); } finally { await provider.destroy(); } } } catch {}
  }
  return { ...program, stampCount, source, remaining: Math.max(0, program.cap - stampCount), budget, hasStamped, stampTx };
}
export function programResponse(error: unknown) { return error instanceof ProgramError ? { status: error.status, body: { code: error.code, error: error.message } } : { status: 503, body: { error: "Program action could not be recorded on Avalanche. Please retry." } }; }

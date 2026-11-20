import { randomBytes } from "node:crypto";
import { ProgramKind } from "@prisma/client";
import { Contract, Interface } from "ethers";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getRequestOrigin, getSessionWallet } from "@/lib/auth";
import { programInput } from "@/lib/programs/input.mjs";
import { programAddress, programContract, programProvider, programRelayer, PROGRAM_ABI } from "@/lib/contracts/program";
import { withRelayerLock } from "@/lib/contracts/relayer-lock";
import { programView } from "@/lib/programs/server";
export const runtime = "nodejs";
const kinds = ["GIVEAWAY", "SCHOLARSHIP", "DISCOUNT", "ECOSYSTEM"];
export async function GET(request: Request) {
  try { const wallet = await getSessionWallet().catch(() => null); const kind = new URL(request.url).searchParams.get("kind"); const programs = await db.program.findMany({ where: kind && kinds.includes(kind) ? { kind: kind as ProgramKind } : {}, orderBy: { closesAt: "asc" }, take: 100 }); return NextResponse.json({ programs: await Promise.all(programs.map(program => programView(program, wallet))) }, { headers: { "Cache-Control": "no-store" } }); }
  catch { return NextResponse.json({ error: "Programs are temporarily unavailable." }, { status: 503 }); }
}
export async function POST(request: Request) {
  try { if (!getRequestOrigin(request)) return NextResponse.json({ error: "Invalid origin." }, { status: 403 }); } catch { return NextResponse.json({ error: "APP_ORIGIN is not configured." }, { status: 503 }); }
  const wallet = await getSessionWallet().catch(() => null);
  if (!wallet) return NextResponse.json({ error: "Sign in to create a program." }, { status: 401 });
  if (!programAddress() || !process.env.POLL_RELAYER_PRIVATE_KEY) return NextResponse.json({ error: "Programs contract or relayer is not configured." }, { status: 503 });
  const parsed = programInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Check the program details.", details: parsed.error.flatten() }, { status: 400 });
  const data = parsed.data;
  const provider = programProvider();
  try {
    if (Number((await provider.getNetwork()).chainId) !== 43113) throw new Error("Wrong chain");
    const relayer = programRelayer(provider); const contract = programContract(relayer);
    if (!await contract.hasRole(await contract.OPERATOR_ROLE(), relayer.address) || String(await contract.issuer()).toLowerCase() !== process.env.REGISTRATION_ISSUER_ADDRESS?.toLowerCase()) throw new Error("Operator or issuer mismatch");
    const { chainProgramId, chainTx, approvalTx, fundingTx } = await withRelayerLock(async () => {
      const maxAward = data.kind === "SCHOLARSHIP" ? BigInt((data.extra as { awardAmount: string }).awardAmount) : BigInt(0);
      const budget = data.kind === "GIVEAWAY" ? BigInt(data.amountPerClaim) * BigInt(data.cap) : data.kind === "SCHOLARSHIP" ? maxAward * BigInt(Math.min(data.cap, 5)) : BigInt(0);
      if (budget > BigInt(0)) { const tokenAddress = process.env.NEXT_PUBLIC_TUSDC_ADDRESS; if (!tokenAddress) throw new Error("tUSDC is not configured"); const token = new Contract(tokenAddress, ["function balanceOf(address) view returns (uint256)"], relayer); if (BigInt(await token.balanceOf(relayer.address)) < budget) throw new Error("Sponsor treasury has insufficient tUSDC"); }
      const sent = await contract.createProgram(kinds.indexOf(data.kind), data.cap, Math.floor(data.closesAt.getTime() / 1000), BigInt(data.amountPerClaim), maxAward);
      const receipt = await sent.wait(1); if (!receipt || receipt.status !== 1) throw new Error("Creation failed");
      const iface = new Interface(PROGRAM_ABI); const log = receipt.logs.map((item: { topics: string[]; data: string }) => { try { return iface.parseLog(item); } catch { return null; } }).find((item: { name: string } | null) => item?.name === "ProgramCreated");
      if (!log) throw new Error("ProgramCreated log missing");
      const chainProgramId = String(log.args.programId);
      let fundingTx: string | null = null;
      let approvalTx: string | null = null;
      if (budget > BigInt(0)) {
        const tokenAddress = process.env.NEXT_PUBLIC_TUSDC_ADDRESS;
        if (!tokenAddress) throw new Error("tUSDC is not configured");
        const token = new Contract(tokenAddress, ["function approve(address,uint256) returns (bool)", "function balanceOf(address) view returns (uint256)"], relayer);
        const approval = await token.approve(await contract.getAddress(), budget);
        if ((await approval.wait(1))?.status !== 1) throw new Error("Approval failed");
        approvalTx = approval.hash as string;
        const funding = await contract.fundProgram(BigInt(chainProgramId), budget);
        if ((await funding.wait(1))?.status !== 1) throw new Error("Funding failed");
        fundingTx = funding.hash as string;
      }
      return { chainProgramId, chainTx: sent.hash as string, approvalTx, fundingTx };
    });
    const slug = `${data.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60)}-${randomBytes(3).toString("hex")}`;
    const program = await db.program.create({ data: { ...data, slug, chainProgramId, chainTx, approvalTx, fundingTx, createdByWallet: wallet, allowedSchoolDomains: data.eligibility === "SCHOOLS" ? data.allowedSchoolDomains : [] } });
    return NextResponse.json({ program }, { status: 201 });
  } catch { return NextResponse.json({ error: "Could not create program on Avalanche. Check relayer configuration and balance." }, { status: 503 }); }
  finally { await provider.destroy(); }
}

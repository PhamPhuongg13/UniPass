import { Wallet } from "ethers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getRequestOrigin, getSessionWallet } from "@/lib/auth";
import { pollAddress, pollContract, pollProvider, pollRelayer } from "@/lib/contracts/poll";
import { buildVoteAuthorization, VOTE_AUTH_TYPES } from "@/lib/contracts/poll-authorization.mjs";
import { derivePollNullifier, deriveWalletNullifier, getNullifierSecret } from "@/lib/eligibility/nullifier.mjs";
import { checkEligibility } from "@/lib/eligibility/policy.mjs";
import { FUJI_CHAIN_ID } from "@/lib/web3/client";
import { withRelayerLock } from "@/lib/contracts/relayer-lock";
export const runtime = "nodejs";
const bodySchema = z.object({ option: z.number().int().min(0).max(9) });
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { if (!getRequestOrigin(request)) return NextResponse.json({ error: "Invalid origin." }, { status: 403 }); } catch { return NextResponse.json({ error: "APP_ORIGIN is not configured." }, { status: 503 }); }
  const wallet = await getSessionWallet().catch(() => null);
  if (!wallet) return NextResponse.json({ error: "Sign in to vote." }, { status: 401 });
  if (!pollAddress() || !process.env.POLL_RELAYER_PRIVATE_KEY || !process.env.UNIPASS_REGISTRATION_ISSUER_PRIVATE_KEY) return NextResponse.json({ error: "Poll contract, relayer or issuer is not configured." }, { status: 503 });
  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a valid option." }, { status: 400 });
  const poll = await db.poll.findFirst({ where: { OR: [{ id }, { slug: id }] } });
  if (!poll || !poll.chainPollId) return NextResponse.json({ error: "Poll not found on Avalanche." }, { status: 404 });
  if (poll.closesAt <= new Date()) return NextResponse.json({ error: "This poll is closed." }, { status: 409 });
  if (parsed.data.option >= poll.options.length) return NextResponse.json({ error: "Choose a valid option." }, { status: 400 });
  const record = poll.eligibility === "OPEN" ? null : await db.studentEligibility.findUnique({ where: { wallet } });
  const policy = checkEligibility(poll.eligibility, poll.allowedSchoolDomains, record);
  if (!policy.eligible) return NextResponse.json({ error: policy.reason === "SCHOOL_NOT_ALLOWED" ? "Your verified school is not eligible for this poll." : "Get your UniPass with a school email before voting.", code: policy.reason }, { status: 403 });
  const secret = getNullifierSecret();
  const base = record?.emailNullifier ?? deriveWalletNullifier(secret, wallet);
  const nullifier = derivePollNullifier(secret, base, { chainId: FUJI_CHAIN_ID, contract: pollAddress()!, pollId: poll.chainPollId });
  const provider = pollProvider();
  try {
    if (Number((await provider.getNetwork()).chainId) !== FUJI_CHAIN_ID) throw new Error("Wrong chain");
    const contract = pollContract(pollRelayer(provider));
    const issuer = new Wallet(process.env.UNIPASS_REGISTRATION_ISSUER_PRIVATE_KEY!);
    if (String(await contract.issuer()).toLowerCase() !== issuer.address.toLowerCase()) throw new Error("Issuer mismatch");
    const mirror = await db.pollVoteMirror.findUnique({ where: { pollId_voterNullifier: { pollId: poll.id, voterNullifier: nullifier } } });
    const used = Boolean(mirror) || Boolean(await contract.voterNullifierUsed(BigInt(poll.chainPollId), nullifier));
    const attemptOnChain = new URL(request.url).searchParams.get("attemptOnChain") === "1";
    if (used && !attemptOnChain) return NextResponse.json({ code: "ALREADY_VOTED", error: "This passport has already voted in this poll." }, { status: 409 });
    const { domain, authorization } = buildVoteAuthorization({ pollId: poll.chainPollId, option: parsed.data.option, voterNullifier: nullifier, verifyingContract: pollAddress()! });
    const signature = await issuer.signTypedData(domain, VOTE_AUTH_TYPES, authorization);
    const result = await withRelayerLock(async tx => {
      if (!used && await contract.voterNullifierUsed(BigInt(poll.chainPollId!), nullifier)) return { alreadyVoted: true };
      const sent = await contract.vote(authorization, signature, ...(used ? [{ gasLimit: BigInt(250_000) }] : []));
      try {
        const receipt = await sent.wait(1);
        if (!receipt || receipt.status !== 1) return { rejected: true, txHash: sent.hash as string };
      } catch { if (used) return { rejected: true, txHash: sent.hash as string }; throw new Error("Vote transaction failed"); }
      if (used) return { rejected: false, txHash: sent.hash as string };
      await tx.pollVoteMirror.create({ data: { pollId: poll.id, option: parsed.data.option, voterNullifier: nullifier, chainTx: sent.hash } });
      return { txHash: sent.hash as string };
    });
    if ("alreadyVoted" in result) return NextResponse.json({ code: "ALREADY_VOTED", error: "This passport has already voted in this poll." }, { status: 409 });
    return NextResponse.json(result);
  } catch { return NextResponse.json({ error: "Vote could not be recorded on Avalanche. Please retry." }, { status: 503 }); }
  finally { await provider.destroy(); }
}

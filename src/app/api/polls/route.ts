import { randomBytes } from "node:crypto";
import { Interface } from "ethers";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getRequestOrigin, getSessionWallet } from "@/lib/auth";
import { pollInput } from "@/lib/polls/input.mjs";
import { pollAddress, pollContract, pollProvider, pollRelayer, POLL_ABI } from "@/lib/contracts/poll";
import { pollView } from "@/lib/polls/server";
import { withRelayerLock } from "@/lib/contracts/relayer-lock";
export const runtime = "nodejs";
export async function GET() {
  try { const wallet = await getSessionWallet().catch(() => null); const polls = await db.poll.findMany({ orderBy: { closesAt: "asc" }, take: 100 }); return NextResponse.json({ polls: await Promise.all(polls.map(poll => pollView(poll, wallet))) }, { headers: { "Cache-Control": "no-store" } }); }
  catch { return NextResponse.json({ error: "Polls are temporarily unavailable." }, { status: 503 }); }
}
export async function POST(request: Request) {
  try { if (!getRequestOrigin(request)) return NextResponse.json({ error: "Invalid origin." }, { status: 403 }); } catch { return NextResponse.json({ error: "APP_ORIGIN is not configured." }, { status: 503 }); }
  const wallet = await getSessionWallet().catch(() => null);
  if (!wallet) return NextResponse.json({ error: "Sign in to create a poll." }, { status: 401 });
  if (!pollAddress() || !process.env.POLL_RELAYER_PRIVATE_KEY) return NextResponse.json({ error: "Poll contract or relayer is not configured." }, { status: 503 });
  const parsed = pollInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Check the poll details.", details: parsed.error.flatten() }, { status: 400 });
  const provider = pollProvider();
  try {
    if (Number((await provider.getNetwork()).chainId) !== 43113) throw new Error("Wrong chain");
    const relayer = pollRelayer(provider);
    const contract = pollContract(relayer);
    const issuer = process.env.REGISTRATION_ISSUER_ADDRESS;
    if (!issuer || String(await contract.issuer()).toLowerCase() !== issuer.toLowerCase() || String(await contract.owner()).toLowerCase() !== relayer.address.toLowerCase()) throw new Error("Poll owner or issuer mismatch");
    const { pollId, txHash } = await withRelayerLock(async () => {
      const sent = await contract.createPoll(parsed.data.options.length, Math.floor(parsed.data.closesAt.getTime() / 1000));
      const receipt = await sent.wait(1);
      if (!receipt || receipt.status !== 1) throw new Error("Poll creation failed");
      const iface = new Interface(POLL_ABI);
      const created = receipt.logs.map((log: { topics: string[]; data: string }) => { try { return iface.parseLog(log); } catch { return null; } }).find((log: { name: string } | null) => log?.name === "PollCreated");
      if (!created) throw new Error("PollCreated log missing");
      return { pollId: String(created.args.pollId), txHash: sent.hash as string };
    });
    const slug = `${parsed.data.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60)}-${randomBytes(3).toString("hex")}`;
    const poll = await db.poll.create({ data: { ...parsed.data, allowedSchoolDomains: parsed.data.eligibility === "SCHOOLS" ? parsed.data.allowedSchoolDomains : [], slug, chainPollId: pollId, chainTx: txHash, createdByWallet: wallet } });
    return NextResponse.json({ poll }, { status: 201 });
  } catch { return NextResponse.json({ error: "Could not create poll on Avalanche. Check relayer configuration and balance." }, { status: 503 }); }
  finally { await provider.destroy(); }
}

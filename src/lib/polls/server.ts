import { db } from "@/lib/db";
import { getSessionWallet } from "@/lib/auth";
import { pollAddress, pollContract, pollProvider } from "@/lib/contracts/poll";
import { derivePollNullifier, deriveWalletNullifier, getNullifierSecret } from "@/lib/eligibility/nullifier.mjs";
import { checkEligibility } from "@/lib/eligibility/policy.mjs";
import { FUJI_CHAIN_ID } from "@/lib/web3/client";

export async function pollView(poll: { id: string; slug: string; title: string; description: string; options: string[]; eligibility: string; allowedSchoolDomains: string[]; closesAt: Date; chainPollId: string | null; chainTx: string | null; createdAt: Date }, wallet: string | null) {
  const fallback = await db.pollVoteMirror.groupBy({ by: ["option"], where: { pollId: poll.id }, _count: { _all: true } });
  let results = poll.options.map((_, i) => fallback.find(row => row.option === i)?._count._all ?? 0);
  let resultSource = "mirror";
  let chainOpen: boolean | null = null;
  if (poll.chainPollId && pollAddress()) {
    const provider = pollProvider();
    try { const contract = pollContract(provider); const [counts, state] = await Promise.all([contract.getResults(BigInt(poll.chainPollId)), contract.getPoll(BigInt(poll.chainPollId))]); results = counts.map((n: bigint) => Number(n)); chainOpen = !Boolean(state.closed) && Number(state.closesAt) * 1000 > Date.now(); resultSource = "chain"; }
    catch { /* retain mirror counts */ }
    finally { await provider.destroy(); }
  }
  let hasVoted = false;
  let voteTx: string | null = null;
  let eligible = poll.eligibility === "OPEN";
  if (wallet) {
    const record = poll.eligibility === "OPEN" ? null : await db.studentEligibility.findUnique({ where: { wallet } });
    eligible = checkEligibility(poll.eligibility, poll.allowedSchoolDomains, record).eligible;
    if (eligible && poll.chainPollId && pollAddress()) {
      const base = record?.emailNullifier ?? deriveWalletNullifier(getNullifierSecret(), wallet);
      const nullifier = derivePollNullifier(getNullifierSecret(), base, { chainId: FUJI_CHAIN_ID, contract: pollAddress()!, pollId: poll.chainPollId });
      const mirror = await db.pollVoteMirror.findUnique({ where: { pollId_voterNullifier: { pollId: poll.id, voterNullifier: nullifier } } });
      hasVoted = Boolean(mirror); voteTx = mirror?.chainTx ?? null;
      if (!hasVoted) { const provider = pollProvider(); try { hasVoted = Boolean(await pollContract(provider).voterNullifierUsed(BigInt(poll.chainPollId), nullifier)); } catch {} finally { await provider.destroy(); } }
    }
  }
  return { ...poll, results, resultSource, totalVotes: results.reduce((a, b) => a + b, 0), hasVoted, voteTx, eligible, open: poll.closesAt > new Date() && chainOpen !== false };
}
export async function sessionPollView(poll: Parameters<typeof pollView>[0]) { return pollView(poll, await getSessionWallet().catch(() => null)); }

import { db } from "@/lib/db";
import { getSessionWallet } from "@/lib/auth";
import { eventCard } from "@/lib/events/server";
import { pollView } from "@/lib/polls/server";
import { programView } from "@/lib/programs/server";
import { schoolLabel } from "@/lib/schools";
import { pollAddress } from "@/lib/contracts/poll";
import { programAddress } from "@/lib/contracts/program";
import { derivePollNullifier, deriveProgramNullifier, deriveWalletNullifier, getNullifierSecret } from "@/lib/eligibility/nullifier.mjs";

export async function homeEvents() {
  const rows = await db.eventMetadata.findMany({
    where: { visibility: "PUBLIC", syncStatus: "SYNCED", chainEventId: { not: null }, startsAt: { gte: new Date() } },
    include: { organizer: { select: { name: true } } }, orderBy: { startsAt: "asc" }, take: 3,
  }).catch(() => []);
  return rows.map(row => ({ card: eventCard(row), chainEventId: row.chainEventId! }));
}

export async function homePoll(wallet: string | null) {
  const now = new Date();
  const [open, closed] = await Promise.all([
    db.poll.findMany({ where: { chainPollId: { not: null }, closesAt: { gt: now } }, orderBy: { createdAt: "desc" }, take: 5 }).catch(() => []),
    db.poll.findFirst({ where: { chainPollId: { not: null }, closesAt: { lte: now } }, orderBy: { createdAt: "desc" } }).catch(() => null),
  ]);
  for (const row of open) {
    const view = await pollView(row, wallet).catch(() => null);
    if (view?.open) return { ...view, closesAt: view.closesAt.toISOString(), createdAt: view.createdAt.toISOString() };
  }
  const fallback = closed ?? open[0];
  if (!fallback) return null;
  const view = await pollView(fallback, wallet).catch(() => null);
  return view ? { ...view, open: false, closesAt: view.closesAt.toISOString(), createdAt: view.createdAt.toISOString() } : null;
}

export async function homePrograms(kind: "GIVEAWAY" | "SCHOLARSHIP" | "DISCOUNT", wallet: string | null, take: number) {
  const rows = await db.program.findMany({
    where: { kind, chainProgramId: { not: null }, closesAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" }, take: 5,
  }).catch(() => []);
  const views = await Promise.all(rows.map(row => programView(row, wallet).catch(() => null)));
  return views.filter((view): view is NonNullable<typeof view> => view !== null && (view.remaining > 0 || view.hasStamped)).slice(0, take).map(view => ({
    id: view.id, slug: view.slug, kind: view.kind, title: view.title, description: view.description,
    sponsor: view.sponsor, extra: view.extra, amountPerClaim: view.amountPerClaim,
    cap: view.cap, budget: view.budget, stampCount: view.stampCount, remaining: view.remaining,
    hasStamped: view.hasStamped, stampTx: view.stampTx,
  }));
}

export async function homePartnerProgram() {
  return db.program.findFirst({ where: { kind: "ECOSYSTEM", title: { contains: "Builder Quest", mode: "insensitive" } }, orderBy: { createdAt: "desc" }, select: { id: true } }).catch(() => null);
}

export async function homePassport(wallet: string | null) {
  if (!wallet) return null;
  const record = await db.studentEligibility.findUnique({ where: { wallet } }).catch(() => null);
  if (!record?.emailNullifier || record.revokedAt || record.expiresAt <= new Date()) return { active: false } as const;
  const [zk, tickets, polls, programs] = await Promise.all([
    db.zkEmailAttestation.findUnique({ where: { wallet }, select: { domain: true } }).catch(() => null),
    db.ticketMirror.count({ where: { ownerWallet: wallet } }).catch(() => 0),
    pollAddress() ? db.poll.findMany({ where: { chainPollId: { not: null } }, select: { id: true, chainPollId: true, eligibility: true } }).catch(() => []) : Promise.resolve([]),
    programAddress() ? db.program.findMany({ where: { chainProgramId: { not: null } }, select: { id: true, chainProgramId: true, eligibility: true } }).catch(() => []) : Promise.resolve([]),
  ]);
  let votes = 0; let stamps = 0;
  let pollKeys: { pollId: string; voterNullifier: string }[] = [];
  let programKeys: { programId: string; nullifier: string }[] = [];
  try {
    const secret = getNullifierSecret();
    const walletNullifier = deriveWalletNullifier(secret, wallet);
    if (pollAddress() && polls.length) {
      pollKeys = polls.map(poll => ({ pollId: poll.id, voterNullifier: derivePollNullifier(secret, poll.eligibility === "OPEN" ? walletNullifier : record.emailNullifier!, { chainId: 43113, contract: pollAddress()!, pollId: poll.chainPollId! }) }));
      votes = await db.pollVoteMirror.count({ where: { OR: pollKeys } }).catch(() => 0);
    }
    if (programAddress() && programs.length) {
      programKeys = programs.map(program => ({ programId: program.id, nullifier: deriveProgramNullifier(secret, program.eligibility === "OPEN" ? walletNullifier : record.emailNullifier!, { chainId: 43113, contract: programAddress()!, programId: program.chainProgramId! }) }));
      stamps = await db.programStamp.count({ where: { OR: programKeys } }).catch(() => 0);
    }
  } catch { /* A missing nullifier secret must not hide the passport. */ }
  const [recentTickets, recentVotes, recentPrograms] = await Promise.all([
    db.ticketMirror.findMany({ where: { ownerWallet: wallet, chainTx: { not: null } }, include: { event: { select: { title: true } } }, orderBy: { mintedAt: "desc" }, take: 4 }).catch(() => []),
    pollKeys.length ? db.pollVoteMirror.findMany({ where: { OR: pollKeys }, include: { poll: { select: { title: true } } }, orderBy: { createdAt: "desc" }, take: 4 }).catch(() => []) : Promise.resolve([]),
    db.programStamp.findMany({ where: { OR: [{ recipientWallet: wallet }, ...(programKeys.length ? [{ OR: programKeys }] : [])] }, include: { program: { select: { title: true, kind: true } } }, orderBy: { createdAt: "desc" }, take: 4 }).catch(() => []),
  ]);
  const recentStamps = [
    ...recentTickets.filter(row => row.chainTx).map(row => ({ title: row.event.title, kind: "Event", txHash: row.chainTx!, at: row.mintedAt?.getTime() ?? 0 })),
    ...recentVotes.map(row => ({ title: row.poll.title, kind: "Poll", txHash: row.chainTx, at: row.createdAt.getTime() })),
    ...recentPrograms.map(row => ({ title: row.program.title, kind: row.program.kind.toLowerCase(), txHash: row.chainTx, at: row.createdAt.getTime() })),
  ].sort((a, b) => b.at - a.at).slice(0, 4).map(({ title, kind, txHash }) => ({ title, kind, txHash }));
  return { active: true, school: schoolLabel(record.senderDomain), expiresAt: record.expiresAt.toISOString(), stampCount: tickets + votes + stamps, zkDomain: zk?.domain ?? null, recentStamps } as const;
}

export async function homeLiveData() {
  const wallet = await getSessionWallet().catch(() => null);
  const [events, poll, giveaways, scholarships, discounts, partner, passport] = await Promise.all([
    homeEvents().catch(() => []), homePoll(wallet).catch(() => null),
    homePrograms("GIVEAWAY", wallet, 1).catch(() => []), homePrograms("SCHOLARSHIP", wallet, 1).catch(() => []),
    homePrograms("DISCOUNT", wallet, 2).catch(() => []), homePartnerProgram().catch(() => null), homePassport(wallet).catch(() => null),
  ]);
  return { wallet, events, poll, giveaways, scholarships, discounts, partner, passport };
}

export async function homeStats() {
  const now = new Date();
  const [verified, programStamps, pollVotes, registrations, ticketStamps, proofs, latestProof] = await Promise.all([
    db.studentEligibility.count({ where: { revokedAt: null, expiresAt: { gt: now } } }).catch(() => null),
    db.programStamp.count().catch(() => null),
    db.pollVoteMirror.count().catch(() => null),
    db.registrationMirror.findMany({ where: { status: "MINTED", chainTx: { not: null } }, select: { chainTx: true } }).catch(() => null),
    db.ticketMirror.findMany({ where: { chainTx: { not: null } }, select: { chainTx: true } }).catch(() => null),
    db.zkEmailAttestation.count().catch(() => null),
    db.zkEmailAttestation.findFirst({ orderBy: { createdAt: "desc" }, select: { txHash: true } }).catch(() => null),
  ]);
  let studentsStamped: number | null = null;
  if (verified === 0) {
    const [ticketWallets, registrationWallets, programWallets] = await Promise.all([
      db.ticketMirror.findMany({ distinct: ["ownerWallet"], select: { ownerWallet: true } }).catch(() => null),
      db.registrationMirror.findMany({ where: { status: "MINTED" }, distinct: ["wallet"], select: { wallet: true } }).catch(() => null),
      db.programStamp.findMany({ where: { recipientWallet: { not: null } }, distinct: ["recipientWallet"], select: { recipientWallet: true } }).catch(() => null),
    ]);
    if (ticketWallets && registrationWallets && programWallets) studentsStamped = new Set([...ticketWallets.map(row => row.ownerWallet), ...registrationWallets.map(row => row.wallet), ...programWallets.map(row => row.recipientWallet).filter((value): value is string => Boolean(value))].map(value => value.toLowerCase())).size;
  }
  const configured = [
    ["Event manager", process.env.NEXT_PUBLIC_EVENT_MANAGER_ADDRESS || process.env.NEXT_PUBLIC_EVENT_MANAGER_V2_ADDRESS],
    ["Ticket", process.env.NEXT_PUBLIC_TICKET_ADDRESS],
    ["Poll", process.env.NEXT_PUBLIC_POLL_ADDRESS],
    ["Programs V2", process.env.NEXT_PUBLIC_PROGRAMS_ADDRESS],
    ["Treasury & admin — Safe 2-of-3", process.env.NEXT_PUBLIC_SAFE_ADDRESS],
    ["zkEmail", process.env.NEXT_PUBLIC_ZKEMAIL_ADDRESS],
    ["SP1 verifier", process.env.NEXT_PUBLIC_SP1_VERIFIER_ADDRESS],
  ] as const;
  const contracts = configured.filter(([, address]) => /^0x[0-9a-fA-F]{40}$/.test(address ?? "")).map(([name, address]) => ({ name, address: address! }));
  return {
    passports: verified === 0 ? studentsStamped : verified,
    passportLabel: verified === 0 ? (studentsStamped === 1 ? "student stamped" : "students stamped") : (verified === 1 ? "verified passport" : "verified passports"),
    stamps: programStamps === null || pollVotes === null || registrations === null || ticketStamps === null ? null : programStamps + pollVotes + new Set([...registrations, ...ticketStamps].map(row => row.chainTx).filter(Boolean)).size,
    contracts,
    proofs,
    latestProofTx: latestProof?.txHash ?? null,
  };
}

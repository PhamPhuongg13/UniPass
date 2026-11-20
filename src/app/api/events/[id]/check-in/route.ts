import { Contract, JsonRpcProvider } from "ethers";
import { fujiProvider } from "@/lib/contracts/rpc";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getRequestOrigin, getSessionWallet } from "@/lib/auth";
import { canCheckInEvent } from "@/lib/contracts/check-in-staff";
import { FUJI_CHAIN_ID } from "@/lib/web3/client";
import { EVENT_MANAGER_ADDRESS, TICKET_ABI, TICKET_ADDRESS, ticketInterface } from "@/lib/contracts/chain";
import { hashTicketCheckInCredential, readTicketCheckInCredential } from "@/lib/tickets/check-in-credential.mjs";

export const runtime = "nodejs";
const input = z.object({ tokenId: z.string().regex(/^\d{1,78}$/), chainTx: z.string().regex(/^0x[0-9a-fA-F]{64}$/), credential: z.string().max(96) }).strict();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!getRequestOrigin(request)) return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  } catch { return NextResponse.json({ error: "APP_ORIGIN is not configured." }, { status: 503 }); }
  const wallet = await getSessionWallet();
  if (!wallet) return NextResponse.json({ error: "Sign in with the organizer wallet." }, { status: 401 });
  const { id } = await params;
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid check-in data." }, { status: 400 });
  const credentialToken = readTicketCheckInCredential(parsed.data.credential);
  if (!credentialToken) return NextResponse.json({ error: "Invalid check-in code." }, { status: 400 });
  let provider: JsonRpcProvider | undefined;
  try {
    const event = await db.eventMetadata.findUnique({ where: { id }, include: { organizer: true } });
    if (!event || !event.chainEventId || !await canCheckInEvent(event.chainEventId, wallet, event.organizer.wallet)) return NextResponse.json({ error: "On-chain event not found or you cannot check in attendees." }, { status: 404 });
    const priorAudit = await db.checkInAudit.findUnique({ where: { eventId_tokenId: { eventId: event.id, tokenId: parsed.data.tokenId } } });
    if (priorAudit?.chainTx?.toLowerCase() === parsed.data.chainTx.toLowerCase()) return NextResponse.json({ audit: priorAudit }, { status: 200 });
    if (priorAudit) return NextResponse.json({ error: "This ticket was already checked in." }, { status: 409 });
    const credential = await db.ticketCheckInCredential.findUnique({ where: { tokenHash: hashTicketCheckInCredential(credentialToken) } });
    if (!credential || credential.eventId !== event.id || credential.tokenId !== parsed.data.tokenId || credential.chainEventId !== event.chainEventId) return NextResponse.json({ error: "Check-in code does not match this ticket and event." }, { status: 401 });
    if (credential.consumedAt || credential.expiresAt <= new Date()) return NextResponse.json({ error: "Check-in code expired or was used." }, { status: 409 });
    const ownerSession = await db.authSession.findFirst({ where: { id: credential.ownerSessionId, wallet: credential.ownerWallet, expiresAt: { gt: new Date() } }, select: { id: true } });
    if (!ownerSession) return NextResponse.json({ error: "Ticket owner wallet session expired or was revoked." }, { status: 409 });
    const rpcUrl = process.env.NEXT_PUBLIC_AVALANCHE_RPC_URL || "https://api.avax-test.network/ext/bc/C/rpc";
    provider = fujiProvider();
    const receipt = await provider.getTransactionReceipt(parsed.data.chainTx);
    if (!receipt || receipt.status !== 1 || receipt.to?.toLowerCase() !== EVENT_MANAGER_ADDRESS.toLowerCase() || receipt.from.toLowerCase() !== wallet) return NextResponse.json({ error: "No successful organizer check-in transaction found on Fuji EventManager." }, { status: 400 });
    const checkInLog = receipt.logs.map(log => {
      if (log.address.toLowerCase() !== TICKET_ADDRESS.toLowerCase()) return null;
      try { return ticketInterface.parseLog({ topics: [...log.topics], data: log.data }); } catch { return null; }
    }).find(log => log?.name === "TicketCheckedIn" && String(log.args.tokenId) === parsed.data.tokenId);
    if (!checkInLog) return NextResponse.json({ error: "Transaction lacks TicketCheckedIn for this token ID." }, { status: 400 });
    const ticket = new Contract(TICKET_ADDRESS, TICKET_ABI, provider);
    const [eventIdFromTicket, ownerWallet] = await Promise.all([ticket.eventOfTicket(BigInt(parsed.data.tokenId)), ticket.ownerOf(BigInt(parsed.data.tokenId))]);
    const actualEventId = String(eventIdFromTicket);
    if (actualEventId !== event.chainEventId) return NextResponse.json({ error: "Ticket belongs to another on-chain event." }, { status: 400 });
    if (String(ownerWallet).toLowerCase() !== credential.ownerWallet) return NextResponse.json({ error: "Ticket ownership changed. Create a new check-in code from the owning wallet." }, { status: 409 });
    const block = await provider.getBlock(receipt.blockNumber);
    const checkedInAt = new Date((block?.timestamp ?? Math.floor(Date.now() / 1000)) * 1000);
    const audit = await db.$transaction(async tx => {
      const consumed = await tx.ticketCheckInCredential.updateMany({ where: { id: credential.id, consumedAt: null, expiresAt: { gt: new Date() } }, data: { consumedAt: checkedInAt, consumedBy: wallet, chainTx: parsed.data.chainTx } });
      if (consumed.count !== 1) throw new Error("CHECK_IN_CREDENTIAL_ALREADY_USED");
      await tx.ticketMirror.upsert({ where: { eventId_tokenId: { eventId: event.id, tokenId: parsed.data.tokenId } }, create: { eventId: event.id, tokenId: parsed.data.tokenId, ownerWallet: String(ownerWallet).toLowerCase(), checkedInAt }, update: { ownerWallet: String(ownerWallet).toLowerCase(), checkedInAt } });
      await tx.eventMetadata.update({ where: { id: event.id }, data: { syncStatus: "SYNCED" } });
      return tx.checkInAudit.create({ data: { eventId: event.id, tokenId: parsed.data.tokenId, staffWallet: wallet, outcome: "CHECKED_IN", chainTx: parsed.data.chainTx } });
    });
    return NextResponse.json({ audit }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "CHECK_IN_CREDENTIAL_ALREADY_USED") return NextResponse.json({ error: "Check-in code expired or was just used." }, { status: 409 });
    return NextResponse.json({ error: "Check-in was sent on-chain but its record was not saved. Reload later." }, { status: 503 });
  }
  finally { provider?.destroy(); }
}

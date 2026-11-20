import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getRequestOrigin, getSessionContext } from "@/lib/auth";
import { ticketContract, verifyContractLink, createReadOnlyFujiProvider } from "@/lib/contracts/chain";
import { hashTicketCheckInCredential, readTicketCheckInCredential } from "@/lib/tickets/check-in-credential.mjs";
import { canCheckInEvent } from "@/lib/contracts/check-in-staff";
import { FUJI_CHAIN_ID } from "@/lib/web3/client";

export const runtime = "nodejs";
const input = z.object({ credential: z.string().max(96) }).strict();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let origin: string | null;
  try { origin = getRequestOrigin(request); }
  catch { return NextResponse.json({ error: "UniPass secure origin is not configured." }, { status: 503 }); }
  if (!origin) return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  const session = await getSessionContext().catch(() => null);
  if (!session) return NextResponse.json({ error: "Sign in with the organizer wallet." }, { status: 401 });
  const { id: eventId } = await params;
  const parsed = input.safeParse(await request.json().catch(() => null));
  const token = parsed.success ? readTicketCheckInCredential(parsed.data.credential) : null;
  if (!token) return NextResponse.json({ error: "Invalid check-in code." }, { status: 400 });

  let provider: ReturnType<typeof createReadOnlyFujiProvider> | undefined;
  try {
    const event = await db.eventMetadata.findUnique({ where: { id: eventId }, include: { organizer: { select: { wallet: true } } } });
    if (!event || !event.chainEventId || !await canCheckInEvent(event.chainEventId, session.wallet, event.organizer.wallet)) return NextResponse.json({ error: "Event not found or you cannot check in attendees." }, { status: 404 });
    const credential = await db.ticketCheckInCredential.findUnique({ where: { tokenHash: hashTicketCheckInCredential(token) } });
    if (!credential || credential.eventId !== event.id || credential.chainEventId !== event.chainEventId) return NextResponse.json({ error: "Check-in code does not match this event." }, { status: 404 });
    if (credential.consumedAt || credential.expiresAt <= new Date()) return NextResponse.json({ error: "Check-in code expired or was used." }, { status: 409 });

    provider = createReadOnlyFujiProvider();
    const network = await provider.getNetwork();
    if (Number(network.chainId) !== FUJI_CHAIN_ID) return NextResponse.json({ error: "RPC is not connected to Avalanche Fuji." }, { status: 503 });
    const manager = await verifyContractLink(provider);
    const ticket = ticketContract(provider);
    const tokenId = BigInt(credential.tokenId);
    const [owner, actualEventId, checkedIn] = await Promise.all([
      ticket.ownerOf(tokenId), ticket.eventOfTicket(tokenId), ticket.checkedIn(tokenId),
    ]);
    if (String(owner).toLowerCase() !== credential.ownerWallet || String(actualEventId) !== event.chainEventId) return NextResponse.json({ error: "Ticket changed wallets or does not belong to this event." }, { status: 409 });
    if (checkedIn) return NextResponse.json({ error: "This ticket was already checked in on Fuji." }, { status: 409 });
    const chainEvent = await manager.getFunction("getEvent")(BigInt(event.chainEventId));
    if (!Boolean(chainEvent[5])) return NextResponse.json({ error: "Event is closed on Fuji." }, { status: 409 });

    return NextResponse.json({ tokenId: credential.tokenId, eventTitle: event.title, expiresAt: credential.expiresAt.toISOString() }, { headers: { "Cache-Control": "no-store, private" } });
  } catch { return NextResponse.json({ error: "Could not verify ticket code on Fuji." }, { status: 503 }); }
  finally { await provider?.destroy(); }
}

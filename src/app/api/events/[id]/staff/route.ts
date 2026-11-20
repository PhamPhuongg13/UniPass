import { Contract, getAddress, Interface } from "ethers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getRequestOrigin, getSessionWallet } from "@/lib/auth";
import { createReadOnlyFujiProvider } from "@/lib/contracts/chain";
import { FUJI_CHAIN_ID } from "@/lib/web3/client";
import { EVENT_MANAGER_V2_ADDRESS, EVENT_MANAGER_V2_ABI } from "@/lib/contracts/v2";

export const runtime = "nodejs";
const staffInput = z.object({ wallet: z.string().regex(/^0x[0-9a-fA-F]{40}$/), authorized: z.boolean(), chainTx: z.string().regex(/^0x[0-9a-fA-F]{64}$/) }).strict();
const v2Interface = new Interface(EVENT_MANAGER_V2_ABI);

async function authorizedEvent(id: string, wallet: string) {
  const event = await db.eventMetadata.findUnique({ where: { id }, include: { organizer: { select: { wallet: true } } } });
  return event && event.organizer.wallet === wallet ? event : null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const wallet = await getSessionWallet();
  if (!wallet) return NextResponse.json({ error: "Sign in with the organizer wallet." }, { status: 401 });
  try {
    const event = await authorizedEvent((await params).id, wallet);
    if (!event) return NextResponse.json({ error: "Event not found or you cannot manage it." }, { status: 404 });
    if (!event.chainEventId) return NextResponse.json({ error: "Event has not been created on Fuji." }, { status: 409 });
    const staff = await db.eventStaffMirror.findMany({ where: { eventId: event.id, authorized: true }, orderBy: { updatedAt: "desc" }, select: { wallet: true, authorized: true, chainTx: true, updatedAt: true } });
    return NextResponse.json({ staff }, { headers: { "Cache-Control": "no-store, private" } });
  } catch { return NextResponse.json({ error: "Could not load staff list." }, { status: 503 }); }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { if (!getRequestOrigin(request)) return NextResponse.json({ error: "Invalid origin." }, { status: 403 }); }
  catch { return NextResponse.json({ error: "APP_ORIGIN is not configured." }, { status: 503 }); }
  const organizer = await getSessionWallet();
  if (!organizer) return NextResponse.json({ error: "Sign in with the organizer wallet." }, { status: 401 });
  if (!EVENT_MANAGER_V2_ADDRESS) return NextResponse.json({ error: "EventManager V2 is not configured on Fuji." }, { status: 503 });
  const parsed = staffInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid permission details." }, { status: 400 });

  let provider: ReturnType<typeof createReadOnlyFujiProvider> | undefined;
  try {
    const event = await authorizedEvent((await params).id, organizer);
    if (!event || !event.chainEventId) return NextResponse.json({ error: "V2 event not found or you are not its organizer." }, { status: 404 });
    const staffWallet = getAddress(parsed.data.wallet).toLowerCase();
    if (staffWallet === organizer) return NextResponse.json({ error: "Organizer wallet does not need staff assignment." }, { status: 400 });
    provider = createReadOnlyFujiProvider();
    if (Number((await provider.getNetwork()).chainId) !== FUJI_CHAIN_ID) return NextResponse.json({ error: "RPC is not connected to Fuji." }, { status: 503 });
    const managerAddress = getAddress(EVENT_MANAGER_V2_ADDRESS);
    const receipt = await provider.getTransactionReceipt(parsed.data.chainTx);
    if (!receipt || receipt.status !== 1 || receipt.to?.toLowerCase() !== managerAddress.toLowerCase() || receipt.from.toLowerCase() !== organizer) {
      return NextResponse.json({ error: "No confirmed permission transaction from organizer wallet found." }, { status: 400 });
    }
    const assignment = receipt.logs.flatMap(log => {
      if (log.address.toLowerCase() !== managerAddress.toLowerCase()) return [];
      try { const item = v2Interface.parseLog({ topics: [...log.topics], data: log.data }); return item?.name === "EventStaffUpdated" ? [item] : []; } catch { return []; }
    }).find(item => String(item.args.eventId) === event.chainEventId && String(item.args.staff).toLowerCase() === staffWallet && Boolean(item.args.authorized) === parsed.data.authorized);
    if (!assignment) return NextResponse.json({ error: "Receipt lacks a staff permission change for this event." }, { status: 400 });
    const manager = new Contract(managerAddress, EVENT_MANAGER_V2_ABI, provider);
    const authorized = Boolean(await manager.getFunction("eventStaff")(BigInt(event.chainEventId), staffWallet));
    if (authorized !== parsed.data.authorized) return NextResponse.json({ error: "On-chain staff status does not match receipt." }, { status: 409 });
    const staff = await db.eventStaffMirror.upsert({
      where: { eventId_wallet: { eventId: event.id, wallet: staffWallet } },
      create: { eventId: event.id, wallet: staffWallet, authorized, chainTx: parsed.data.chainTx, changedBy: organizer },
      update: { authorized, chainTx: parsed.data.chainTx, changedBy: organizer },
    });
    return NextResponse.json({ staff }, { status: 201, headers: { "Cache-Control": "no-store, private" } });
  } catch { return NextResponse.json({ error: "Could not verify staff changes on Fuji." }, { status: 503 }); }
  finally { await provider?.destroy(); }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getRequestOrigin, getSessionContext } from "@/lib/auth";
import { ticketContract, verifyContractLink, createReadOnlyFujiProvider } from "@/lib/contracts/chain";
import { hashTicketCheckInCredential, readTicketCheckInCredential } from "@/lib/tickets/check-in-credential.mjs";
import { FUJI_CHAIN_ID } from "@/lib/web3/client";

export const runtime = "nodejs";
const input = z.object({ credential: z.string().max(96) }).strict();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let origin: string | null;
  try { origin = getRequestOrigin(request); }
  catch { return NextResponse.json({ error: "UniPass chưa cấu hình origin an toàn." }, { status: 503 }); }
  if (!origin) return NextResponse.json({ error: "Origin không hợp lệ." }, { status: 403 });
  const session = await getSessionContext().catch(() => null);
  if (!session) return NextResponse.json({ error: "Cần đăng nhập bằng ví ban tổ chức." }, { status: 401 });
  const { id: eventId } = await params;
  const parsed = input.safeParse(await request.json().catch(() => null));
  const token = parsed.success ? readTicketCheckInCredential(parsed.data.credential) : null;
  if (!token) return NextResponse.json({ error: "Mã check-in không hợp lệ." }, { status: 400 });

  let provider: ReturnType<typeof createReadOnlyFujiProvider> | undefined;
  try {
    const event = await db.eventMetadata.findUnique({ where: { id: eventId }, include: { organizer: { select: { wallet: true } } } });
    if (!event || event.organizer.wallet !== session.wallet || !event.chainEventId) return NextResponse.json({ error: "Không tìm thấy sự kiện hoặc bạn không phải ban tổ chức." }, { status: 404 });
    const credential = await db.ticketCheckInCredential.findUnique({ where: { tokenHash: hashTicketCheckInCredential(token) } });
    if (!credential || credential.eventId !== event.id || credential.chainEventId !== event.chainEventId) return NextResponse.json({ error: "Mã check-in không hợp lệ cho sự kiện này." }, { status: 404 });
    if (credential.consumedAt || credential.expiresAt <= new Date()) return NextResponse.json({ error: "Mã check-in đã hết hạn hoặc đã được dùng." }, { status: 409 });

    provider = createReadOnlyFujiProvider();
    const network = await provider.getNetwork();
    if (Number(network.chainId) !== FUJI_CHAIN_ID) return NextResponse.json({ error: "RPC không kết nối Avalanche Fuji." }, { status: 503 });
    const manager = await verifyContractLink(provider);
    const ticket = ticketContract(provider);
    const tokenId = BigInt(credential.tokenId);
    const [owner, actualEventId, checkedIn] = await Promise.all([
      ticket.ownerOf(tokenId), ticket.eventOfTicket(tokenId), ticket.checkedIn(tokenId),
    ]);
    if (String(owner).toLowerCase() !== credential.ownerWallet || String(actualEventId) !== event.chainEventId) return NextResponse.json({ error: "Vé đã chuyển ví hoặc không thuộc sự kiện này." }, { status: 409 });
    if (checkedIn) return NextResponse.json({ error: "Vé này đã được check-in trên Fuji." }, { status: 409 });
    const chainEvent = await manager.getFunction("getEvent")(BigInt(event.chainEventId));
    if (!Boolean(chainEvent[5])) return NextResponse.json({ error: "Sự kiện đã đóng trên Fuji." }, { status: 409 });

    return NextResponse.json({ tokenId: credential.tokenId, eventTitle: event.title, expiresAt: credential.expiresAt.toISOString() }, { headers: { "Cache-Control": "no-store, private" } });
  } catch { return NextResponse.json({ error: "Không thể xác minh mã vé trên Fuji." }, { status: 503 }); }
  finally { await provider?.destroy(); }
}

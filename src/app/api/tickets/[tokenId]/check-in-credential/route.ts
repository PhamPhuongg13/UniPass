import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getRequestOrigin, getSessionContext } from "@/lib/auth";
import { ticketContract, verifyContractLink, createReadOnlyFujiProvider } from "@/lib/contracts/chain";
import { createTicketCheckInCredential, createTicketCheckInQrPayload, TICKET_CHECK_IN_TTL_MS } from "@/lib/tickets/check-in-credential.mjs";
import { FUJI_CHAIN_ID } from "@/lib/web3/client";

export const runtime = "nodejs";
const paramsSchema = z.object({ tokenId: z.string().regex(/^\d{1,78}$/) });
const MAX_ISSUANCES_PER_HOUR = 10;

export async function POST(request: Request, { params }: { params: Promise<{ tokenId: string }> }) {
  let origin: string | null;
  try { origin = getRequestOrigin(request); }
  catch { return NextResponse.json({ error: "UniPass chưa cấu hình origin an toàn." }, { status: 503 }); }
  if (!origin) return NextResponse.json({ error: "Origin không hợp lệ." }, { status: 403 });

  let session;
  try { session = await getSessionContext(); }
  catch { return NextResponse.json({ error: "Không kiểm tra được phiên ví." }, { status: 503 }); }
  if (!session) return NextResponse.json({ error: "Kết nối và đăng nhập ví sở hữu vé trước." }, { status: 401 });

  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) return NextResponse.json({ error: "Mã vé không hợp lệ." }, { status: 400 });

  const now = new Date();
  try {
    const issuedRecently = await db.ticketCheckInCredential.count({ where: { ownerWallet: session.wallet, createdAt: { gte: new Date(now.getTime() - 60 * 60_000) } } });
    if (issuedRecently >= MAX_ISSUANCES_PER_HOUR) return NextResponse.json({ error: "Bạn đã tạo quá nhiều mã vé. Thử lại sau." }, { status: 429, headers: { "Retry-After": "3600", "Cache-Control": "no-store" } });

    const provider = createReadOnlyFujiProvider();
    try {
      const network = await provider.getNetwork();
      if (Number(network.chainId) !== FUJI_CHAIN_ID) return NextResponse.json({ error: "RPC không kết nối Avalanche Fuji." }, { status: 503 });
      const manager = await verifyContractLink(provider);
      const ticket = ticketContract(provider);
      const tokenId = BigInt(parsed.data.tokenId);
      const [owner, chainEventId, checkedIn] = await Promise.all([
        ticket.ownerOf(tokenId), ticket.eventOfTicket(tokenId), ticket.checkedIn(tokenId),
      ]);
      if (String(owner).toLowerCase() !== session.wallet) return NextResponse.json({ error: "Ví hiện tại không sở hữu NFT vé này." }, { status: 403 });
      if (checkedIn) return NextResponse.json({ error: "Vé này đã được check-in." }, { status: 409 });
      const [chainEvent, event] = await Promise.all([
        manager.getFunction("getEvent")(BigInt(chainEventId)),
        db.eventMetadata.findFirst({ where: { chainEventId: String(chainEventId), visibility: "PUBLIC" }, select: { id: true, title: true, organizer: { select: { wallet: true } } } }),
      ]);
      if (!event || !Boolean(chainEvent[5])) return NextResponse.json({ error: "Sự kiện chưa mở check-in hoặc chưa được UniPass liên kết." }, { status: 409 });

      const { token, tokenHash } = createTicketCheckInCredential();
      const expiresAt = new Date(now.getTime() + TICKET_CHECK_IN_TTL_MS);
      await db.ticketCheckInCredential.create({ data: {
        tokenHash, eventId: event.id, chainEventId: String(chainEventId), tokenId: parsed.data.tokenId,
        ownerWallet: session.wallet, ownerSessionId: session.id, expiresAt,
      } });
      return NextResponse.json({
        credential: token,
        qrPayload: createTicketCheckInQrPayload(token),
        expiresAt: expiresAt.toISOString(),
        eventTitle: event.title,
        tokenId: parsed.data.tokenId,
      }, { headers: { "Cache-Control": "no-store, private" } });
    } finally { await provider.destroy(); }
  } catch {
    return NextResponse.json({ error: "Không thể xác minh quyền sở hữu vé trên Fuji hoặc tạo mã check-in." }, { status: 503 });
  }
}

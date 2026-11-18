import { Contract, JsonRpcProvider } from "ethers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getAppOrigin, getSessionWallet } from "@/lib/auth";
import { FUJI_CHAIN_ID } from "@/lib/web3/client";
import { EVENT_MANAGER_ADDRESS, TICKET_ABI, TICKET_ADDRESS, ticketInterface } from "@/lib/contracts/chain";

export const runtime = "nodejs";
const input = z.object({ tokenId: z.string().regex(/^\d{1,78}$/), chainTx: z.string().regex(/^0x[0-9a-fA-F]{64}$/) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (request.headers.get("origin") !== getAppOrigin()) return NextResponse.json({ error: "Origin không hợp lệ." }, { status: 403 });
  } catch { return NextResponse.json({ error: "APP_ORIGIN chưa được cấu hình." }, { status: 503 }); }
  const wallet = await getSessionWallet();
  if (!wallet) return NextResponse.json({ error: "Cần đăng nhập bằng ví tổ chức." }, { status: 401 });
  const { id } = await params;
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dữ liệu check-in không hợp lệ." }, { status: 400 });
  let provider: JsonRpcProvider | undefined;
  try {
    const event = await db.eventMetadata.findUnique({ where: { id }, include: { organizer: true } });
    if (!event || event.organizer.wallet !== wallet || !event.chainEventId) return NextResponse.json({ error: "Không tìm thấy sự kiện on-chain hoặc bạn không phải ban tổ chức." }, { status: 404 });
    const rpcUrl = process.env.NEXT_PUBLIC_AVALANCHE_RPC_URL || "https://api.avax-test.network/ext/bc/C/rpc";
    provider = new JsonRpcProvider(rpcUrl, FUJI_CHAIN_ID);
    const receipt = await provider.getTransactionReceipt(parsed.data.chainTx);
    if (!receipt || receipt.status !== 1 || receipt.to?.toLowerCase() !== EVENT_MANAGER_ADDRESS.toLowerCase() || receipt.from.toLowerCase() !== wallet) return NextResponse.json({ error: "Không tìm thấy giao dịch check-in thành công của ví tổ chức trên EventManager Fuji." }, { status: 400 });
    const checkInLog = receipt.logs.map(log => {
      if (log.address.toLowerCase() !== TICKET_ADDRESS.toLowerCase()) return null;
      try { return ticketInterface.parseLog({ topics: [...log.topics], data: log.data }); } catch { return null; }
    }).find(log => log?.name === "TicketCheckedIn" && String(log.args.tokenId) === parsed.data.tokenId);
    if (!checkInLog) return NextResponse.json({ error: "Giao dịch không chứa sự kiện TicketCheckedIn cho token ID này." }, { status: 400 });
    const priorAudit = await db.checkInAudit.findFirst({ where: { chainTx: parsed.data.chainTx, eventId: event.id } });
    if (priorAudit) return NextResponse.json({ audit: priorAudit }, { status: 200 });
    const ticket = new Contract(TICKET_ADDRESS, TICKET_ABI, provider);
    const [eventIdFromTicket, ownerWallet] = await Promise.all([ticket.eventOfTicket(BigInt(parsed.data.tokenId)), ticket.ownerOf(BigInt(parsed.data.tokenId))]);
    const actualEventId = String(eventIdFromTicket);
    if (actualEventId !== event.chainEventId) return NextResponse.json({ error: "Vé thuộc một sự kiện on-chain khác." }, { status: 400 });
    const block = await provider.getBlock(receipt.blockNumber);
    const checkedInAt = new Date((block?.timestamp ?? Math.floor(Date.now() / 1000)) * 1000);
    const [, , audit] = await db.$transaction([
      db.ticketMirror.upsert({ where: { eventId_tokenId: { eventId: event.id, tokenId: parsed.data.tokenId } }, create: { eventId: event.id, tokenId: parsed.data.tokenId, ownerWallet: String(ownerWallet).toLowerCase(), checkedInAt }, update: { ownerWallet: String(ownerWallet).toLowerCase(), checkedInAt } }),
      db.eventMetadata.update({ where: { id: event.id }, data: { syncStatus: "SYNCED" } }),
      db.checkInAudit.create({ data: { eventId: event.id, tokenId: parsed.data.tokenId, staffWallet: wallet, outcome: "CHECKED_IN", chainTx: parsed.data.chainTx } }),
    ]);
    return NextResponse.json({ audit }, { status: 201 });
  } catch { return NextResponse.json({ error: "Check-in đã được gửi on-chain nhưng chưa ghi được nhật ký. Thử tải lại sau." }, { status: 503 }); }
  finally { provider?.destroy(); }
}

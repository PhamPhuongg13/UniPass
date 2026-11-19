import { Contract, JsonRpcProvider } from "ethers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getRequestOrigin, getSessionWallet } from "@/lib/auth";
import { FUJI_CHAIN_ID } from "@/lib/web3/client";
import { EVENT_MANAGER_ADDRESS, TICKET_ABI, TICKET_ADDRESS, ticketInterface } from "@/lib/contracts/chain";

export const runtime = "nodejs";
const input = z.object({ tokenId: z.string().regex(/^\d{1,78}$/), chainTx: z.string().regex(/^0x[0-9a-fA-F]{64}$/) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!getRequestOrigin(request)) return NextResponse.json({ error: "Origin không hợp lệ." }, { status: 403 });
  } catch { return NextResponse.json({ error: "APP_ORIGIN chưa được cấu hình." }, { status: 503 }); }
  const wallet = await getSessionWallet();
  if (!wallet) return NextResponse.json({ error: "Cần đăng nhập bằng ví để đồng bộ vé." }, { status: 401 });
  const { id } = await params;
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dữ liệu đăng ký không hợp lệ." }, { status: 400 });
  let provider: JsonRpcProvider | undefined;
  try {
    const event = await db.eventMetadata.findUnique({ where: { id } });
    if (!event || !event.chainEventId) return NextResponse.json({ error: "Sự kiện chưa được liên kết on-chain." }, { status: 404 });
    const rpcUrl = process.env.NEXT_PUBLIC_AVALANCHE_RPC_URL || "https://api.avax-test.network/ext/bc/C/rpc";
    provider = new JsonRpcProvider(rpcUrl, FUJI_CHAIN_ID);
    const receipt = await provider.getTransactionReceipt(parsed.data.chainTx);
    if (!receipt || receipt.status !== 1 || receipt.to?.toLowerCase() !== EVENT_MANAGER_ADDRESS.toLowerCase() || receipt.from.toLowerCase() !== wallet) return NextResponse.json({ error: "Không thấy đăng ký thành công của ví này trên EventManager Fuji." }, { status: 400 });
    const mint = receipt.logs.flatMap(log => {
      if (log.address.toLowerCase() !== TICKET_ADDRESS.toLowerCase()) return [];
      try { const item = ticketInterface.parseLog({ topics: [...log.topics], data: log.data }); return item?.name === "TicketMinted" ? [item] : []; } catch { return []; }
    }).find(log => String(log.args.tokenId) === parsed.data.tokenId && String(log.args.eventId) === event.chainEventId && String(log.args.student).toLowerCase() === wallet);
    if (!mint) return NextResponse.json({ error: "Receipt không có TicketMinted hợp lệ cho event và ví này." }, { status: 400 });
    const ticket = new Contract(TICKET_ADDRESS, TICKET_ABI, provider);
    const [owner, actualEventId, block] = await Promise.all([
      ticket.ownerOf(BigInt(parsed.data.tokenId)), ticket.eventOfTicket(BigInt(parsed.data.tokenId)), provider.getBlock(receipt.blockNumber),
    ]);
    if (String(owner).toLowerCase() !== wallet || String(actualEventId) !== event.chainEventId) return NextResponse.json({ error: "Vé không khớp với chủ sở hữu hoặc sự kiện trên chain." }, { status: 400 });
    await db.$transaction([
      db.registrationMirror.upsert({ where: { eventId_wallet: { eventId: event.id, wallet } }, create: { eventId: event.id, wallet, status: "MINTED", chainTx: parsed.data.chainTx, blockNumber: BigInt(receipt.blockNumber) }, update: { status: "MINTED", chainTx: parsed.data.chainTx, blockNumber: BigInt(receipt.blockNumber) } }),
      db.ticketMirror.upsert({ where: { eventId_tokenId: { eventId: event.id, tokenId: parsed.data.tokenId } }, create: { eventId: event.id, tokenId: parsed.data.tokenId, ownerWallet: wallet, mintedAt: block ? new Date(block.timestamp * 1000) : new Date(), chainTx: parsed.data.chainTx }, update: { ownerWallet: wallet, mintedAt: block ? new Date(block.timestamp * 1000) : new Date(), chainTx: parsed.data.chainTx } }),
    ]);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch { return NextResponse.json({ error: "Vé đã mint on-chain nhưng chưa đồng bộ được metadata. Vé vẫn hiện từ blockchain." }, { status: 503 }); }
  finally { provider?.destroy(); }
}

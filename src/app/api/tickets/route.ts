import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionWallet } from "@/lib/auth";

export const runtime = "nodejs";
const PAGE_SIZE = 50;
const CHAIN_ID = 43113;

export async function GET(request: Request) {
  try {
    const wallet = await getSessionWallet();
    if (!wallet) return NextResponse.json({ error: "Hãy kết nối và đăng nhập ví để xem vé." }, { status: 401, headers: { "Cache-Control": "no-store" } });
    const requestedOffset = Number(new URL(request.url).searchParams.get("offset") ?? "0");
    if (!Number.isSafeInteger(requestedOffset) || requestedOffset < 0 || requestedOffset > 10_000) return NextResponse.json({ error: "Trang vé không hợp lệ." }, { status: 400 });
    const requestedWallet = new URL(request.url).searchParams.get("wallet")?.toLowerCase();
    if (requestedWallet && requestedWallet !== wallet.toLowerCase()) return NextResponse.json({ error: "Phiên ví đã thay đổi. Hãy tải lại trang." }, { status: 409, headers: { "Cache-Control": "no-store" } });

    const ticketAddress = process.env.NEXT_PUBLIC_TICKET_ADDRESS?.toLowerCase() ?? "";
    const [indexed, mirrors, checkpoint] = await Promise.all([
      ticketAddress ? db.ticketChainLog.findMany({
        where: { chainId: CHAIN_ID, contractAddress: ticketAddress, studentWallet: wallet.toLowerCase() },
        orderBy: [{ blockNumber: "desc" }, { transactionIndex: "desc" }, { logIndex: "desc" }],
        skip: requestedOffset, take: PAGE_SIZE + 1,
      }) : [],
      db.ticketMirror.findMany({
        where: { ownerWallet: wallet.toLowerCase() },
        orderBy: [{ mintedAt: "desc" }, { tokenId: "desc" }],
        skip: requestedOffset, take: PAGE_SIZE + 1,
        select: { tokenId: true, ownerWallet: true, mintedAt: true, eventId: true, chainTx: true, event: { select: { chainEventId: true, title: true, startsAt: true, location: true } } },
      }),
      ticketAddress ? db.chainSyncCheckpoint.findUnique({ where: { chainId_contractAddress_eventName: { chainId: CHAIN_ID, contractAddress: ticketAddress, eventName: "TicketMinted" } } }) : null,
    ]);

    const eventIds = [...new Set([...indexed.map(row => row.eventId), ...mirrors.map(row => row.event.chainEventId).filter((id): id is string => Boolean(id))])];
    const eventMetadata = eventIds.length ? await db.eventMetadata.findMany({ where: { chainEventId: { in: eventIds } }, select: { chainEventId: true, title: true, startsAt: true, location: true } }) : [];
    const eventByChainId = new Map(eventMetadata.map(event => [event.chainEventId!, event]));
    const byToken = new Map<string, { tokenId: string; eventId: string; title: string; startsAt: string | null; location: string | null; blockNumber: string | null }>();
    for (const row of [...indexed, ...mirrors]) {
      if (byToken.has(row.tokenId)) continue;
      const eventId = "studentWallet" in row ? row.eventId : row.event.chainEventId ?? "";
      const metadata = eventByChainId.get(eventId);
      byToken.set(row.tokenId, {
        tokenId: row.tokenId,
        eventId,
        title: metadata?.title ?? `Sự kiện #${eventId || "?"}`,
        startsAt: metadata?.startsAt.toISOString() ?? null,
        location: metadata?.location ?? null,
        blockNumber: "blockNumber" in row ? String(row.blockNumber) : null,
      });
    }

    const tickets = [...byToken.values()].sort((a, b) => (b.blockNumber ?? "0").localeCompare(a.blockNumber ?? "0", undefined, { numeric: true })).slice(0, PAGE_SIZE);
    const deploymentBlockConfigured = Boolean(process.env.TICKET_DEPLOYMENT_BLOCK && /^\d+$/.test(process.env.TICKET_DEPLOYMENT_BLOCK));
    const lastSyncedAt = checkpoint?.lastSyncedAt?.toISOString() ?? null;
    const stale = !checkpoint?.caughtUp || !lastSyncedAt || Date.now() - Date.parse(lastSyncedAt) > 15 * 60_000;
    return NextResponse.json({
      tickets,
      hasMore: indexed.length > PAGE_SIZE || mirrors.length > PAGE_SIZE,
      index: { status: !deploymentBlockConfigured ? "needs-deployment-block" : checkpoint?.caughtUp ? "ready" : "syncing", stale, lastSyncedAt },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "unknown";
    console.error("[tickets:list] database read failed", { code });
    return NextResponse.json({ error: "Không thể tải danh sách vé lúc này. Vui lòng thử lại sau." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

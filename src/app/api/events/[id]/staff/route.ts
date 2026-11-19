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
  if (!wallet) return NextResponse.json({ error: "Cần đăng nhập bằng ví ban tổ chức." }, { status: 401 });
  try {
    const event = await authorizedEvent((await params).id, wallet);
    if (!event) return NextResponse.json({ error: "Không tìm thấy sự kiện hoặc bạn không có quyền quản lý." }, { status: 404 });
    if (!event.fujiV2EventId) return NextResponse.json({ error: "Sự kiện chưa được tạo trên EventManager V2." }, { status: 409 });
    const staff = await db.eventStaffMirror.findMany({ where: { eventId: event.id, authorized: true }, orderBy: { updatedAt: "desc" }, select: { wallet: true, authorized: true, chainTx: true, updatedAt: true } });
    return NextResponse.json({ staff }, { headers: { "Cache-Control": "no-store, private" } });
  } catch { return NextResponse.json({ error: "Không thể tải danh sách nhân viên." }, { status: 503 }); }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { if (!getRequestOrigin(request)) return NextResponse.json({ error: "Origin không hợp lệ." }, { status: 403 }); }
  catch { return NextResponse.json({ error: "APP_ORIGIN chưa được cấu hình." }, { status: 503 }); }
  const organizer = await getSessionWallet();
  if (!organizer) return NextResponse.json({ error: "Cần đăng nhập bằng ví ban tổ chức." }, { status: 401 });
  if (!EVENT_MANAGER_V2_ADDRESS) return NextResponse.json({ error: "Staff theo sự kiện cần EventManager V2; contract cũ chưa hỗ trợ." }, { status: 503 });
  const parsed = staffInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Thông tin phân quyền không hợp lệ." }, { status: 400 });

  let provider: ReturnType<typeof createReadOnlyFujiProvider> | undefined;
  try {
    const event = await authorizedEvent((await params).id, organizer);
    if (!event || !event.fujiV2EventId) return NextResponse.json({ error: "Không tìm thấy sự kiện V2 hoặc bạn không phải ban tổ chức." }, { status: 404 });
    const staffWallet = getAddress(parsed.data.wallet).toLowerCase();
    if (staffWallet === organizer) return NextResponse.json({ error: "Ví ban tổ chức không cần được thêm làm nhân viên." }, { status: 400 });
    provider = createReadOnlyFujiProvider();
    if (Number((await provider.getNetwork()).chainId) !== FUJI_CHAIN_ID) return NextResponse.json({ error: "RPC không kết nối Fuji." }, { status: 503 });
    const managerAddress = getAddress(EVENT_MANAGER_V2_ADDRESS);
    const receipt = await provider.getTransactionReceipt(parsed.data.chainTx);
    if (!receipt || receipt.status !== 1 || receipt.to?.toLowerCase() !== managerAddress.toLowerCase() || receipt.from.toLowerCase() !== organizer) {
      return NextResponse.json({ error: "Không tìm thấy giao dịch phân quyền đã xác nhận từ ví ban tổ chức." }, { status: 400 });
    }
    const assignment = receipt.logs.flatMap(log => {
      if (log.address.toLowerCase() !== managerAddress.toLowerCase()) return [];
      try { const item = v2Interface.parseLog({ topics: [...log.topics], data: log.data }); return item?.name === "EventStaffUpdated" ? [item] : []; } catch { return []; }
    }).find(item => String(item.args.eventId) === event.fujiV2EventId && String(item.args.staff).toLowerCase() === staffWallet && Boolean(item.args.authorized) === parsed.data.authorized);
    if (!assignment) return NextResponse.json({ error: "Receipt không chứa thay đổi quyền nhân viên đúng sự kiện." }, { status: 400 });
    const manager = new Contract(managerAddress, EVENT_MANAGER_V2_ABI, provider);
    const authorized = Boolean(await manager.getFunction("eventStaff")(BigInt(event.fujiV2EventId), staffWallet));
    if (authorized !== parsed.data.authorized) return NextResponse.json({ error: "Trạng thái nhân viên trên chain chưa khớp receipt." }, { status: 409 });
    const staff = await db.eventStaffMirror.upsert({
      where: { eventId_wallet: { eventId: event.id, wallet: staffWallet } },
      create: { eventId: event.id, wallet: staffWallet, authorized, chainTx: parsed.data.chainTx, changedBy: organizer },
      update: { authorized, chainTx: parsed.data.chainTx, changedBy: organizer },
    });
    return NextResponse.json({ staff }, { status: 201, headers: { "Cache-Control": "no-store, private" } });
  } catch { return NextResponse.json({ error: "Không thể xác minh thay đổi nhân viên trên Fuji." }, { status: 503 }); }
  finally { await provider?.destroy(); }
}

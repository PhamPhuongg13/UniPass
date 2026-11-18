import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getAppOrigin, getSessionWallet } from "@/lib/auth";

export const runtime = "nodejs";
const patchInput = z.object({
  title: z.string().trim().min(3).max(140).optional(), description: z.string().trim().min(10).max(10_000).optional(),
  startsAt: z.coerce.date().optional(), endsAt: z.coerce.date().optional(), timezone: z.string().optional(),
  location: z.string().trim().min(2).max(300).optional(), isOnline: z.boolean().optional(),
  metadataCapacity: z.number().int().positive().max(100_000).nullable().optional(), registrationDeadline: z.coerce.date().nullable().optional(),
  coverUrl: z.string().url().max(2048).nullable().optional(), visibility: z.enum(["PUBLIC", "UNLISTED"]).optional(),
});

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const event = await db.eventMetadata.findUnique({ where: { id }, include: { organizer: { select: { name: true, wallet: true } } } });
    if (!event) return NextResponse.json({ error: "Không tìm thấy sự kiện." }, { status: 404 });
    const wallet = await getSessionWallet();
    if (event.visibility !== "PUBLIC" && event.organizer.wallet !== wallet) return NextResponse.json({ error: "Không tìm thấy sự kiện." }, { status: 404 });
    return NextResponse.json({ event }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "Sự kiện chưa khả dụng." }, { status: 503 }); }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { if (request.headers.get("origin") !== getAppOrigin()) return NextResponse.json({ error: "Origin không hợp lệ." }, { status: 403 }); }
  catch { return NextResponse.json({ error: "APP_ORIGIN chưa được cấu hình." }, { status: 503 }); }
  const wallet = await getSessionWallet();
  if (!wallet) return NextResponse.json({ error: "Cần đăng nhập bằng ví tổ chức." }, { status: 401 });
  const { id } = await params;
  const parsed = patchInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success || Object.keys(parsed.data ?? {}).length === 0) return NextResponse.json({ error: "Thông tin cập nhật không hợp lệ." }, { status: 400 });
  try {
    const current = await db.eventMetadata.findUnique({ where: { id }, include: { organizer: true } });
    if (!current || current.organizer.wallet !== wallet) return NextResponse.json({ error: "Không tìm thấy sự kiện hoặc bạn không có quyền sửa." }, { status: 404 });
    const data = parsed.data;
    const startsAt = data.startsAt ?? current.startsAt;
    const endsAt = data.endsAt ?? current.endsAt;
    const deadline = data.registrationDeadline === undefined ? current.registrationDeadline : data.registrationDeadline;
    if (endsAt <= startsAt || deadline && deadline >= startsAt) return NextResponse.json({ error: "Thời gian sự kiện hoặc hạn đăng ký không hợp lệ." }, { status: 400 });
    const event = await db.eventMetadata.update({ where: { id }, data });
    return NextResponse.json({ event });
  } catch { return NextResponse.json({ error: "Không thể cập nhật sự kiện." }, { status: 503 }); }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { if (request.headers.get("origin") !== getAppOrigin()) return NextResponse.json({ error: "Origin không hợp lệ." }, { status: 403 }); }
  catch { return NextResponse.json({ error: "APP_ORIGIN chưa được cấu hình." }, { status: 503 }); }
  const wallet = await getSessionWallet();
  if (!wallet) return NextResponse.json({ error: "Cần đăng nhập bằng ví tổ chức." }, { status: 401 });
  const { id } = await params;
  try {
    const event = await db.eventMetadata.findUnique({ where: { id }, include: { organizer: true } });
    if (!event || event.organizer.wallet !== wallet) return NextResponse.json({ error: "Không tìm thấy sự kiện hoặc bạn không có quyền xóa." }, { status: 404 });
    await db.eventMetadata.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Không thể xóa sự kiện có dữ liệu liên quan." }, { status: 409 }); }
}

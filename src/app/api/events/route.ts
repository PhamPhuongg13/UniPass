import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getAppOrigin, getSessionWallet } from "@/lib/auth";

export const runtime = "nodejs";
const eventInput = z.object({
  title: z.string().trim().min(3).max(140), description: z.string().trim().min(10).max(10_000),
  startsAt: z.coerce.date(), endsAt: z.coerce.date(), timezone: z.string().default("Asia/Ho_Chi_Minh"),
  location: z.string().trim().min(2).max(300), isOnline: z.boolean().default(false),
  metadataCapacity: z.number().int().positive().max(100_000).optional(), registrationDeadline: z.coerce.date().optional(),
  coverUrl: z.string().url().max(2048).optional(), visibility: z.enum(["PUBLIC", "UNLISTED"]).default("PUBLIC"), organizerName: z.string().trim().min(2).max(100).optional(),
}).refine(value => value.endsAt > value.startsAt, { message: "Thời gian kết thúc phải sau thời gian bắt đầu.", path: ["endsAt"] });

export async function GET() {
  try {
    const events = await db.eventMetadata.findMany({ where: { visibility: "PUBLIC", startsAt: { gte: new Date() } }, orderBy: { startsAt: "asc" }, take: 100, include: { organizer: { select: { name: true, wallet: true } } } });
    return NextResponse.json({ events }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "Danh sách sự kiện chưa khả dụng." }, { status: 503 }); }
}

export async function POST(request: Request) {
  try { if (request.headers.get("origin") !== getAppOrigin()) return NextResponse.json({ error: "Origin không hợp lệ." }, { status: 403 }); }
  catch { return NextResponse.json({ error: "APP_ORIGIN chưa được cấu hình." }, { status: 503 }); }
  const wallet = await getSessionWallet();
  if (!wallet) return NextResponse.json({ error: "Cần kết nối và xác thực ví tổ chức." }, { status: 401 });
  const parsed = eventInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Thông tin sự kiện chưa hợp lệ.", details: parsed.error.flatten() }, { status: 400 });
  const value = parsed.data;
  if (value.registrationDeadline && value.registrationDeadline >= value.startsAt) return NextResponse.json({ error: "Hạn đăng ký phải trước giờ bắt đầu." }, { status: 400 });
  try {
    const { organizerName, ...eventData } = value;
    const organizer = await db.organizerProfile.upsert({ where: { wallet }, create: { wallet, name: organizerName || `Organizer ${wallet.slice(0, 6)}` }, update: organizerName ? { name: organizerName } : {} });
    const slugBase = value.title.toLocaleLowerCase("vi").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
    const event = await db.eventMetadata.create({ data: { ...eventData, slug: `${slugBase}-${randomBytes(3).toString("hex")}`, organizerId: organizer.id } });
    return NextResponse.json({ event, blockchain: { status: "PENDING", message: "Metadata đã lưu; tạo sự kiện trên chain là bước riêng." } }, { status: 201 });
  } catch { return NextResponse.json({ error: "Không thể lưu metadata sự kiện." }, { status: 503 }); }
}

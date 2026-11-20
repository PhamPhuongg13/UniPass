import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { eligibilityFields, validEligibility } from "@/lib/events/eligibility.mjs";
import { db } from "@/lib/db";
import { getRequestOrigin, getSessionWallet } from "@/lib/auth";

export const runtime = "nodejs";
const eventInput = z.object({
  ...eligibilityFields,
  title: z.string().trim().min(3).max(140), description: z.string().trim().min(10).max(10_000),
  category: z.enum(["tech", "workshop", "career", "club", "community"]).default("community"),
  startsAt: z.coerce.date(), endsAt: z.coerce.date(), timezone: z.string().default("Asia/Ho_Chi_Minh"),
  location: z.string().trim().min(2).max(300), isOnline: z.boolean().default(false),
  metadataCapacity: z.number().int().positive().max(100_000), registrationDeadline: z.coerce.date(),
  coverUrl: z.string().url().max(2048).optional(), visibility: z.enum(["PUBLIC", "UNLISTED"]).default("UNLISTED"), organizerName: z.string().trim().min(2).max(100).optional(),
}).refine(validEligibility, { message: "Select at least one school domain.", path: ["allowedSchoolDomains"] })
  .refine(value => value.endsAt > value.startsAt, { message: "End time must be after start time.", path: ["endsAt"] })
  .refine(value => value.startsAt > new Date(), { message: "Event must start in the future.", path: ["startsAt"] })
  .refine(value => value.registrationDeadline > new Date() && value.registrationDeadline < value.startsAt, { message: "Registration deadline must be in the future and before the event.", path: ["registrationDeadline"] });

export async function GET() {
  try {
    const events = await db.eventMetadata.findMany({ where: { visibility: "PUBLIC", syncStatus: "SYNCED" }, orderBy: { startsAt: "asc" }, take: 100, include: { organizer: { select: { name: true, wallet: true } } } });
    return NextResponse.json({ events }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "Events are temporarily unavailable." }, { status: 503 }); }
}

export async function POST(request: Request) {
  try { if (!getRequestOrigin(request)) return NextResponse.json({ error: "Invalid origin." }, { status: 403 }); }
  catch { return NextResponse.json({ error: "APP_ORIGIN is not configured." }, { status: 503 }); }
  const wallet = await getSessionWallet();
  if (!wallet) return NextResponse.json({ error: "Connect and authenticate the organizer wallet." }, { status: 401 });
  const parsed = eventInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid event details.", details: parsed.error.flatten() }, { status: 400 });
  const value = parsed.data;
  if (value.registrationDeadline && value.registrationDeadline >= value.startsAt) return NextResponse.json({ error: "Registration deadline must precede the start time." }, { status: 400 });
  try {
    const { organizerName, ...eventData } = value;
    const organizer = await db.organizerProfile.upsert({ where: { wallet }, create: { wallet, name: organizerName || `Organizer ${wallet.slice(0, 6)}` }, update: organizerName ? { name: organizerName } : {} });
    const slugBase = value.title.toLocaleLowerCase("vi").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\u0111/g, "d").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
    const event = await db.eventMetadata.create({ data: { ...eventData, slug: `${slugBase}-${randomBytes(3).toString("hex")}`, organizerId: organizer.id } });
    return NextResponse.json({ event, blockchain: { status: "PENDING", message: "Metadata saved; creating the on-chain event is a separate step." } }, { status: 201 });
  } catch { return NextResponse.json({ error: "Could not save event metadata." }, { status: 503 }); }
}

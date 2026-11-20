import { NextResponse } from "next/server";
import { z } from "zod";
import { eligibilityFields, validEligibility } from "@/lib/events/eligibility.mjs";
import { db } from "@/lib/db";
import { getRequestOrigin, getSessionWallet } from "@/lib/auth";
import { verifyEventCreationTransaction } from "@/lib/contracts/verify";

export const runtime = "nodejs";
const patchInput = z.object({
  eligibility: eligibilityFields.eligibility.optional(), allowedSchoolDomains: eligibilityFields.allowedSchoolDomains.optional(),
  title: z.string().trim().min(3).max(140).optional(), description: z.string().trim().min(10).max(10_000).optional(),
  category: z.enum(["tech", "workshop", "career", "club", "community"]).optional(),
  startsAt: z.coerce.date().optional(), endsAt: z.coerce.date().optional(), timezone: z.string().optional(),
  location: z.string().trim().min(2).max(300).optional(), isOnline: z.boolean().optional(),
  metadataCapacity: z.number().int().positive().max(100_000).nullable().optional(), registrationDeadline: z.coerce.date().nullable().optional(),
  coverUrl: z.string().url().max(2048).nullable().optional(), visibility: z.enum(["PUBLIC", "UNLISTED"]).optional(),
  chainEventId: z.string().regex(/^\d{1,78}$/).nullable().optional(),
  chainTx: z.string().regex(/^0x[0-9a-fA-F]{64}$/).nullable().optional(),
  syncStatus: z.enum(["PENDING", "SYNCED", "FAILED"]).optional(),
});

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const event = await db.eventMetadata.findUnique({ where: { id }, include: { organizer: { select: { name: true, wallet: true } } } });
    if (!event) return NextResponse.json({ error: "Event not found." }, { status: 404 });
    const wallet = await getSessionWallet();
    if (event.visibility !== "PUBLIC" && event.organizer.wallet !== wallet) return NextResponse.json({ error: "Event not found." }, { status: 404 });
    return NextResponse.json({ event }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "Event temporarily unavailable." }, { status: 503 }); }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { if (!getRequestOrigin(request)) return NextResponse.json({ error: "Invalid origin." }, { status: 403 }); }
  catch { return NextResponse.json({ error: "APP_ORIGIN is not configured." }, { status: 503 }); }
  const wallet = await getSessionWallet();
  if (!wallet) return NextResponse.json({ error: "Sign in with the organizer wallet." }, { status: 401 });
  const { id } = await params;
  const parsed = patchInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success || Object.keys(parsed.data ?? {}).length === 0) return NextResponse.json({ error: "Invalid update details." }, { status: 400 });
  try {
    const current = await db.eventMetadata.findUnique({ where: { id }, include: { organizer: true } });
    if (!current || current.organizer.wallet !== wallet) return NextResponse.json({ error: "Event not found or you cannot edit it." }, { status: 404 });
    const data = parsed.data;
    if (!validEligibility({ eligibility: data.eligibility ?? current.eligibility, allowedSchoolDomains: data.allowedSchoolDomains ?? current.allowedSchoolDomains })) return NextResponse.json({ error: "Select at least one school domain." }, { status: 400 });
    if (data.visibility === "PUBLIC" && !data.chainEventId && !current.chainEventId) return NextResponse.json({ error: "Event can be public only after on-chain linkage." }, { status: 409 });
    if (current.chainEventId && data.chainEventId === null) return NextResponse.json({ error: "Cannot unlink a confirmed on-chain event." }, { status: 409 });
    if (current.chainTx && data.chainTx === null) return NextResponse.json({ error: "Cannot delete a saved transaction hash." }, { status: 409 });
    const startsAt = data.startsAt ?? current.startsAt;
    const endsAt = data.endsAt ?? current.endsAt;
    const deadline = data.registrationDeadline === undefined ? current.registrationDeadline : data.registrationDeadline;
    if (endsAt <= startsAt || deadline && deadline >= startsAt) return NextResponse.json({ error: "Invalid event time or registration deadline." }, { status: 400 });
    if (data.chainEventId && current.chainEventId && data.chainEventId !== current.chainEventId) return NextResponse.json({ error: "Metadata is already linked to another event ID." }, { status: 409 });
    const requiresChainConfirmation = Boolean(data.chainEventId) || data.syncStatus === "SYNCED";
    if (requiresChainConfirmation) {
      const chainEventId = data.chainEventId ?? current.chainEventId;
      const chainTx = data.chainTx ?? current.chainTx;
      if (!chainEventId || !chainTx) return NextResponse.json({ error: "Event ID and transaction hash are required to confirm the on-chain event." }, { status: 400 });
      const confirmed = await verifyEventCreationTransaction(chainTx, chainEventId, wallet);
      if (current.metadataCapacity && confirmed.capacity !== BigInt(current.metadataCapacity)) return NextResponse.json({ error: "On-chain capacity does not match metadata." }, { status: 400 });
      if (current.registrationDeadline && confirmed.deadline !== BigInt(Math.floor(current.registrationDeadline.getTime() / 1000))) return NextResponse.json({ error: "On-chain registration deadline does not match metadata." }, { status: 400 });
    }
    const event = await db.eventMetadata.update({ where: { id }, data });
    return NextResponse.json({ event });
  } catch { return NextResponse.json({ error: "Could not update event." }, { status: 503 }); }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { if (!getRequestOrigin(request)) return NextResponse.json({ error: "Invalid origin." }, { status: 403 }); }
  catch { return NextResponse.json({ error: "APP_ORIGIN is not configured." }, { status: 503 }); }
  const wallet = await getSessionWallet();
  if (!wallet) return NextResponse.json({ error: "Sign in with the organizer wallet." }, { status: 401 });
  const { id } = await params;
  try {
    const event = await db.eventMetadata.findUnique({ where: { id }, include: { organizer: true } });
    if (!event || event.organizer.wallet !== wallet) return NextResponse.json({ error: "Event not found or you cannot delete it." }, { status: 404 });
    if (event.chainEventId || event.fujiV2EventId || event.chainTx) {
      return NextResponse.json({ error: "Event has an on-chain link or pending transaction, so its metadata cannot be deleted. Keep the link to preserve history; cancellation state is not yet available." }, { status: 409 });
    }
    await db.eventMetadata.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Cannot delete an event with related data." }, { status: 409 }); }
}

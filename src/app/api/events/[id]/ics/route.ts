import { db } from "@/lib/db";
import { getSessionWallet } from "@/lib/auth";

const escapeIcs = (value: string) => value.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
const dateIcs = (value: Date) => value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await db.eventMetadata.findUnique({ where: { id }, include: { organizer: { select: { wallet: true } } } }).catch(() => null);
  if (!event || (event.visibility !== "PUBLIC" && event.organizer.wallet !== await getSessionWallet())) return new Response("Event not found.", { status: 404 });
  const body = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//UniPass//Events//VI", "BEGIN:VEVENT", `UID:${escapeIcs(event.id)}@unipass`, `DTSTAMP:${dateIcs(new Date())}`, `DTSTART:${dateIcs(event.startsAt)}`, `DTEND:${dateIcs(event.endsAt)}`, `SUMMARY:${escapeIcs(event.title)}`, `DESCRIPTION:${escapeIcs(event.description)}`, `LOCATION:${escapeIcs(event.location)}`, "END:VEVENT", "END:VCALENDAR", ""].join("\r\n");
  return new Response(body, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="unipass-${event.id}.ics"`, "Cache-Control": "no-store" } });
}

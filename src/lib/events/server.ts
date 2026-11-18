import { db } from "@/lib/db";
import { categories, type CategoryId, type EventCardData } from "./catalog";

const categoryIds = new Set<string>(categories.map(c => c.id));
export async function getPublicEvents(): Promise<{ events: EventCardData[]; available: boolean }> {
  try {
    const rows = await db.eventMetadata.findMany({ where: { visibility: "PUBLIC", startsAt: { gte: new Date() } }, include: { organizer: { select: { name: true } } }, orderBy: { startsAt: "asc" }, take: 48 });
    return { available: true, events: rows.map(row => ({ id: row.id, slug: row.slug, title: row.title, organizer: row.organizer.name, startsAt: row.startsAt.toISOString(), endsAt: row.endsAt.toISOString(), location: row.location, category: (categoryIds.has(row.category) ? row.category : "community") as CategoryId, coverUrl: row.coverUrl || "", description: row.description, sample: false, capacity: row.metadataCapacity })) };
  } catch { return { events: [], available: false }; }
}

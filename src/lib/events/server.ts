import { db } from "@/lib/db";
import { categories, type CategoryId, type EventCardData } from "./catalog";

const categoryIds = new Set<string>(categories.map(category => category.id));
export function eventCard(row: { id:string;slug:string;title:string;organizer:{name:string};startsAt:Date;endsAt:Date;location:string;category:string;coverUrl:string|null;description:string;eligibility:string;allowedSchoolDomains:string[];metadataCapacity:number|null }): EventCardData {
  return { id: row.id, slug: row.slug, title: row.title, organizer: row.organizer.name,
    startsAt: row.startsAt.toISOString(), endsAt: row.endsAt.toISOString(), location: row.location,
    category: (categoryIds.has(row.category) ? row.category : "community") as CategoryId,
    coverUrl: row.coverUrl || "", description: row.description,
    eligibility: row.eligibility as EventCardData["eligibility"], allowedSchoolDomains: row.allowedSchoolDomains,
    capacity: row.metadataCapacity };
}
export async function getPublicEvents(): Promise<{ events: EventCardData[]; available: boolean }> {
  try {
    const now = new Date();
    const common = { visibility: "PUBLIC", syncStatus: "SYNCED" };
    const include = { organizer: { select: { name: true } } } as const;
    const [upcoming, past] = await Promise.all([
      db.eventMetadata.findMany({ where: { ...common, startsAt: { gte: now } }, include, orderBy: { startsAt: "asc" }, take: 100 }),
      db.eventMetadata.findMany({ where: { ...common, startsAt: { lt: now } }, include, orderBy: { startsAt: "desc" }, take: 100 }),
    ]);
    const events = [...upcoming, ...past].map(eventCard);
    return { available: true, events };
  } catch { return { events: [], available: false }; }
}

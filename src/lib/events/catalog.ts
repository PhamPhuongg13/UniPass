export const categories = [
  { id: "tech", label: "Tech & hackathons" },
  { id: "workshop", label: "Workshop" },
  { id: "career", label: "Careers" },
  { id: "club", label: "Clubs" },
  { id: "community", label: "Community" },
] as const;
export type CategoryId = (typeof categories)[number]["id"];
export type EventCardData = { id: string; slug: string; title: string; organizer: string; startsAt: string; endsAt: string; location: string; category: CategoryId; coverUrl: string; description: string; eligibility: "OPEN" | "STUDENT" | "SCHOOLS"; allowedSchoolDomains: string[]; capacity: number | null };
export const categoryLabel = (id: CategoryId) => categories.find(c => c.id === id)?.label ?? id;
export const dateLabel = (iso: string) => new Intl.DateTimeFormat("en-GB", { dateStyle: "full", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(iso));
export const dayLabel = (iso: string) => new Intl.DateTimeFormat("en-GB", { day: "2-digit", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(iso));
export const monthLabel = (iso: string) => new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(iso)).toUpperCase();
export function filterEvents(events: EventCardData[], q = "", category = "", sort = "soon") {
  const term = q.trim().toLocaleLowerCase("vi");
  return events.filter(e => (!category || e.category === category) && (!term || `${e.title} ${e.organizer} ${e.location} ${categoryLabel(e.category)}`.toLocaleLowerCase("vi").includes(term)))
    .sort((a, b) => sort === "name" ? a.title.localeCompare(b.title, "vi") : Number(new Date(a.startsAt).getTime() < Date.now()) - Number(new Date(b.startsAt).getTime() < Date.now()) || new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
}

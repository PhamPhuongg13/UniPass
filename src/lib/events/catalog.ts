export const categories = [
  { id: "tech", label: "Công nghệ & hackathon" },
  { id: "workshop", label: "Workshop" },
  { id: "career", label: "Nghề nghiệp" },
  { id: "club", label: "Câu lạc bộ" },
  { id: "community", label: "Cộng đồng" },
] as const;
export type CategoryId = (typeof categories)[number]["id"];
export type EventCardData = { id: string; slug: string; title: string; organizer: string; startsAt: string; endsAt: string; location: string; category: CategoryId; coverUrl: string; description: string; sample: boolean; capacity: number | null };
const cover = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1100&q=85`;
export const sampleEvents: EventCardData[] = [
  { id: "build-night", slug: "build-night", title: "Build Night: Cùng làm một dự án", organizer: "VNU Innovation Hub", startsAt: "2026-11-22T02:00:00.000Z", endsAt: "2026-11-22T10:00:00.000Z", location: "ĐHQG TP.HCM · Thủ Đức", category: "tech", coverUrl: cover("photo-1516321318423-f06f85e504b3"), description: "Sự kiện minh họa; ban tổ chức chưa xác nhận nội dung.", sample: true, capacity: null },
  { id: "design-jam", slug: "design-jam", title: "Design Jam: Thiết kế cùng nhau", organizer: "Design Buddies Saigon", startsAt: "2026-11-24T07:00:00.000Z", endsAt: "2026-11-24T11:00:00.000Z", location: "The Sentry · Thảo Điền", category: "workshop", coverUrl: cover("photo-1558655146-d09347e92766"), description: "Sự kiện minh họa; ban tổ chức chưa xác nhận nội dung.", sample: true, capacity: null },
  { id: "career-zine", slug: "career-zine", title: "Career Talk: Nghe chuyện đi làm", organizer: "VNU Career Club", startsAt: "2026-11-29T01:30:00.000Z", endsAt: "2026-11-29T05:00:00.000Z", location: "Online + VNU cơ sở 1", category: "career", coverUrl: cover("photo-1523580494863-6f3031224c94"), description: "Sự kiện minh họa; ban tổ chức chưa xác nhận nội dung.", sample: true, capacity: null },
];
export const categoryLabel = (id: CategoryId) => categories.find(c => c.id === id)?.label ?? id;
export const dateLabel = (iso: string) => new Intl.DateTimeFormat("vi-VN", { dateStyle: "full", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(iso));
export const dayLabel = (iso: string) => new Intl.DateTimeFormat("vi-VN", { day: "2-digit", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(iso));
export const monthLabel = (iso: string) => `THG ${new Intl.DateTimeFormat("vi-VN", { month: "numeric", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(iso))}`;
export function filterEvents(events: EventCardData[], q = "", category = "", sort = "soon") {
  const term = q.trim().toLocaleLowerCase("vi");
  return events.filter(e => (!category || e.category === category) && (!term || `${e.title} ${e.organizer} ${e.location} ${categoryLabel(e.category)}`.toLocaleLowerCase("vi").includes(term)))
    .sort((a, b) => sort === "name" ? a.title.localeCompare(b.title, "vi") : new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
}

import Link from "next/link";
import { ArrowUpRight, MapPin } from "lucide-react";
import { categoryLabel, dateLabel, dayLabel, monthLabel, type EventCardData } from "@/lib/events/catalog";

export function EventTile({ event }: { event: EventCardData }) {
  return <Link href={`/events/${event.slug}`} className="event-card">
    <div className="event-image" style={event.coverUrl ? { backgroundImage: `url("${event.coverUrl}")` } : undefined}>
      <span className="event-type">{categoryLabel(event.category)}</span><span className="event-date lime"><b>{dayLabel(event.startsAt)}</b><small>{monthLabel(event.startsAt)}</small></span><span className="image-arrow"><ArrowUpRight size={19}/></span>
    </div>
    <div className="event-info"><div className="event-card-meta"><span>{dateLabel(event.startsAt)}</span><span className="open-spots">{event.sample ? "SỰ KIỆN MẪU" : "SỰ KIỆN ĐÃ ĐĂNG"}</span></div><h3>{event.title}</h3><p className="event-host">{event.organizer}</p><p className="event-place"><MapPin size={14}/>{event.location}</p></div>
  </Link>;
}

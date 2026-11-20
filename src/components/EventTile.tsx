import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight, MapPin } from "lucide-react";
import { eligibilityLabel } from "@/lib/schools";
import { categoryLabel, dateLabel, dayLabel, monthLabel, type EventCardData } from "@/lib/events/catalog";

export function EventTile({ event }: { event: EventCardData }) {
  return <Link href={`/events/${event.slug}`} className="event-card">
    <div className="event-image">
      <Image className="event-cover-img" src={event.coverUrl || "/images/event-cover-default.png"} width={1600} height={900} sizes="(max-width: 620px) 88vw, (max-width: 900px) 46vw, 30vw" alt={`Cover artwork for ${event.title}`} unoptimized={Boolean(event.coverUrl)}/>
      <span className="event-type">{categoryLabel(event.category)}</span><span className="event-date lime"><b>{dayLabel(event.startsAt)}</b><small>{monthLabel(event.startsAt)}</small></span><span className="image-arrow"><ArrowUpRight size={19}/></span>
    </div>
    <div className="event-info"><div className="event-card-meta"><span>{dateLabel(event.startsAt)}</span><span className="open-spots">{eligibilityLabel(event.eligibility, event.allowedSchoolDomains)}</span></div><h3>{event.title}</h3><p className="event-host">{event.organizer}</p><p className="event-place"><MapPin size={14}/>{event.location}</p></div>
  </Link>;
}

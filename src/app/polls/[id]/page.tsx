import { eligibilityLabel } from "@/lib/schools";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { PollVoting } from "@/components/PollVoting";
import { db } from "@/lib/db";
import { sessionPollView } from "@/lib/polls/server";
export const dynamic = "force-dynamic";
export default async function PollPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const record = await db.poll.findFirst({ where: { OR: [{ id }, { slug: id }] } }).catch(()=>null);
  if (!record) notFound();
  const poll = await sessionPollView(record);
  return <><SiteHeader/><main className="subpage page-arrive"><p className="eyebrow">{eligibilityLabel(poll.eligibility, poll.allowedSchoolDomains ?? [])} · {poll.open?"Voting open":"Closed"}</p><h1>{poll.title}</h1><p className="subpage-lede">{poll.description}</p><p>Closes {new Intl.DateTimeFormat("en-GB",{dateStyle:"full",timeStyle:"short",timeZone:"Asia/Ho_Chi_Minh"}).format(new Date(poll.closesAt))}</p><PollVoting poll={poll}/><p><Link href="/polls" className="text-link">← All polls</Link></p></main></>;
}

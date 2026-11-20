import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { db } from "@/lib/db";
import { getSessionWallet } from "@/lib/auth";
import { pollView } from "@/lib/polls/server";
export const dynamic = "force-dynamic";
export default async function Polls() {
  const polls = await db.poll.findMany({ take: 100, orderBy: { closesAt: "asc" } }).catch(()=>[]);
  const wallet = await getSessionWallet().catch(()=>null);
  const views = await Promise.all(polls.map(poll=>pollView(poll,wallet).catch(()=>null)));
  const sorted = views.filter(view=>view!==null).sort((a,b)=>Number(b.open)-Number(a.open)||new Date(a.closesAt).getTime()-new Date(b.closesAt).getTime());
  return <><SiteHeader/><main className="subpage page-arrive"><p className="eyebrow">UNIPASS POLLS</p><h1>One passport, <span className="headline-highlight">one vote.</span></h1><p className="subpage-lede">Club elections, project showcases and decisions recorded on Avalanche.</p><p><Link className="button button-dark" href="/polls/new">Create a poll</Link></p><div className="poll-list">{sorted.length ? sorted.map(poll=><Link className="tool-panel poll-tile" href={`/polls/${poll.slug}`} key={poll.id}><span className="eyebrow">{poll.eligibility} · {poll.open?"OPEN":"CLOSED"}</span><h2>{poll.title}</h2><p>{poll.description}</p><small>Closes {new Intl.DateTimeFormat("en-GB",{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Ho_Chi_Minh"}).format(new Date(poll.closesAt))} · {poll.totalVotes} votes</small></Link>):<div className="tool-panel"><h2>No polls yet</h2><p>Create the first poll for your community.</p></div>}</div></main></>;
}

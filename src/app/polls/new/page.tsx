import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { PollForm } from "@/components/PollForm";
export default function NewPoll() { return <><SiteHeader/><main className="subpage page-arrive"><p className="eyebrow">POLLS</p><h1>Create a poll<span className="headline-period">.</span></h1><p className="subpage-lede">Every passport gets one vote. UniPass covers the network fee.</p><PollForm/><p><Link href="/polls" className="text-link">← All polls</Link></p></main></>; }

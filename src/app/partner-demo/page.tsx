import Link from "next/link";
import { db } from "@/lib/db";
import { PartnerStart } from "@/components/PartnerStart";
export const dynamic="force-dynamic";
export default async function Page(){const program=await db.program.findFirst({where:{kind:"ECOSYSTEM",title:{contains:"Builder Quest",mode:"insensitive"}},orderBy:{createdAt:"desc"}}).catch(()=>null);return <main className="partner-site"><header><span className="partner-logo">◆ AVALANCHE BUILDERS</span><Link href="/">Powered by UniPass ↗</Link></header><section className="partner-hero"><p className="eyebrow">STUDENT BUILDER PROGRAM</p><h1>Avalanche<br/>Builder Quest<span>.</span></h1><p>Prove you are a unique verified student, then unlock the quest reward.</p>{program?<PartnerStart programId={program.id}/>:<p><Link href="/ecosystem/new">Create the Avalanche Builder Quest program</Link> with the callback URL in its redirect allow-list.</p>}</section></main>}

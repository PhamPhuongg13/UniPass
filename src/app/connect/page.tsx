import { SiteHeader } from "@/components/SiteHeader";
import { ConnectApproval } from "@/components/ConnectApproval";
import { db } from "@/lib/db";
import { allowedRedirect } from "@/lib/programs/redirect.mjs";
import { getAppOrigin } from "@/lib/auth";
export const dynamic="force-dynamic";
export default async function Page({searchParams}:{searchParams:Promise<{program?:string;redirect_uri?:string;state?:string}>}){const query=await searchParams;const program=query.program?await db.program.findFirst({where:{OR:[{id:query.program},{slug:query.program}],kind:"ECOSYSTEM"}}).catch(()=>null):null;const extra=program?.extra as {partnerName?:string;redirectAllowList?:string[]}|undefined;const redirect=program&&query.redirect_uri?allowedRedirect(query.redirect_uri,extra?.redirectAllowList??[],getAppOrigin()):null;return <><SiteHeader/><main className="subpage page-arrive"><h1>Connect your passport<span className="headline-period">.</span></h1>{program&&redirect?<ConnectApproval programId={program.id} partner={extra?.partnerName||program.sponsor} redirectUri={redirect.toString()} state={query.state||""}/>:<p className="notice warning">This partner connection link is invalid.</p>}</main></>}

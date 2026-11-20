import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { ScholarshipManage } from "@/components/ProgramManage";
import { db } from "@/lib/db";
import { getSessionWallet } from "@/lib/auth";
export const dynamic="force-dynamic";
export default async function Page({params}:{params:Promise<{slug:string}>}){const {slug}=await params;const wallet=await getSessionWallet().catch(()=>null);const program=await db.program.findUnique({where:{slug}}).catch(()=>null);if(!program||program.kind!=="SCHOLARSHIP")notFound();return <><SiteHeader/><main className="subpage page-arrive"><p className="eyebrow">SCHOLARSHIP SPONSOR</p><h1>{program.title}</h1>{wallet?.toLowerCase()===program.createdByWallet.toLowerCase()?<ScholarshipManage id={program.id}/>:<p className="notice warning">Creator access required.</p>}</main></>}

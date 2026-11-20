import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { DiscountRedeem } from "@/components/ProgramManage";
import { db } from "@/lib/db";
import { getSessionWallet } from "@/lib/auth";
export const dynamic="force-dynamic";
export default async function Page({params}:{params:Promise<{slug:string}>}){const {slug}=await params;const wallet=await getSessionWallet().catch(()=>null);const program=await db.program.findUnique({where:{slug}}).catch(()=>null);if(!program||program.kind!=="DISCOUNT")notFound();return <><SiteHeader/><main className="subpage page-arrive"><p className="eyebrow">MERCHANT CHECKOUT</p><h1>{program.title}</h1>{wallet?.toLowerCase()===program.createdByWallet.toLowerCase()?<DiscountRedeem id={program.id}/>:<p className="notice warning">Merchant access required.</p>}</main></>}

import { ProgramDetail } from "@/lib/programs/pages";
export const dynamic="force-dynamic";
export default async function Page({params}:{params:Promise<{slug:string}>}){return <ProgramDetail kind="GIVEAWAY" slug={(await params).slug}/>}

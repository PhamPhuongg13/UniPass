import { ProgramList } from "@/lib/programs/pages";
import { PassportL1Panel } from "@/components/PassportL1Panel";
import { icmPublicConfig } from "@/lib/icm/contracts";
export const dynamic="force-dynamic";
export default function Page(){ const config=icmPublicConfig(); return <><ProgramList kind="ECOSYSTEM"/>{config && <section className="subpage"><PassportL1Panel config={config}/></section>}</> }

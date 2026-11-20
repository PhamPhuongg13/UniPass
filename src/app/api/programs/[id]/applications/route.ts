import { NextResponse } from "next/server";
import { actionContext } from "@/lib/programs/api";
import { db } from "@/lib/db";
export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await actionContext(request, (await params).id, "SCHOLARSHIP", true); if (context.error) return context.error;
  const rows = await db.scholarshipApplication.findMany({ where: { programId: context.program!.id }, orderBy: { createdAt: "asc" }, select: { id: true, school: true, answer: true, status: true, awardTx: true, createdAt: true } });
  return NextResponse.json({ applications: rows.map((row, index) => ({ ...row, applicantNumber: index + 1 })) }, { headers: { "Cache-Control": "no-store" } });
}

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sessionPollView } from "@/lib/polls/server";
export const runtime = "nodejs";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try { const poll = await db.poll.findFirst({ where: { OR: [{ id }, { slug: id }] } }); if (!poll) return NextResponse.json({ error: "Poll not found." }, { status: 404 }); return NextResponse.json({ poll: await sessionPollView(poll) }, { headers: { "Cache-Control": "no-store" } }); }
  catch { return NextResponse.json({ error: "Poll is temporarily unavailable." }, { status: 503 }); }
}

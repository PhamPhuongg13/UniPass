import { NextResponse } from "next/server";

// The legacy browser/Noir proof endpoint is retired. zkEmail proofs are now
// verified on Fuji; the server accepts only the successful transaction hash.
export async function POST() {
  return NextResponse.json({ error: "Submit the proof to the UniPass contract on Avalanche, then use /api/student-verification/zk-proof with its transaction hash." }, { status: 410 });
}

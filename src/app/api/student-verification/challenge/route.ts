import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getRequestOrigin, getSessionContext } from "@/lib/auth";
import {
  createChallengeEmailBody,
  createEmailChallenge,
  STUDENT_EMAIL_CHAIN_ID,
  STUDENT_EMAIL_CHALLENGE_TTL_MS,
  STUDENT_EMAIL_PURPOSE,
} from "@/lib/zkemail/challenge.mjs";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let origin: string | null;
  try {
    origin = getRequestOrigin(request);
  } catch {
    return NextResponse.json({ error: "UniPass chưa cấu hình origin an toàn." }, { status: 503 });
  }
  if (!origin) return NextResponse.json({ error: "Origin không hợp lệ." }, { status: 403 });

  let session;
  try {
    session = await getSessionContext();
  } catch {
    return NextResponse.json({ error: "Không kiểm tra được phiên ví. Thử tải lại trang." }, { status: 503 });
  }
  if (!session) return NextResponse.json({ error: "Kết nối ví Fuji trước khi tạo mã xác minh." }, { status: 401 });

  try {
    const now = new Date();
    await db.studentEmailChallenge.deleteMany({ where: { expiresAt: { lt: new Date(now.getTime() - 24 * 60 * 60_000) } } });
    const { nonce, nonceHash } = createEmailChallenge();
    const expiresAt = new Date(now.getTime() + STUDENT_EMAIL_CHALLENGE_TTL_MS);
    const issuance = await db.$transaction(async tx => {
      const recent = await tx.studentEmailChallenge.count({
        where: { wallet: session.wallet, createdAt: { gte: new Date(now.getTime() - 60 * 60_000) } },
      });
      if (recent >= 5) return { rateLimited: true as const, challenge: null };
      await tx.studentEmailChallenge.updateMany({
        where: { wallet: session.wallet, sessionId: session.id, consumedAt: null, expiresAt: { gt: now } },
        data: { consumedAt: now },
      });
      const challenge = await tx.studentEmailChallenge.create({
        data: {
          nonceHash,
          wallet: session.wallet,
          sessionId: session.id,
          origin,
          chainId: STUDENT_EMAIL_CHAIN_ID,
          purpose: STUDENT_EMAIL_PURPOSE,
          expiresAt,
        },
        select: { id: true },
      });
      return { rateLimited: false as const, challenge };
    }, { isolationLevel: "Serializable" });
    if (issuance.rateLimited) return NextResponse.json(
      { error: "Bạn đã tạo quá nhiều mã trong một giờ. Vui lòng thử lại sau." },
      { status: 429, headers: { "Retry-After": "3600", "Cache-Control": "no-store" } },
    );
    const challenge = issuance.challenge;

    return NextResponse.json({
      challengeId: challenge.id,
      challenge: nonce,
      expiresAt: expiresAt.toISOString(),
      chainId: STUDENT_EMAIL_CHAIN_ID,
      purpose: STUDENT_EMAIL_PURPOSE,
      subject: "UniPass email verification",
      body: createChallengeEmailBody(nonce),
      recipientInstruction: "Gửi từ email VNU của bạn đến chính địa chỉ VNU đó.",
    }, { headers: { "Cache-Control": "no-store, private" } });
  } catch {
    return NextResponse.json({ error: "Chưa tạo được mã xác minh. Kiểm tra database rồi thử lại." }, { status: 503 });
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { initZkEmailSdk, Proof, ZkFramework } from "@zk-email/sdk";
import { initNoirWasm } from "@zk-email/sdk/initNoirWasm";
import { db } from "@/lib/db";
import { getRequestOrigin, getSessionContext } from "@/lib/auth";
import { decodeNoirPublicSignals } from "@/lib/zkemail/public-signals.mjs";
import { hashEmailChallenge, isEmailChallenge, retryWithBackoff, STUDENT_EMAIL_CHAIN_ID, STUDENT_EMAIL_PURPOSE } from "@/lib/zkemail/challenge.mjs";

export const runtime = "nodejs";
const PINNED_SLUG = "PhamPhuongg13/UniPass_Student_Verification@v2";
const PINNED_BLUEPRINT_ID = "73537fac-12da-4aa8-9338-2858780e0caf";
const inputSchema = z.object({
  challengeId: z.string().min(1).max(64),
  challenge: z.string().length(43),
  proofData: z.string().regex(/^(?:[0-9a-fA-F]{2})+$/).max(120_000),
  publicOutputs: z.array(z.string().regex(/^0x[0-9a-fA-F]+$/)).min(5).max(1024),
}).strict();

export async function POST(request: Request) {
  let origin: string | null;
  try { origin = getRequestOrigin(request); }
  catch { return NextResponse.json({ error: "UniPass chưa cấu hình origin an toàn." }, { status: 503 }); }
  if (!origin) return NextResponse.json({ error: "Origin không hợp lệ." }, { status: 403 });

  let session;
  try { session = await getSessionContext(); }
  catch { return NextResponse.json({ error: "Không kiểm tra được phiên ví." }, { status: 503 }); }
  if (!session) return NextResponse.json({ error: "Phiên ví đã hết hạn. Kết nối ví lại." }, { status: 401 });

  let parsed;
  try {
    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (declaredLength > 200_000) return NextResponse.json({ error: "Proof vượt quá giới hạn kích thước." }, { status: 413 });
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody) > 200_000) return NextResponse.json({ error: "Proof vượt quá giới hạn kích thước." }, { status: 413 });
    parsed = inputSchema.safeParse(JSON.parse(rawBody));
  }
  catch { return NextResponse.json({ error: "Dữ liệu proof không hợp lệ." }, { status: 400 }); }
  if (!parsed.success || !isEmailChallenge(parsed.data.challenge)) {
    return NextResponse.json({ error: "Proof hoặc challenge không đúng định dạng." }, { status: 400 });
  }

  const nonceHash = hashEmailChallenge(parsed.data.challenge);
  let challenge;
  try { challenge = await db.studentEmailChallenge.findUnique({ where: { id: parsed.data.challengeId } }); }
  catch { return NextResponse.json({ error: "Không truy cập được kho challenge." }, { status: 503 }); }
  const now = new Date();
  if (!challenge || challenge.nonceHash !== nonceHash || challenge.wallet !== session.wallet || challenge.sessionId !== session.id || challenge.origin !== origin || challenge.chainId !== STUDENT_EMAIL_CHAIN_ID || challenge.purpose !== STUDENT_EMAIL_PURPOSE) {
    return NextResponse.json({ error: "Challenge không thuộc ví hoặc phiên hiện tại." }, { status: 401 });
  }
  if (challenge.consumedAt || challenge.expiresAt <= now) {
    return NextResponse.json({ error: "Challenge đã hết hạn hoặc đã được dùng. Tạo mã mới." }, { status: 409 });
  }

  let attemptClaim;
  try {
    attemptClaim = await db.studentEmailChallenge.updateMany({
      where: { id: challenge.id, consumedAt: null, expiresAt: { gt: now }, attempts: { lt: 5 } },
      data: { attempts: { increment: 1 } },
    });
  } catch { return NextResponse.json({ error: "Không thể kiểm tra giới hạn thử proof." }, { status: 503 }); }
  if (attemptClaim.count !== 1) return NextResponse.json({ error: "Đã vượt quá số lần thử proof. Tạo challenge mới." }, { status: 429 });

  let blueprint: Awaited<ReturnType<ReturnType<typeof initZkEmailSdk>["getBlueprint"]>>;
  try {
    const sdk = initZkEmailSdk({ logging: { enabled: false, level: "silent" } });
    blueprint = await retryWithBackoff(() => sdk.getBlueprint(PINNED_SLUG), { maxAttempts: 3, baseDelayMs: 250, maxDelayMs: 1_000 });
  } catch {
    return NextResponse.json({ error: "Registry zkEmail tạm thời không truy cập được. Challenge chưa bị tiêu thụ; thử lại sau." }, { status: 503, headers: { "Retry-After": "3", "Cache-Control": "no-store" } });
  }

  const metadata = blueprint.getClonedProps();
  if (metadata.id !== PINNED_BLUEPRINT_ID || metadata.version !== 2 || metadata.clientStatus !== 3 || metadata.serverStatus !== 3 || metadata.clientZkFramework !== ZkFramework.Noir || metadata.serverZkFramework !== ZkFramework.Sp1) {
    return NextResponse.json({ error: "Compiled Blueprint v2 hoặc framework verifier không khớp cấu hình đã ghim." }, { status: 503 });
  }
  if (metadata.senderDomain !== "vnu.edu.vn" || metadata.ignoreBodyHashCheck || !metadata.decomposedRegexes.some(regex => regex.name === "sender_domain" && !regex.isHashed) || !metadata.decomposedRegexes.some(regex => regex.name === "challenge" && !regex.isHashed)) {
    return NextResponse.json({ error: "Cấu hình Blueprint không đáp ứng các ràng buộc email bắt buộc." }, { status: 503 });
  }

  if ((metadata.externalInputs?.length ?? 0) > 0) return NextResponse.json({ error: "Blueprint v2 có external inputs ngoài cấu hình được UniPass hỗ trợ." }, { status: 503 });

  let proofValid = false;
  try {
    const proof = new Proof(blueprint, {
      id: "unipass-server-verification",
      blueprintId: metadata.id!,
      input: "",
      proofData: parsed.data.proofData,
      publicOutputs: parsed.data.publicOutputs,
      isLocal: true,
      zkFramework: ZkFramework.Noir,
      status: 2,
    });
    proofValid = await blueprint.verifyProof(proof, { noirWasm: await initNoirWasm() });
  }
  catch { return NextResponse.json({ error: "Verifier zkEmail gặp lỗi. Challenge chưa bị tiêu thụ." }, { status: 503 }); }
  if (!proofValid) return NextResponse.json({ error: "Proof không hợp lệ hoặc verifier chưa sẵn sàng. Challenge chưa bị tiêu thụ." }, { status: 400 });

  let publicValues: Record<string, string[]>;
  try { publicValues = decodeNoirPublicSignals(parsed.data.publicOutputs, metadata.decomposedRegexes); }
  catch { return NextResponse.json({ error: "Không thể giải mã public signals đã xác minh." }, { status: 400 }); }
  if (publicValues.sender_domain?.length !== 1 || publicValues.sender_domain[0] !== "vnu.edu.vn" || publicValues.challenge?.length !== 1 || publicValues.challenge[0] !== parsed.data.challenge) {
    return NextResponse.json({ error: "Public outputs không khớp domain VNU và challenge đang chờ." }, { status: 400 });
  }

  try {
    const consumed = await db.$transaction(async tx => {
      const finalNow = new Date();
      const activeSession = await tx.authSession.findFirst({
        where: { id: session.id, wallet: session.wallet, expiresAt: { gt: finalNow } },
        select: { id: true },
      });
      if (!activeSession) return 0;
      const claim = await tx.studentEmailChallenge.updateMany({
        where: {
          id: challenge.id,
          nonceHash,
          wallet: session.wallet,
          sessionId: session.id,
          origin,
          chainId: STUDENT_EMAIL_CHAIN_ID,
          purpose: STUDENT_EMAIL_PURPOSE,
          consumedAt: null,
          expiresAt: { gt: finalNow },
        },
        data: { consumedAt: finalNow },
      });
      return claim.count;
    });
    if (consumed !== 1) return NextResponse.json({ error: "Challenge, phiên ví đã dùng hoặc vừa hết hạn." }, { status: 409 });
  } catch { return NextResponse.json({ error: "Không thể ghi nhận challenge đã dùng." }, { status: 503 }); }

  return NextResponse.json({
    proofVerified: true,
    challengeMatched: true,
    walletSessionBound: true,
    studentEligibility: "not-established",
    onChainVerified: false,
    message: "Proof email hợp lệ cho challenge và phiên ví này. Tư cách sinh viên và xác minh on-chain chưa được thiết lập.",
  }, { headers: { "Cache-Control": "no-store, private" } });
}

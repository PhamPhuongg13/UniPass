import { Contract, getAddress, Wallet } from "ethers";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getRequestOrigin, getSessionContext } from "@/lib/auth";
import { createReadOnlyFujiProvider } from "@/lib/contracts/chain";
import { EVENT_MANAGER_V2_ADDRESS } from "@/lib/contracts/v2";
import { FUJI_CHAIN_ID } from "@/lib/web3/client";
import { buildRegistrationAuthorization, hashAuthorizationNonce, REGISTRATION_AUTH_TYPES, REGISTRATION_DOMAIN_NAME, REGISTRATION_DOMAIN_VERSION, STUDENT_ELIGIBILITY_BLUEPRINT_ID } from "@/lib/contracts/registration-authorization.mjs";

export const runtime = "nodejs";
const STUDENT_DOMAIN = "vnu.edu.vn";
const MAX_ISSUANCE_PER_HOUR = 5;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let origin: string | null;
  try { origin = getRequestOrigin(request); }
  catch { return NextResponse.json({ error: "UniPass chưa cấu hình origin an toàn." }, { status: 503 }); }
  if (!origin) return NextResponse.json({ error: "Origin không hợp lệ." }, { status: 403 });
  const session = await getSessionContext().catch(() => null);
  if (!session) return NextResponse.json({ error: "Cần đăng nhập bằng ví trước." }, { status: 401 });

  // Fail closed until the pinned proof policy and circuit guarantees have been independently approved.
  if (process.env.STUDENT_REGISTRATION_ISSUER_ENABLED !== "true") {
    return NextResponse.json({ error: "Cấp quyền đăng ký đang tắt: zkEmail chưa thiết lập eligibility đã được phê duyệt." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  if (!EVENT_MANAGER_V2_ADDRESS || !process.env.UNIPASS_REGISTRATION_ISSUER_PRIVATE_KEY) {
    return NextResponse.json({ error: "Chưa cấu hình EventManager V2 và issuer trên Fuji." }, { status: 503 });
  }

  const { id } = await params;
  let provider: ReturnType<typeof createReadOnlyFujiProvider> | undefined;
  try {
    const eligibility = await db.studentEligibility.findUnique({ where: { wallet: session.wallet } });
    const now = new Date();
    if (!eligibility || eligibility.revokedAt || eligibility.expiresAt <= now || eligibility.chainId !== FUJI_CHAIN_ID || eligibility.senderDomain !== STUDENT_DOMAIN || eligibility.blueprintId !== STUDENT_ELIGIBILITY_BLUEPRINT_ID) {
      return NextResponse.json({ error: "Ví này chưa có hồ sơ sinh viên được xác minh theo policy đã phê duyệt." }, { status: 403 });
    }

    const event = await db.eventMetadata.findUnique({ where: { id }, include: { organizer: { select: { wallet: true } } } });
    if (!event || event.visibility !== "PUBLIC" || !event.fujiV2EventId) return NextResponse.json({ error: "Sự kiện chưa được liên kết với EventManager V2." }, { status: 409 });
    if (await db.registrationAuthorizationAudit.count({ where: { wallet: session.wallet, createdAt: { gte: new Date(now.getTime() - 60 * 60_000) } } }) >= MAX_ISSUANCE_PER_HOUR) {
      return NextResponse.json({ error: "Đã vượt số lần yêu cầu quyền đăng ký. Thử lại sau." }, { status: 429, headers: { "Retry-After": "3600", "Cache-Control": "no-store" } });
    }

    provider = createReadOnlyFujiProvider();
    const network = await provider.getNetwork();
    if (Number(network.chainId) !== FUJI_CHAIN_ID) return NextResponse.json({ error: "RPC không kết nối Avalanche Fuji." }, { status: 503 });
    const managerAddress = getAddress(EVENT_MANAGER_V2_ADDRESS);
    const code = await provider.getCode(managerAddress);
    if (code === "0x") return NextResponse.json({ error: "EventManager V2 chưa được triển khai tại địa chỉ cấu hình." }, { status: 503 });
    const manager = new Contract(managerAddress, [
      "function registrationIssuer() view returns (address)",
      "function getEvent(uint256) view returns ((uint256 id,address organizer,uint256 capacity,uint256 minted,uint256 registrationDeadline,bool active))",
      "function canRegister(uint256) view returns (bool)",
      "function registered(uint256,address) view returns (bool)",
    ], provider);
    const [chainIssuer, chainEvent, canRegister, alreadyRegistered] = await Promise.all([
      manager.registrationIssuer(),
      manager.getFunction("getEvent")(BigInt(event.fujiV2EventId)),
      manager.getFunction("canRegister")(BigInt(event.fujiV2EventId)),
      manager.getFunction("registered")(BigInt(event.fujiV2EventId), session.wallet),
    ]);
    const issuer = new Wallet(process.env.UNIPASS_REGISTRATION_ISSUER_PRIVATE_KEY);
    if (String(chainIssuer).toLowerCase() !== issuer.address.toLowerCase()) return NextResponse.json({ error: "Issuer key không khớp địa chỉ issuer đang cấu hình trên contract." }, { status: 503 });
    if (String(chainEvent.organizer).toLowerCase() !== event.organizer.wallet.toLowerCase() || !Boolean(chainEvent.active)) return NextResponse.json({ error: "Thông tin sự kiện V2 không khớp hoặc sự kiện đã đóng." }, { status: 409 });
    if (!Boolean(canRegister) || Boolean(alreadyRegistered)) return NextResponse.json({ error: alreadyRegistered ? "Ví đã đăng ký sự kiện này." : "Sự kiện đã đóng đăng ký hoặc hết chỗ." }, { status: 409 });

    const { domain, authorization } = buildRegistrationAuthorization({ wallet: session.wallet, eventId: event.fujiV2EventId, verifyingContract: managerAddress });
    const signature = await issuer.signTypedData(domain, REGISTRATION_AUTH_TYPES, authorization);
    const authorizationHash = hashAuthorizationNonce(authorization.nonce);
    await db.registrationAuthorizationAudit.create({ data: {
      nonceHash: authorizationHash,
      wallet: session.wallet,
      metadataEventId: event.id,
      chainEventId: event.fujiV2EventId,
      chainId: FUJI_CHAIN_ID,
      verifyingContract: managerAddress.toLowerCase(),
      expiresAt: new Date(authorization.expiresAt * 1000),
    } });
    return NextResponse.json({
      domain: { name: REGISTRATION_DOMAIN_NAME, version: REGISTRATION_DOMAIN_VERSION, chainId: FUJI_CHAIN_ID, verifyingContract: managerAddress },
      authorization,
      signature,
      expiresAt: new Date(authorization.expiresAt * 1000).toISOString(),
      proofPolicy: eligibility.policyVersion,
    }, { headers: { "Cache-Control": "no-store, private" } });
  } catch {
    return NextResponse.json({ error: "Không thể cấp quyền đăng ký an toàn. Thử lại sau hoặc liên hệ vận hành." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  } finally { await provider?.destroy(); }
}

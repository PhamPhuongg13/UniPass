import { Contract, getAddress, Wallet } from "ethers";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getRequestOrigin, getSessionContext } from "@/lib/auth";
import { createReadOnlyFujiProvider, EVENT_MANAGER_ADDRESS } from "@/lib/contracts/chain";
import { checkEligibility } from "@/lib/eligibility/policy.mjs";
import { deriveEventNullifier, deriveWalletNullifier, getNullifierSecret } from "@/lib/eligibility/nullifier.mjs";

import { FUJI_CHAIN_ID } from "@/lib/web3/client";
import { buildRegistrationAuthorization, hashAuthorizationNonce, REGISTRATION_AUTH_TYPES, REGISTRATION_DOMAIN_NAME, REGISTRATION_DOMAIN_VERSION, STUDENT_ELIGIBILITY_BLUEPRINT_ID } from "@/lib/contracts/registration-authorization.mjs";

export const runtime = "nodejs";
const MAX_ISSUANCE_PER_HOUR = 5;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let origin: string | null;
  try { origin = getRequestOrigin(request); }
  catch { return NextResponse.json({ error: "UniPass secure origin is not configured." }, { status: 503 }); }
  if (!origin) return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  const session = await getSessionContext().catch(() => null);
  if (!session) return NextResponse.json({ error: "Sign in with your wallet first." }, { status: 401 });

  if (process.env.STUDENT_REGISTRATION_ISSUER_ENABLED !== "true") {
    return NextResponse.json({ error: "Registration authorization is disabled." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  if (!EVENT_MANAGER_ADDRESS || !process.env.UNIPASS_REGISTRATION_ISSUER_PRIVATE_KEY) {
    return NextResponse.json({ error: "EventManager V2 and issuer are not configured on Fuji." }, { status: 503 });
  }

  const { id } = await params;
  let provider: ReturnType<typeof createReadOnlyFujiProvider> | undefined;
  try {
    const event = await db.eventMetadata.findUnique({ where: { id }, include: { organizer: { select: { wallet: true } } } });
    if (!event || event.visibility !== "PUBLIC" || !event.chainEventId) return NextResponse.json({ error: "Event is not linked to EventManager V2." }, { status: 409 });
    const now = new Date();
    const eligibility = event.eligibility === "OPEN" ? null : await db.studentEligibility.findUnique({ where: { wallet: session.wallet } });
    const policy = checkEligibility(event.eligibility, event.allowedSchoolDomains, eligibility, now);
    if (!policy.eligible) return NextResponse.json({ error: policy.reason === "SCHOOL_NOT_ALLOWED" ? "Your verified school is not eligible for this event." : "Get your UniPass with a school email before registering." }, { status: 403 });
    if (await db.registrationAuthorizationAudit.count({ where: { wallet: session.wallet, createdAt: { gte: new Date(now.getTime() - 60 * 60_000) } } }) >= MAX_ISSUANCE_PER_HOUR) {
      return NextResponse.json({ error: "Registration authorization rate limit exceeded. Retry later." }, { status: 429, headers: { "Retry-After": "3600", "Cache-Control": "no-store" } });
    }

    provider = createReadOnlyFujiProvider();
    const network = await provider.getNetwork();
    if (Number(network.chainId) !== FUJI_CHAIN_ID) return NextResponse.json({ error: "RPC is not connected to Avalanche Fuji." }, { status: 503 });
    const managerAddress = getAddress(EVENT_MANAGER_ADDRESS);
    const code = await provider.getCode(managerAddress);
    if (code === "0x") return NextResponse.json({ error: "EventManager V2 is not deployed at the configured address." }, { status: 503 });
    const manager = new Contract(managerAddress, [
      "function registrationIssuer() view returns (address)",
      "function getEvent(uint256) view returns ((uint256 id,address organizer,uint256 capacity,uint256 minted,uint256 registrationDeadline,bool active))",
      "function canRegister(uint256) view returns (bool)",
      "function registered(uint256,address) view returns (bool)",
    ], provider);
    const [chainIssuer, chainEvent, canRegister, alreadyRegistered] = await Promise.all([
      manager.registrationIssuer(),
      manager.getFunction("getEvent")(BigInt(event.chainEventId)),
      manager.getFunction("canRegister")(BigInt(event.chainEventId)),
      manager.getFunction("registered")(BigInt(event.chainEventId), session.wallet),
    ]);
    const issuer = new Wallet(process.env.UNIPASS_REGISTRATION_ISSUER_PRIVATE_KEY);
    if (String(chainIssuer).toLowerCase() !== issuer.address.toLowerCase()) return NextResponse.json({ error: "Issuer key does not match on-chain issuer address." }, { status: 503 });
    if (String(chainEvent.organizer).toLowerCase() !== event.organizer.wallet.toLowerCase() || !Boolean(chainEvent.active)) return NextResponse.json({ error: "V2 event details do not match or event is closed." }, { status: 409 });
    if (!Boolean(canRegister) || Boolean(alreadyRegistered)) return NextResponse.json({ error: alreadyRegistered ? "This wallet already has a ticket." : "Registration is closed or event is full." }, { status: 409 });

    const secret = getNullifierSecret();
    const baseNullifier = eligibility?.emailNullifier ?? deriveWalletNullifier(secret, session.wallet);
    const studentNullifier = deriveEventNullifier(secret, baseNullifier, { chainId: FUJI_CHAIN_ID, manager: managerAddress, eventId: event.chainEventId });
    const { domain, authorization } = buildRegistrationAuthorization({ wallet: session.wallet, eventId: event.chainEventId, verifyingContract: managerAddress, studentNullifier });
    const signature = await issuer.signTypedData(domain, REGISTRATION_AUTH_TYPES, authorization);
    const authorizationHash = hashAuthorizationNonce(authorization.nonce);
    await db.registrationAuthorizationAudit.create({ data: {
      nonceHash: authorizationHash,
      wallet: session.wallet,
      metadataEventId: event.id,
      chainEventId: event.chainEventId,
      chainId: FUJI_CHAIN_ID,
      verifyingContract: managerAddress.toLowerCase(),
      studentNullifier,
      expiresAt: new Date(authorization.expiresAt * 1000),
    } });
    return NextResponse.json({
      domain: { name: REGISTRATION_DOMAIN_NAME, version: REGISTRATION_DOMAIN_VERSION, chainId: FUJI_CHAIN_ID, verifyingContract: managerAddress },
      authorization,
      signature,
      expiresAt: new Date(authorization.expiresAt * 1000).toISOString(),
      proofPolicy: eligibility?.policyVersion ?? "open-v1",
    }, { headers: { "Cache-Control": "no-store, private" } });
  } catch {
    return NextResponse.json({ error: "Could not issue secure registration authorization. Retry or contact support." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  } finally { await provider?.destroy(); }
}

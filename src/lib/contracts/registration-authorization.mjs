import { randomBytes, createHash } from "node:crypto";
import { Wallet, getAddress, id, verifyTypedData } from "ethers";

export const FUJI_CHAIN_ID = 43113;
export const REGISTRATION_PURPOSE = id("UNIPASS_STUDENT_EVENT_REGISTRATION_V2");
export const REGISTRATION_AUTH_TTL_SECONDS = 5 * 60;
export const STUDENT_ELIGIBILITY_BLUEPRINT_ID = "73537fac-12da-4aa8-9338-2858780e0caf";
export const REGISTRATION_DOMAIN_NAME = "UniPass Event Manager";
export const REGISTRATION_DOMAIN_VERSION = "2";

export const REGISTRATION_AUTH_TYPES = Object.freeze({
  RegistrationAuthorization: [
    { name: "wallet", type: "address" },
    { name: "eventId", type: "uint256" },
    { name: "chainId", type: "uint256" },
    { name: "verifyingContract", type: "address" },
    { name: "expiresAt", type: "uint64" },
    { name: "nonce", type: "bytes32" },
    { name: "purpose", type: "bytes32" },
  ],
});

export function buildRegistrationAuthorization({ wallet, eventId, verifyingContract, nowSeconds = Math.floor(Date.now() / 1000), ttlSeconds = REGISTRATION_AUTH_TTL_SECONDS }) {
  const event = BigInt(eventId);
  if (event <= 0n) throw new TypeError("Invalid event ID.");
  if (!Number.isSafeInteger(nowSeconds) || nowSeconds <= 0) throw new TypeError("Invalid current time.");
  if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0 || ttlSeconds > 600) throw new TypeError("Authorization lifetime must be from 1 to 600 seconds.");
  const expiresAt = nowSeconds + ttlSeconds;
  if (expiresAt > 0xffff_ffff_ffff_ffff) throw new RangeError("Expiration exceeds uint64.");
  const authorization = {
    wallet: getAddress(wallet),
    eventId: event.toString(),
    chainId: FUJI_CHAIN_ID,
    verifyingContract: getAddress(verifyingContract),
    expiresAt,
    nonce: `0x${randomBytes(32).toString("hex")}`,
    purpose: REGISTRATION_PURPOSE,
  };
  return {
    domain: { name: REGISTRATION_DOMAIN_NAME, version: REGISTRATION_DOMAIN_VERSION, chainId: FUJI_CHAIN_ID, verifyingContract: authorization.verifyingContract },
    authorization,
  };
}

export async function signRegistrationAuthorization(privateKey, parameters) {
  const wallet = new Wallet(privateKey);
  const { domain, authorization } = buildRegistrationAuthorization(parameters);
  const signature = await wallet.signTypedData(domain, REGISTRATION_AUTH_TYPES, authorization);
  return { domain, authorization, signature, issuer: wallet.address };
}

export function verifyRegistrationAuthorization(issuer, domain, authorization, signature) {
  return verifyTypedData(domain, REGISTRATION_AUTH_TYPES, authorization, signature).toLowerCase() === getAddress(issuer).toLowerCase();
}

export function hashAuthorizationNonce(nonce) {
  if (typeof nonce !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(nonce)) throw new TypeError("Invalid authorization nonce.");
  return createHash("sha256").update(Buffer.from(nonce.slice(2), "hex")).digest("hex");
}

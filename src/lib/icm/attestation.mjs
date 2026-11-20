import { randomBytes } from "node:crypto";
import { Wallet, getAddress, keccak256, toUtf8Bytes } from "ethers";
export const PASSPORT_TYPES = { PassportAttestation: [
  { name: "wallet", type: "address" }, { name: "schoolHash", type: "bytes32" },
  { name: "expiresAt", type: "uint64" }, { name: "nonce", type: "uint64" }, { name: "deadline", type: "uint64" },
] };
export function passportDomain(bridge) { return { name: "UniPassPassportBridge", version: "1", chainId: 43113, verifyingContract: getAddress(bridge) }; }
export async function signPassportAttestation(privateKey, bridge, wallet, senderDomain, expiresAt) {
  const now = Math.floor(Date.now() / 1000);
  const attestation = { wallet: getAddress(wallet), schoolHash: keccak256(toUtf8Bytes(senderDomain)), expiresAt: Math.floor(expiresAt.getTime() / 1000), nonce: BigInt(`0x${randomBytes(8).toString("hex")}`).toString(), deadline: now + 600 };
  const signature = await new Wallet(privateKey).signTypedData(passportDomain(bridge), PASSPORT_TYPES, attestation);
  return { attestation, signature };
}

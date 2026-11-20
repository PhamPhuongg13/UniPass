import { randomBytes } from "node:crypto";
import { getAddress, id } from "ethers";
export const PROGRAM_DOMAIN_VERSION = "2";
export const PROGRAM_PURPOSE = id("UNIPASS_PROGRAM_STAMP_V1");
export const STAMP_AUTH_TYPES = Object.freeze({ StampAuthorization: [
  { name: "programId", type: "uint256" }, { name: "nullifier", type: "bytes32" },
  { name: "recipient", type: "address" }, { name: "chainId", type: "uint256" },
  { name: "verifyingContract", type: "address" }, { name: "expiresAt", type: "uint64" },
  { name: "nonce", type: "bytes32" }, { name: "purpose", type: "bytes32" },
] });
export function buildStampAuthorization({ programId, nullifier, recipient, verifyingContract, nowSeconds = Math.floor(Date.now() / 1000) }) {
  const contract = getAddress(verifyingContract);
  const authorization = { programId: String(programId), nullifier, recipient: getAddress(recipient), chainId: 43113, verifyingContract: contract, expiresAt: nowSeconds + 300, nonce: `0x${randomBytes(32).toString("hex")}`, purpose: PROGRAM_PURPOSE };
  return { domain: { name: "UniPass Programs", version: PROGRAM_DOMAIN_VERSION, chainId: 43113, verifyingContract: contract }, authorization };
}

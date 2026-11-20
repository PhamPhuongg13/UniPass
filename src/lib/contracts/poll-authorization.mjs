import { randomBytes } from "node:crypto";
import { getAddress, id } from "ethers";
export const POLL_PURPOSE = id("UNIPASS_POLL_VOTE_V1");
export const POLL_DOMAIN_NAME = "UniPass Poll";
export const POLL_DOMAIN_VERSION = "1";
export const VOTE_AUTH_TYPES = Object.freeze({ VoteAuthorization: [
  { name: "pollId", type: "uint256" }, { name: "option", type: "uint8" },
  { name: "voterNullifier", type: "bytes32" }, { name: "chainId", type: "uint256" },
  { name: "verifyingContract", type: "address" }, { name: "expiresAt", type: "uint64" },
  { name: "nonce", type: "bytes32" }, { name: "purpose", type: "bytes32" },
] });
export function buildVoteAuthorization({ pollId, option, voterNullifier, verifyingContract, nowSeconds = Math.floor(Date.now() / 1000) }) {
  const contract = getAddress(verifyingContract);
  const authorization = { pollId: String(pollId), option, voterNullifier, chainId: 43113, verifyingContract: contract, expiresAt: nowSeconds + 300, nonce: `0x${randomBytes(32).toString("hex")}`, purpose: POLL_PURPOSE };
  return { domain: { name: POLL_DOMAIN_NAME, version: POLL_DOMAIN_VERSION, chainId: 43113, verifyingContract: contract }, authorization };
}

import { Contract, Wallet, getAddress } from "ethers";
import { createReadOnlyFujiProvider } from "@/lib/contracts/chain";
export const POLL_ABI = [
  "function createPoll(uint8 optionCount,uint64 closesAt) returns (uint256 pollId)",
  "function vote((uint256 pollId,uint8 option,bytes32 voterNullifier,uint256 chainId,address verifyingContract,uint64 expiresAt,bytes32 nonce,bytes32 purpose) auth,bytes signature)",
  "function getPoll(uint256 pollId) view returns ((uint8 optionCount,uint64 closesAt,bool closed))",
  "function getResults(uint256 pollId) view returns (uint256[])",
  "function voterNullifierUsed(uint256 pollId,bytes32 nullifier) view returns (bool)",
  "function issuer() view returns (address)",
  "function owner() view returns (address)",
  "event PollCreated(uint256 indexed pollId,uint8 optionCount,uint64 closesAt)",
] as const;
export function pollAddress() { return process.env.NEXT_PUBLIC_POLL_ADDRESS ? getAddress(process.env.NEXT_PUBLIC_POLL_ADDRESS) : null; }
export function pollProvider() { return createReadOnlyFujiProvider(); }
export function pollRelayer(provider: ReturnType<typeof createReadOnlyFujiProvider>) {
  if (!process.env.POLL_RELAYER_PRIVATE_KEY) throw new Error("Poll relayer is not configured.");
  const wallet = new Wallet(process.env.POLL_RELAYER_PRIVATE_KEY, provider);
  if (process.env.POLL_RELAYER_ADDRESS && wallet.address.toLowerCase() !== getAddress(process.env.POLL_RELAYER_ADDRESS).toLowerCase()) throw new Error("Poll relayer address does not match key.");
  return wallet;
}
export function pollContract(runner: ConstructorParameters<typeof Contract>[2]) { const address = pollAddress(); if (!address) throw new Error("Poll contract is not configured."); return new Contract(address, POLL_ABI, runner); }

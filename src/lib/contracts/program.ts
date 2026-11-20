import { Contract, getAddress } from "ethers";
import { createReadOnlyFujiProvider } from "@/lib/contracts/chain";
import { pollRelayer } from "@/lib/contracts/poll";
export const PROGRAM_ABI = [
  "function createProgram(uint8 kind,uint32 cap,uint64 closesAt,uint256 amountPerClaim,uint256 maxAward) returns (uint256)",
  "function fundProgram(uint256 id,uint256 amount)",
  "function totalBudgets() view returns (uint256)",
  "function hasRole(bytes32 role,address account) view returns (bool)",
  "function OPERATOR_ROLE() view returns (bytes32)",
  "function stamp((uint256 programId,bytes32 nullifier,address recipient,uint256 chainId,address verifyingContract,uint64 expiresAt,bytes32 nonce,bytes32 purpose) a,bytes sig)",
  "function award(uint256 programId,bytes32 nullifier,address recipient,uint256 amount)",
  "function getProgram(uint256 id) view returns ((uint8 kind,uint32 cap,uint64 closesAt,uint256 amountPerClaim,uint256 maxAward,uint256 budget,bool closed))",
  "function stampCount(uint256 id) view returns (uint256)",
  "function nullifierUsed(uint256 id,bytes32 n) view returns (bool)",
  "function awarded(uint256 id,bytes32 n) view returns (bool)",
  "function issuer() view returns (address)",
  "event ProgramCreated(uint256 indexed programId,uint8 kind,uint32 cap,uint64 closesAt,uint256 amountPerClaim,uint256 maxAward)",
] as const;
export function programAddress() { return process.env.NEXT_PUBLIC_PROGRAMS_ADDRESS ? getAddress(process.env.NEXT_PUBLIC_PROGRAMS_ADDRESS) : null; }
export function programProvider() { return createReadOnlyFujiProvider(); }
export function programRelayer(provider: ReturnType<typeof createReadOnlyFujiProvider>) { return pollRelayer(provider); }
export function programContract(runner: ConstructorParameters<typeof Contract>[2]) { const address = programAddress(); if (!address) throw new Error("Programs contract is not configured."); return new Contract(address, PROGRAM_ABI, runner); }

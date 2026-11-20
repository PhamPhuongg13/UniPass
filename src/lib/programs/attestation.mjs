import { Wallet, verifyTypedData } from "ethers";
export const ATTESTATION_TYPES = { UniPassAttestation: [
  { name: "programId", type: "string" }, { name: "chainProgramId", type: "uint256" },
  { name: "nullifier", type: "bytes32" }, { name: "school", type: "string" },
  { name: "issuedAt", type: "uint64" }, { name: "expiresAt", type: "uint64" },
  { name: "contract", type: "address" },
] };
export function attestationDomain(contract) { return { name: "UniPass Attestation", version: "1", chainId: 43113, verifyingContract: contract }; }
export async function signAttestation(privateKey, value) { return new Wallet(privateKey).signTypedData(attestationDomain(value.contract), ATTESTATION_TYPES, value); }
export function verifyAttestation(value, signature, issuer) { return verifyTypedData(attestationDomain(value.contract), ATTESTATION_TYPES, value, signature).toLowerCase() === issuer.toLowerCase(); }

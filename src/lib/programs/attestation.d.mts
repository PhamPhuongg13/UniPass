export const ATTESTATION_TYPES: { UniPassAttestation: { name: string; type: string }[] };
export function attestationDomain(contract: string): { name: string; version: string; chainId: number; verifyingContract: string };
export function signAttestation(privateKey: string, value: Record<string, unknown>): Promise<string>;
export function verifyAttestation(value: Record<string, unknown>, signature: string, issuer: string): boolean;

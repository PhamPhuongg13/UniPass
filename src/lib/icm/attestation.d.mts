export const PASSPORT_TYPES: { PassportAttestation: { name: string; type: string }[] };
export function passportDomain(bridge: string): { name: string; version: string; chainId: number; verifyingContract: string };
export function signPassportAttestation(privateKey: string, bridge: string, wallet: string, senderDomain: string, expiresAt: Date): Promise<{ attestation: { wallet: string; schoolHash: string; expiresAt: number; nonce: string; deadline: number }; signature: string }>;

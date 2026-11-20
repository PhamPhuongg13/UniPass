export const PROGRAM_PURPOSE: string;
export const STAMP_AUTH_TYPES: { StampAuthorization: { name: string; type: string }[] };
export function buildStampAuthorization(input: { programId: string | number | bigint; nullifier: string; recipient: string; verifyingContract: string; nowSeconds?: number }): { domain: { name: string; version: string; chainId: number; verifyingContract: string }; authorization: { programId: string; nullifier: string; recipient: string; chainId: number; verifyingContract: string; expiresAt: number; nonce: string; purpose: string } };

export const POLL_PURPOSE: string;
export const POLL_DOMAIN_NAME: string;
export const POLL_DOMAIN_VERSION: string;
export const VOTE_AUTH_TYPES: Record<string, { name: string; type: string }[]>;
export function buildVoteAuthorization(input: { pollId: string | number | bigint; option: number; voterNullifier: string; verifyingContract: string; nowSeconds?: number }): { domain: { name: string; version: string; chainId: number; verifyingContract: string }; authorization: { pollId: string; option: number; voterNullifier: string; chainId: number; verifyingContract: string; expiresAt: number; nonce: string; purpose: string } };

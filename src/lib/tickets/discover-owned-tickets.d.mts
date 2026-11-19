export const DIRECT_DISCOVERY_LIMIT: number;
export const DIRECT_DISCOVERY_BATCH: number;
export function discoverOwnedTokenIds(options: {
  balance: bigint | string | number;
  nextTokenId: bigint | string | number;
  walletAddress: string;
  ownerOf: (tokenId: bigint) => Promise<string | null>;
  limit?: number;
  batchSize?: number;
}): Promise<{ tokenIds: string[]; complete: boolean; scanned: number }>;

export const DIRECT_DISCOVERY_LIMIT = 512;
export const DIRECT_DISCOVERY_BATCH = 8;

/**
 * Find currently owned ERC721 token IDs without logs or enumeration support.
 * ownerOf must return null for nonexistent token IDs and throw on RPC failures.
 */
export async function discoverOwnedTokenIds({ balance, nextTokenId, walletAddress, ownerOf, limit = DIRECT_DISCOVERY_LIMIT, batchSize = DIRECT_DISCOVERY_BATCH }) {
  const wanted = BigInt(balance);
  const nextId = BigInt(nextTokenId);
  if (wanted <= 0n || nextId <= 0n) return { tokenIds: [], complete: wanted <= 0n, scanned: 0 };
  if (!Number.isInteger(limit) || limit < 1 || !Number.isInteger(batchSize) || batchSize < 1 || batchSize > 32) throw new RangeError("Invalid direct ticket discovery bounds.");

  const last = nextId - 1n;
  const first = last >= BigInt(limit - 1) ? last - BigInt(limit - 1) : 0n;
  const target = walletAddress.toLowerCase();
  const tokenIds = [];
  let cursor = last;
  let scanned = 0;

  while (cursor >= first && BigInt(tokenIds.length) < wanted) {
    const ids = [];
    for (let count = 0; count < batchSize && cursor >= first; count++, cursor--) ids.push(cursor);
    const owners = await Promise.all(ids.map(async id => ({ id, owner: await ownerOf(id) })));
    scanned += ids.length;
    for (const item of owners) if (item.owner?.toLowerCase() === target) tokenIds.push(String(item.id));
  }

  return { tokenIds, complete: BigInt(tokenIds.length) >= wanted, scanned };
}

import test from "node:test";
import assert from "node:assert/strict";
import { discoverOwnedTokenIds } from "../../src/lib/tickets/discover-owned-tickets.mjs";

test("directly finds the current wallet's newest ticket and stops once balance is satisfied", async () => {
  const wallet = "0xabc0000000000000000000000000000000000001";
  const calls = [];
  const result = await discoverOwnedTokenIds({
    balance: 1n,
    nextTokenId: 8n,
    walletAddress: wallet.toUpperCase(),
    ownerOf: async id => { calls.push(id); return id === 7n ? wallet : null; },
  });
  assert.deepEqual(result, { tokenIds: ["7"], complete: true, scanned: 8 });
  assert.equal(calls.length, 8);
});

test("does not scan without a balance and reports when a bounded window is incomplete", async () => {
  let calls = 0;
  const empty = await discoverOwnedTokenIds({ balance: 0n, nextTokenId: 100n, walletAddress: "0x1", ownerOf: async () => { calls++; return null; } });
  assert.deepEqual(empty, { tokenIds: [], complete: true, scanned: 0 });
  assert.equal(calls, 0);

  const incomplete = await discoverOwnedTokenIds({ balance: 1n, nextTokenId: 1_000n, walletAddress: "0x1", limit: 32, batchSize: 8, ownerOf: async () => null });
  assert.deepEqual(incomplete, { tokenIds: [], complete: false, scanned: 32 });
});

test("propagates RPC failures instead of reporting no tickets", async () => {
  await assert.rejects(discoverOwnedTokenIds({ balance: 1n, nextTokenId: 4n, walletAddress: "0x1", ownerOf: async () => { throw new Error("RPC timeout"); } }), /RPC timeout/);
});

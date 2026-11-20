import test from "node:test";
import assert from "node:assert/strict";
import { derivePollNullifier, deriveEventNullifier } from "../../src/lib/eligibility/nullifier.mjs";
const secret = Buffer.alloc(32, 5);
const base = `0x${"aa".repeat(32)}`;
const poll = { chainId: 43113, contract: "0x1000000000000000000000000000000000000001", pollId: "1" };
test("poll nullifiers are deterministic, scoped and distinct from event nullifiers", () => {
  const first = derivePollNullifier(secret, base, poll);
  assert.equal(first, derivePollNullifier(secret, base, poll));
  assert.notEqual(first, derivePollNullifier(secret, base, {...poll, pollId:"2"}));
  assert.notEqual(first, derivePollNullifier(secret, base, {...poll, contract:"0x2000000000000000000000000000000000000002"}));
  assert.notEqual(first, deriveEventNullifier(secret, base, {chainId:43113,manager:poll.contract,eventId:"1"}));
});

import test from "node:test";
import assert from "node:assert/strict";
import { canUseTicketOwnershipActions, deriveTicketPageState } from "../../src/lib/tickets/ticket-page-state.mjs";

const indexCases = [
  { indexStatus: null, indexStale: false, expected: "unknown" },
  { indexStatus: null, indexStale: true, expected: "unknown" },
  { indexStatus: "needs-deployment-block", indexStale: false, expected: "needs-setup" },
  { indexStatus: "needs-deployment-block", indexStale: true, expected: "needs-setup" },
  { indexStatus: "syncing", indexStale: false, expected: "syncing" },
  { indexStatus: "syncing", indexStale: true, expected: "syncing" },
  { indexStatus: "ready", indexStale: false, expected: "ready" },
  { indexStatus: "ready", indexStale: true, expected: "stale" },
];
const rpcCases = ["idle", "checking", "available", "partial", "unavailable"];
const ownershipCases = [
  { values: [], expected: "none" },
  { values: ["verified"], expected: "verified" },
  { values: ["unverified"], expected: "unverified" },
  { values: ["verified", "unverified"], expected: "mixed" },
  { values: ["not-owned"], expected: "not-owned" },
];

test("indexer, RPC, cached metadata and ownership stay independent in every state combination", () => {
  for (const index of indexCases) for (const rpcState of rpcCases) for (const ownership of ownershipCases) {
    const result = deriveTicketPageState({
      metadataState: ownership.values.length ? "available" : "empty",
      ...index,
      rpcState,
      ownershipStates: ownership.values,
    });
    assert.equal(result.indexerState, index.expected);
    assert.equal(result.rpcState, rpcState);
    assert.equal(result.ownershipState, ownership.expected);
    assert.ok(result.notice === null || typeof result.notice.text === "string");
    assert.equal(canUseTicketOwnershipActions(ownership.values.length === 1 ? ownership.values[0] : ownership.expected), ownership.expected === "verified");
  }
});

test("an unconfigured deployment block does not create a second syncing notice", () => {
  const result = deriveTicketPageState({ metadataState: "available", indexStatus: "needs-deployment-block", indexStale: true, rpcState: "available", ownershipStates: ["verified"] });
  assert.equal(result.indexerState, "needs-setup");
  assert.equal(result.notice.code, "index-needs-setup");
  assert.match(result.notice.text, /start block/);
});

test("RPC failure outranks index warnings while cached ticket metadata stays unverified", () => {
  const result = deriveTicketPageState({ metadataState: "available", indexStatus: "syncing", indexStale: true, rpcState: "unavailable", ownershipStates: ["unverified"] });
  assert.equal(result.pageState, "rpc-error");
  assert.equal(result.notice.code, "rpc-unavailable");
  assert.match(result.notice.text, /Saved ticket data/);
  assert.equal(canUseTicketOwnershipActions("unverified"), false);
});

test("ownership remains verified when only the index is stale or secondary RPC state is partial", () => {
  const stale = deriveTicketPageState({ metadataState: "available", indexStatus: "ready", indexStale: true, rpcState: "available", ownershipStates: ["verified"] });
  assert.equal(stale.ownershipState, "verified");
  assert.equal(stale.notice.code, "index-syncing");
  const partial = deriveTicketPageState({ metadataState: "available", indexStatus: "ready", rpcState: "partial", ownershipStates: ["verified"] });
  assert.equal(partial.ownershipState, "verified");
  assert.equal(partial.notice.code, "rpc-partial-verified");
});

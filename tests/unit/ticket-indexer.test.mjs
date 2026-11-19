import test from "node:test";
import assert from "node:assert/strict";
import { Interface } from "ethers";
import { buildBlockRanges, fetchLogsWithRetry, isTransientRpcError, MAX_LOG_BATCH_SIZE, SAFE_LOG_BATCH_SIZE, runTicketIndexer, TICKET_MINTED_ABI } from "../../scripts/index-fuji-tickets.mjs";

test("block ranges cover every inclusive block exactly once and never exceed 100", () => {
  assert.equal(SAFE_LOG_BATCH_SIZE, 90);
  for (const count of [0, 1, 90, 91, 100, 101, 201, 100_001]) {
    const ranges = buildBlockRanges(17, 17 + count - 1);
    const covered = ranges.reduce((sum, range) => sum + range.toBlock - range.fromBlock + 1, 0);
    assert.equal(covered, count);
    assert.ok(ranges.every(range => range.toBlock - range.fromBlock + 1 <= MAX_LOG_BATCH_SIZE));
    for (let index = 1; index < ranges.length; index++) assert.equal(ranges[index].fromBlock, ranges[index - 1].toBlock + 1);
  }
  assert.deepEqual(buildBlockRanges(9, 8), []);
  assert.throws(() => buildBlockRanges(0, 200, 101), RangeError);
});

test("last and single block ranges have correct inclusive bounds", () => {
  assert.deepEqual(buildBlockRanges(0, 90), [{ fromBlock: 0, toBlock: 89 }, { fromBlock: 90, toBlock: 90 }]);
  assert.deepEqual(buildBlockRanges(42, 42), [{ fromBlock: 42, toBlock: 42 }]);
});

test("transient rate and server errors retry with bounded backoff; permanent errors do not", async () => {
  assert.equal(isTransientRpcError({ code: -32602, message: "invalid argument" }), false);
  assert.equal(isTransientRpcError({ message: "HTTP 429 Too Many Requests" }), true);
  assert.equal(isTransientRpcError({ message: "gateway 503 timeout" }), true);
  let calls = 0;
  const result = await fetchLogsWithRetry(async () => {
    calls++;
    if (calls < 3) throw new Error("HTTP 429 rate limit");
    return ["ok"];
  }, {}, { retries: 2, delay: async () => {}, random: () => 0 });
  assert.deepEqual(result, ["ok"]);
  assert.equal(calls, 3);
  calls = 0;
  await assert.rejects(fetchLogsWithRetry(async () => { calls++; throw new Error("invalid argument"); }, {}, { delay: async () => {} }));
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(fetchLogsWithRetry(async () => { calls++; throw new Error("HTTP 503 timeout"); }, {}, { retries: 2, delay: async () => {}, random: () => 0 }));
  assert.equal(calls, 3);
});

test("replaying a TicketMinted range restores the matching registration mirror", async () => {
  const address = "0x1234567890123456789012345678901234567890";
  const student = "0xabcdef0000000000000000000000000000000001";
  const eventInterface = new Interface(TICKET_MINTED_ABI);
  const encoded = eventInterface.encodeEventLog(eventInterface.getEvent("TicketMinted"), [7n, 42n, student]);
  const oldRow = { txHash: `0x${"11".repeat(32)}`, tokenId: "7", eventId: "42", studentWallet: student.toLowerCase() };
  const registrationUpserts = [];
  const db = {
    chainSyncCheckpoint: { findUnique: async () => null, upsert: async () => {} },
    ticketChainLog: { findMany: async () => [oldRow], deleteMany: async () => {}, create: async () => {} },
    eventMetadata: { findFirst: async () => ({ id: "event-metadata-row" }) },
    ticketMirror: { deleteMany: async () => {}, upsert: async () => {} },
    registrationMirror: { deleteMany: async () => {}, upsert: async args => registrationUpserts.push(args) },
    $transaction: async callback => callback(db),
  };
  const provider = {
    getNetwork: async () => ({ chainId: 43113n }),
    getCode: async () => "0x6000",
    getBlockNumber: async () => 103,
    getLogs: async () => [{ address, blockNumber: 100, transactionIndex: 0, index: 0, blockHash: `0x${"22".repeat(32)}`, transactionHash: `0x${"33".repeat(32)}`, topics: encoded.topics, data: encoded.data }],
  };
  const previous = {
    address: process.env.NEXT_PUBLIC_TICKET_ADDRESS,
    deploymentBlock: process.env.TICKET_DEPLOYMENT_BLOCK,
    maxBlocks: process.env.TICKET_INDEXER_MAX_BLOCKS_PER_RUN,
  };
  process.env.NEXT_PUBLIC_TICKET_ADDRESS = address;
  process.env.TICKET_DEPLOYMENT_BLOCK = "100";
  process.env.TICKET_INDEXER_MAX_BLOCKS_PER_RUN = "1";
  try {
    const result = await runTicketIndexer({ db, provider, log: () => {} });
    assert.equal(result.processedBlocks, 1);
    assert.equal(registrationUpserts.length, 1);
    assert.deepEqual(registrationUpserts[0].where.eventId_wallet, { eventId: "event-metadata-row", wallet: student.toLowerCase() });
    assert.equal(registrationUpserts[0].create.status, "MINTED");
    assert.equal(registrationUpserts[0].create.chainTx, `0x${"33".repeat(32)}`);
    assert.equal(registrationUpserts[0].create.blockNumber, 100n);
  } finally {
    if (previous.address === undefined) delete process.env.NEXT_PUBLIC_TICKET_ADDRESS; else process.env.NEXT_PUBLIC_TICKET_ADDRESS = previous.address;
    if (previous.deploymentBlock === undefined) delete process.env.TICKET_DEPLOYMENT_BLOCK; else process.env.TICKET_DEPLOYMENT_BLOCK = previous.deploymentBlock;
    if (previous.maxBlocks === undefined) delete process.env.TICKET_INDEXER_MAX_BLOCKS_PER_RUN; else process.env.TICKET_INDEXER_MAX_BLOCKS_PER_RUN = previous.maxBlocks;
  }
});

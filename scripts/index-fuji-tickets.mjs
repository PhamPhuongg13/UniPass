import { randomInt } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { Interface, JsonRpcProvider } from "ethers";
import { PrismaClient } from "@prisma/client";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const SAFE_LOG_BATCH_SIZE = 90;
export const MAX_LOG_BATCH_SIZE = 100;
export const TICKET_MINTED_ABI = ["event TicketMinted(uint256 indexed tokenId,uint256 indexed eventId,address indexed student)"];
const ticketInterface = new Interface(TICKET_MINTED_ABI);

export function buildBlockRanges(fromBlock, toBlock, batchSize = SAFE_LOG_BATCH_SIZE) {
  if (!Number.isSafeInteger(fromBlock) || !Number.isSafeInteger(toBlock) || fromBlock < 0) throw new RangeError("Block bounds must be non-negative safe integers.");
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > MAX_LOG_BATCH_SIZE) throw new RangeError("Batch size must be between 1 and 100 blocks.");
  if (toBlock < fromBlock) return [];
  const ranges = [];
  for (let start = fromBlock; start <= toBlock;) {
    const end = Math.min(start + batchSize - 1, toBlock);
    ranges.push({ fromBlock: start, toBlock: end });
    start = end + 1;
  }
  return ranges;
}

function errorText(error) {
  const parts = [error?.message, error?.shortMessage, error?.code, error?.info?.error?.message, error?.error?.message];
  return parts.filter(Boolean).join(" ").toLowerCase();
}

export function isTransientRpcError(error) {
  const message = errorText(error);
  return /\b429\b|\b1015\b|rate.?limit|too many requests|timeout|timed out|temporar|\b5\d\d\b|econnreset|network error|socket hang up|exceeded maximum retry/i.test(message);
}

export async function fetchLogsWithRetry(getLogs, filter, { retries = 3, delay = sleep, random = Math.random } = {}) {
  for (let attempt = 0; ; attempt += 1) {
    try { return await getLogs(filter); }
    catch (error) {
      if (!isTransientRpcError(error) || attempt >= retries) throw error;
      const base = Math.min(8_000, 400 * (2 ** attempt));
      await delay(base + Math.floor(random() * Math.min(500, base / 2)));
    }
  }
}

function integerEnv(name, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const raw = process.env[name];
  if (!raw) return fallback;
  if (!/^\d+$/.test(raw)) throw new Error(`${name} must be a non-negative integer.`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${name} is outside its allowed range.`);
  return value;
}

export async function runTicketIndexer({ db = new PrismaClient(), provider, log = console.log, shouldStop = () => false } = {}) {
  const address = process.env.NEXT_PUBLIC_TICKET_ADDRESS?.toLowerCase();
  const rawStartBlock = process.env.TICKET_DEPLOYMENT_BLOCK;
  if (!address || !/^0x[0-9a-f]{40}$/.test(address)) throw new Error("Set NEXT_PUBLIC_TICKET_ADDRESS to the owner-confirmed Fuji deployment.");
  if (!rawStartBlock || !/^\d+$/.test(rawStartBlock)) throw new Error("Set TICKET_DEPLOYMENT_BLOCK to the verified Ticket deployment block. The worker will not guess it.");
  const deploymentBlock = BigInt(rawStartBlock);
  if (deploymentBlock > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("TICKET_DEPLOYMENT_BLOCK is outside the supported block range.");
  const maxBlocks = integerEnv("TICKET_INDEXER_MAX_BLOCKS_PER_RUN", 9_000, { min: 1, max: 90_000 });
  const confirmations = integerEnv("TICKET_INDEXER_CONFIRMATIONS", 3, { min: 0, max: 10_000 });
  const reorgWindow = integerEnv("TICKET_INDEXER_REORG_WINDOW", 12, { min: 0, max: 1_000 });
  const rpcUrl = process.env.NEXT_PUBLIC_AVALANCHE_RPC_URL || "https://api.avax-test.network/ext/bc/C/rpc";
  const rpc = provider ?? new JsonRpcProvider(rpcUrl, 43113, { batchMaxCount: 1, staticNetwork: true });
  const ownProvider = !provider;
  const checkpointKey = `43113:${address}:TicketMinted`;
  const eventTopic = ticketInterface.getEvent("TicketMinted").topicHash;
  let processedBlocks = 0;
  let requests = 0;

  try {
    const network = await rpc.getNetwork();
    if (Number(network.chainId) !== 43113) throw new Error("Configured RPC is not Avalanche Fuji (43113).");
    const code = await rpc.getCode(address);
    if (!code || code === "0x") throw new Error("No contract bytecode exists at NEXT_PUBLIC_TICKET_ADDRESS on Fuji.");

    const head = await rpc.getBlockNumber();
    const safeHead = Math.max(-1, head - confirmations);
    const checkpoint = await db.chainSyncCheckpoint.findUnique({ where: { chainId_contractAddress_eventName: { chainId: 43113, contractAddress: address, eventName: "TicketMinted" } } });
    const nextBlock = checkpoint ? Number(checkpoint.nextBlock) : Number(deploymentBlock);
    const fromBlock = checkpoint ? Math.max(Number(deploymentBlock), Math.min(nextBlock, safeHead + 1) - reorgWindow) : Number(deploymentBlock);
    const budgetEnd = Math.min(safeHead, fromBlock + maxBlocks - 1);

    if (safeHead < Number(deploymentBlock)) {
      await db.chainSyncCheckpoint.upsert({
        where: { chainId_contractAddress_eventName: { chainId: 43113, contractAddress: address, eventName: "TicketMinted" } },
        create: { id: checkpointKey, chainId: 43113, contractAddress: address, eventName: "TicketMinted", nextBlock: deploymentBlock, caughtUp: false },
        update: { caughtUp: false },
      });
      return { requests, processedBlocks, caughtUp: false };
    }
    if (budgetEnd < fromBlock) return { requests, processedBlocks, caughtUp: true };

    for (const range of buildBlockRanges(fromBlock, budgetEnd)) {
      if (shouldStop()) break;
      const filter = { address, fromBlock: range.fromBlock, toBlock: range.toBlock, topics: [eventTopic] };
      const logs = await fetchLogsWithRetry(async value => {
        requests += 1;
        return rpc.getLogs(value);
      }, filter);
      const decoded = logs
        .filter(item => !item.removed && item.address.toLowerCase() === address)
        .sort((a, b) => a.blockNumber - b.blockNumber || a.transactionIndex - b.transactionIndex || a.index - b.index)
        .map(item => {
          const parsed = ticketInterface.parseLog({ topics: [...item.topics], data: item.data });
          return {
            chainId: 43113, contractAddress: address, txHash: item.transactionHash, logIndex: item.index,
            blockNumber: BigInt(item.blockNumber), transactionIndex: item.transactionIndex, blockHash: item.blockHash,
            tokenId: String(parsed.args.tokenId), eventId: String(parsed.args.eventId), studentWallet: String(parsed.args.student).toLowerCase(),
          };
        });

      await db.$transaction(async tx => {
        // Re-read a short finalized tail so an interrupted run and small reorg are idempotent.
        const previous = await tx.ticketChainLog.findMany({ where: { chainId: 43113, contractAddress: address, blockNumber: { gte: BigInt(range.fromBlock), lte: BigInt(range.toBlock) } }, select: { txHash: true, tokenId: true, eventId: true, studentWallet: true } });
        for (const old of previous) {
          const event = await tx.eventMetadata.findFirst({ where: { chainEventId: old.eventId }, select: { id: true } });
          if (event) {
            await tx.ticketMirror.deleteMany({ where: { eventId: event.id, tokenId: old.tokenId, chainTx: old.txHash } });
            await tx.registrationMirror.deleteMany({ where: { eventId: event.id, wallet: old.studentWallet, chainTx: old.txHash } });
          }
        }
        await tx.ticketChainLog.deleteMany({ where: { chainId: 43113, contractAddress: address, blockNumber: { gte: BigInt(range.fromBlock), lte: BigInt(range.toBlock) } } });
        for (const row of decoded) {
          await tx.ticketChainLog.create({ data: row });
          const event = await tx.eventMetadata.findFirst({ where: { chainEventId: row.eventId }, select: { id: true } });
          if (event) {
            await tx.ticketMirror.upsert({
              where: { eventId_tokenId: { eventId: event.id, tokenId: row.tokenId } },
              create: { eventId: event.id, tokenId: row.tokenId, ownerWallet: row.studentWallet, chainTx: row.txHash },
              update: { ownerWallet: row.studentWallet, chainTx: row.txHash },
            });
            await tx.registrationMirror.upsert({
              where: { eventId_wallet: { eventId: event.id, wallet: row.studentWallet } },
              create: { eventId: event.id, wallet: row.studentWallet, status: "MINTED", chainTx: row.txHash, blockNumber: row.blockNumber },
              update: { status: "MINTED", chainTx: row.txHash, blockNumber: row.blockNumber },
            });
          }
        }
        const next = BigInt(range.toBlock + 1);
        await tx.chainSyncCheckpoint.upsert({
          where: { chainId_contractAddress_eventName: { chainId: 43113, contractAddress: address, eventName: "TicketMinted" } },
          create: { id: checkpointKey, chainId: 43113, contractAddress: address, eventName: "TicketMinted", nextBlock: next, caughtUp: range.toBlock >= safeHead, lastSyncedAt: new Date() },
          update: { nextBlock: next, caughtUp: range.toBlock >= safeHead, lastSyncedAt: new Date() },
        });
      });
      processedBlocks += range.toBlock - range.fromBlock + 1;
      log(JSON.stringify({ event: "ticket-indexer-progress", fromBlock: range.fromBlock, toBlock: range.toBlock, blocks: processedBlocks, requests, logs: decoded.length }));
    }
    return { requests, processedBlocks, caughtUp: budgetEnd >= safeHead && !shouldStop() };
  } finally {
    if (ownProvider) await rpc.destroy();
    if (!provider) await db.$disconnect();
  }
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? "")).href) {
  let stopping = false;
  process.once("SIGINT", () => { stopping = true; });
  process.once("SIGTERM", () => { stopping = true; });
  runTicketIndexer({ shouldStop: () => stopping })
    .then(result => console.log(JSON.stringify({ event: "ticket-indexer-finished", ...result })))
    .catch(error => {
      // Keep diagnostics useful without printing wallet identifiers or request payloads.
      console.error(JSON.stringify({ event: "ticket-indexer-failed", name: error?.name, code: error?.code, transient: isTransientRpcError(error) }));
      process.exitCode = 1;
    });
}

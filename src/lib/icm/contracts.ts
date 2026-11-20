import { Contract, Interface, JsonRpcProvider, getAddress, isAddress, isHexString, zeroPadValue, type ContractRunner } from "ethers";
import { resilientProvider } from "@/lib/contracts/rpc";
import { createReadOnlyFujiProvider } from "@/lib/contracts/chain";
export const FUJI_BLOCKCHAIN_ID = "0x7fc93d85c6d62c5b2ac0b519c87010ea5294012d1e407030d6acd0021cac10d5";
export const TELEPORTER_ADDRESS = "0x253b2784c75e510dD0fF1da844684a1aC0aa5fcf";
export const BRIDGE_ABI = [
  "function sendPassport(bytes32,(address wallet,bytes32 schoolHash,uint64 expiresAt,uint64 nonce,uint64 deadline),bytes) returns (bytes32)",
  "function l1StampOf(address,bytes32,uint256) view returns (uint64)",
  "function issuer() view returns (address)",
  "event L1StampReceived(address indexed wallet,bytes32 indexed source,uint256 indexed questId,uint64 claimedAt)",
  "event PassportSent(address indexed wallet,bytes32 indexed l1BlockchainID,bytes32 messageID,bytes32 schoolHash,uint64 expiresAt,bool zkVerified)",
] as const;
export const MIRROR_ABI = [
  "function passportOf(address) view returns ((bytes32 schoolHash,uint64 expiresAt,bool zkVerified,uint64 sentAt,uint64 receivedAt))",
  "function isStudent(address) view returns (bool)",
  "event PassportMirrored(address indexed wallet,bytes32 schoolHash,uint64 expiresAt,bool zkVerified)",
] as const;
export const QUEST_ABI = [
  "function claimed(address,uint256) view returns (bool)",
  "function claimFor(address,uint256,uint64,bytes)",
  "function claimMessage(address,uint256,uint64) view returns (string)",
  "event QuestClaimed(address indexed wallet,uint256 indexed questId)",
] as const;
export const bridgeInterface = new Interface(BRIDGE_ABI);
export const mirrorInterface = new Interface(MIRROR_ABI);
export const questInterface = new Interface(QUEST_ABI);
export function icmConfigured() {
  return Boolean(process.env.L1_RPC_URL && Number.isSafeInteger(Number(process.env.NEXT_PUBLIC_L1_CHAIN_ID)) && Number(process.env.NEXT_PUBLIC_L1_CHAIN_ID) > 0 && isHexString(process.env.L1_BLOCKCHAIN_ID ?? "", 32) && isAddress(process.env.NEXT_PUBLIC_PASSPORT_BRIDGE_ADDRESS ?? "") && isAddress(process.env.L1_MIRROR_ADDRESS ?? "") && isAddress(process.env.L1_QUEST_ADDRESS ?? "") && process.env.UNIPASS_REGISTRATION_ISSUER_PRIVATE_KEY && process.env.POLL_RELAYER_PRIVATE_KEY);
}
export function icmPublicConfig() {
  if (!icmConfigured()) return null;
  return { name: process.env.NEXT_PUBLIC_L1_NAME || "UniPass L1", chainId: Number(process.env.NEXT_PUBLIC_L1_CHAIN_ID), blockchainID: process.env.L1_BLOCKCHAIN_ID!, bridge: getAddress(process.env.NEXT_PUBLIC_PASSPORT_BRIDGE_ADDRESS!), quest: getAddress(process.env.L1_QUEST_ADDRESS!), explorer: process.env.NEXT_PUBLIC_L1_EXPLORER_URL || "" };
}
export function bridgeContract(runner: ContractRunner) { return new Contract(getAddress(process.env.NEXT_PUBLIC_PASSPORT_BRIDGE_ADDRESS!), BRIDGE_ABI, runner); }
export function mirrorContract(runner: ContractRunner) { return new Contract(getAddress(process.env.L1_MIRROR_ADDRESS!), MIRROR_ABI, runner); }
export function questContract(runner: ContractRunner) { return new Contract(getAddress(process.env.L1_QUEST_ADDRESS!), QUEST_ABI, runner); }
export function createL1Provider() { return resilientProvider(process.env.L1_RPC_URL!, Number(process.env.NEXT_PUBLIC_L1_CHAIN_ID)); }
async function recentEvent(provider: JsonRpcProvider, address: string, topic: string, wallet: string, extraTopics: (string | null)[] = []) {
  const tip = await provider.getBlockNumber();
  const floor = Math.max(0, tip - 3999);
  for (let end = tip; end >= floor; end -= 2000) {
    const start = Math.max(floor, end - 1999);
    const logs = await provider.getLogs({ address, topics: [topic, zeroPadValue(wallet, 32), ...extraTopics], fromBlock: start, toBlock: end });
    if (logs.length) return logs.at(-1)!;
  }
  return null;
}
export async function readIcmStatus(wallet: string) {
  const config = icmPublicConfig(); if (!config) return null;
  const fuji = createReadOnlyFujiProvider(), l1 = createL1Provider();
  try {
    const [passport, student, questClaimed, stamp] = await Promise.all([
      mirrorContract(l1).passportOf(wallet), mirrorContract(l1).isStudent(wallet), questContract(l1).claimed(wallet, 1), bridgeContract(fuji).l1StampOf(wallet, config.blockchainID, 1),
    ]);
    let fujiSendTx: string | null = null, l1DeliveryTx: string | null = null, l1ClaimTx: string | null = null, fujiDeliveryTx: string | null = null;
    let fujiSentAt = 0, l1ClaimedAt = 0, fujiReceivedAt = 0;
    try { const log = await recentEvent(fuji, config.bridge, bridgeInterface.getEvent("PassportSent")!.topicHash, wallet, [config.blockchainID]); fujiSendTx = log?.transactionHash ?? null; if (log) fujiSentAt = (await fuji.getBlock(log.blockNumber))?.timestamp ?? 0; } catch {}
    try { if (passport.receivedAt > BigInt(0)) l1DeliveryTx = (await recentEvent(l1, process.env.L1_MIRROR_ADDRESS!, mirrorInterface.getEvent("PassportMirrored")!.topicHash, wallet))?.transactionHash ?? null; } catch {}
    try { if (questClaimed) { const log = await recentEvent(l1, config.quest, questInterface.getEvent("QuestClaimed")!.topicHash, wallet, [zeroPadValue("0x01", 32)]); l1ClaimTx = log?.transactionHash ?? null; if (log) l1ClaimedAt = (await l1.getBlock(log.blockNumber))?.timestamp ?? 0; } } catch {}
    try { if (stamp > BigInt(0)) { const log = await recentEvent(fuji, config.bridge, bridgeInterface.getEvent("L1StampReceived")!.topicHash, wallet, [config.blockchainID, zeroPadValue("0x01", 32)]); fujiDeliveryTx = log?.transactionHash ?? null; if (log) fujiReceivedAt = (await fuji.getBlock(log.blockNumber))?.timestamp ?? 0; } } catch {}
    return { passport: { schoolHash: String(passport.schoolHash), expiresAt: Number(passport.expiresAt), zkVerified: Boolean(passport.zkVerified), sentAt: Number(passport.sentAt), receivedAt: Number(passport.receivedAt) }, isStudent: Boolean(student), claimed: Boolean(questClaimed), claimedAt: Number(stamp), fujiSentAt, l1ClaimedAt, fujiReceivedAt, fujiSendTx, l1DeliveryTx, l1ClaimTx, fujiDeliveryTx };
  } finally { fuji.destroy(); l1.destroy(); }
}

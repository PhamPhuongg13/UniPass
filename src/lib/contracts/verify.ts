import { JsonRpcProvider } from "ethers";
import { fujiProvider } from "@/lib/contracts/rpc";
import { EVENT_MANAGER_ADDRESS, eventManagerInterface } from "./chain";

export const FUJI_CHAIN_ID = 43113;
const rpcUrl = () => process.env.NEXT_PUBLIC_AVALANCHE_RPC_URL || "https://api.avax-test.network/ext/bc/C/rpc";

export function createFujiProvider() {
  return fujiProvider();
}

export async function verifyEventCreationTransaction(chainTx: string, expectedEventId: string, organizerWallet: string) {
  const provider = createFujiProvider();
  try {
    const network = await provider.getNetwork();
    if (Number(network.chainId) !== FUJI_CHAIN_ID) throw new Error("RPC is not on Fuji.");
    const receipt = await provider.getTransactionReceipt(chainTx);
    if (!receipt || receipt.status !== 1 || receipt.to?.toLowerCase() !== EVENT_MANAGER_ADDRESS.toLowerCase() || receipt.from.toLowerCase() !== organizerWallet.toLowerCase()) {
      throw new Error("Receipt is not a successful organizer createEvent transaction on EventManager.");
    }
    const eventCreated = receipt.logs.flatMap(log => {
      if (log.address.toLowerCase() !== EVENT_MANAGER_ADDRESS.toLowerCase()) return [];
      try { const item = eventManagerInterface.parseLog({ topics: [...log.topics], data: log.data }); return item?.name === "EventCreated" ? [item] : []; } catch { return []; }
    }).find(log => String(log.args.eventId) === expectedEventId && String(log.args.organizer).toLowerCase() === organizerWallet.toLowerCase());
    if (!eventCreated) throw new Error("No EventCreated matches the event ID and organizer wallet.");
    return { blockNumber: BigInt(receipt.blockNumber), capacity: BigInt(eventCreated.args.capacity), deadline: BigInt(eventCreated.args.registrationDeadline) };
  } finally { await provider.destroy(); }
}

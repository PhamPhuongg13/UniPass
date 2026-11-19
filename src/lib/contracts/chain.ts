import { Contract, Interface, JsonRpcProvider, type ContractRunner } from "ethers";
import { FUJI_CHAIN_ID, connectWallet, switchToFuji } from "@/lib/web3/client";

export const EVENT_MANAGER_ADDRESS = process.env.NEXT_PUBLIC_EVENT_MANAGER_ADDRESS ?? "";
export const TICKET_ADDRESS = process.env.NEXT_PUBLIC_TICKET_ADDRESS ?? "";

export const EVENT_MANAGER_ABI = [
  "function cancelEvent(uint256 _id)",
  "function checkInStudent(uint256 tokenId)",
  "function createEvent(uint256 _capacity,uint64 _registrationDeadline)",
  "function registerEvent(uint256 eventId)",
  "function canRegister(uint256 _id) view returns (bool)",
  "function getEvent(uint256 _id) view returns ((uint256 id,address organizer,uint256 capacity,uint256 minted,uint256 registrationDeadline,bool active))",
  "function nextEventId() view returns (uint256)",
  "function owner() view returns (address)",
  "function registered(uint256,address) view returns (bool)",
  "function ticketContract() view returns (address)",
  "event EventCreated(uint256 indexed eventId,address indexed organizer,uint256 capacity,uint64 registrationDeadline)",
] as const;

export const TICKET_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function checkedIn(uint256) view returns (bool)",
  "function eventOfTicket(uint256) view returns (uint256)",
  "function nextTokenId() view returns (uint256)",
  "function ownerOf(uint256) view returns (address)",
  "function registrationContract() view returns (address)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function tokenURI(uint256) view returns (string)",
  "event TicketMinted(uint256 indexed tokenId,uint256 indexed eventId,address indexed student)",
  "event TicketCheckedIn(uint256 indexed tokenId)",
] as const;

export const eventManagerInterface = new Interface(EVENT_MANAGER_ABI);
export const ticketInterface = new Interface(TICKET_ABI);

export function contractsConfigured() {
  return Boolean(EVENT_MANAGER_ADDRESS && TICKET_ADDRESS);
}

export async function getFujiSigner() {
  const wallet = await connectWallet();
  if (wallet.chainId !== FUJI_CHAIN_ID) {
    await switchToFuji(wallet.provider);
  }
  const chainId = Number(await wallet.provider.send("eth_chainId", []));
  if (chainId !== FUJI_CHAIN_ID) throw new Error("Chuyển ví sang Avalanche Fuji (43113) để tiếp tục.");
  const accounts = await wallet.provider.send("eth_accounts", []) as string[];
  const address = accounts[0];
  if (!address) throw new Error("Ví chưa cấp quyền truy cập tài khoản.");
  return { provider: wallet.provider, signer: await wallet.provider.getSigner(address), address };
}

export function eventManager(runner: ContractRunner) {
  if (!EVENT_MANAGER_ADDRESS) throw new Error("Chưa cấu hình địa chỉ EventManager trong .env.");
  return new Contract(EVENT_MANAGER_ADDRESS, EVENT_MANAGER_ABI, runner);
}

export function ticketContract(runner: ContractRunner) {
  if (!TICKET_ADDRESS) throw new Error("Chưa cấu hình địa chỉ Ticket trong .env.");
  return new Contract(TICKET_ADDRESS, TICKET_ABI, runner);
}

export function createReadOnlyFujiProvider() {
  const rpc = process.env.NEXT_PUBLIC_AVALANCHE_RPC_URL || "https://api.avax-test.network/ext/bc/C/rpc";
  return new JsonRpcProvider(rpc, FUJI_CHAIN_ID, { batchMaxCount: 1, staticNetwork: true });
}

export async function verifyContractLink(runner: ContractRunner) {
  const manager = eventManager(runner);
  const configuredTicket = String(await manager.ticketContract()).toLowerCase();
  if (configuredTicket !== TICKET_ADDRESS.toLowerCase()) {
    throw new Error("EventManager chưa trỏ tới Ticket address trong cấu hình. Kiểm tra ticketContract() trên Fuji.");
  }
  return manager;
}

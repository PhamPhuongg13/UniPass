import { Contract, Interface, JsonRpcProvider, type ContractRunner } from "ethers";
import { fujiProvider } from "@/lib/contracts/rpc";
import { FUJI_CHAIN_ID } from "@/lib/web3/client";

export const EVENT_MANAGER_ADDRESS = process.env.NEXT_PUBLIC_EVENT_MANAGER_ADDRESS || process.env.NEXT_PUBLIC_EVENT_MANAGER_V2_ADDRESS || "";
export const TICKET_ADDRESS = process.env.NEXT_PUBLIC_TICKET_ADDRESS ?? "";

export const EVENT_MANAGER_ABI = [
  "function cancelEvent(uint256 _id)",
  "function checkInStudent(uint256 tokenId)",
  "function createEvent(uint256 _capacity,uint64 _registrationDeadline)",
  "function registerEvent((address wallet,uint256 eventId,uint256 chainId,address verifyingContract,uint64 expiresAt,bytes32 nonce,bytes32 purpose,bytes32 studentNullifier) authorization,bytes signature) returns (uint256 tokenId)",
  "function studentNullifierUsed(uint256 eventId,bytes32 nullifier) view returns (bool)",
  "function canRegister(uint256 _id) view returns (bool)",
  "function getEvent(uint256 _id) view returns ((uint256 id,address organizer,uint256 capacity,uint256 minted,uint256 registrationDeadline,bool active))",
  "function nextEventId() view returns (uint256)",
  "function owner() view returns (address)",
  "function registered(uint256,address) view returns (bool)",
  "function eventStaff(uint256,address) view returns (bool)",
  "function ticketContract() view returns (address)",
  "event EventCreated(uint256 indexed eventId,address indexed organizer,uint256 capacity,uint64 registrationDeadline)",
  "event StudentRegistered(uint256 indexed eventId,address indexed student,uint256 indexed tokenId,bytes32 nonce,bytes32 studentNullifier)",
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

export function eventManager(runner: ContractRunner) {
  if (!EVENT_MANAGER_ADDRESS) throw new Error("EventManager address is not configured.");
  return new Contract(EVENT_MANAGER_ADDRESS, EVENT_MANAGER_ABI, runner);
}

export function ticketContract(runner: ContractRunner) {
  if (!TICKET_ADDRESS) throw new Error("Ticket address is not configured.");
  return new Contract(TICKET_ADDRESS, TICKET_ABI, runner);
}

export function createReadOnlyFujiProvider() {
  return fujiProvider();
}

export async function verifyContractLink(runner: ContractRunner) {
  const manager = eventManager(runner);
  const configuredTicket = String(await manager.ticketContract()).toLowerCase();
  if (configuredTicket !== TICKET_ADDRESS.toLowerCase()) {
    throw new Error("EventManager does not point to configured Ticket address. Check ticketContract() on Fuji.");
  }
  return manager;
}

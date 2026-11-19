import { Contract, type ContractRunner } from "ethers";

/** ABI for the separately deployed, not-yet-active V2 contracts. */
export const EVENT_MANAGER_V2_ABI = [
  "function createEvent(uint256 capacity,uint64 registrationDeadline) returns (uint256 eventId)",
  "function getEvent(uint256 eventId) view returns ((uint256 id,address organizer,uint256 capacity,uint256 minted,uint256 registrationDeadline,bool active))",
  "function canRegister(uint256 eventId) view returns (bool)",
  "function registered(uint256 eventId,address student) view returns (bool)",
  "function registerEvent((address wallet,uint256 eventId,uint256 chainId,address verifyingContract,uint64 expiresAt,bytes32 nonce,bytes32 purpose) authorization,bytes signature) returns (uint256 tokenId)",
  "function registrationIssuer() view returns (address)",
  "function eventStaff(uint256 eventId,address staff) view returns (bool)",
  "function setEventStaff(uint256 eventId,address staff,bool authorized)",
  "function checkInStudent(uint256 tokenId)",
  "function ticketContract() view returns (address)",
  "event EventCreated(uint256 indexed eventId,address indexed organizer,uint256 capacity,uint64 registrationDeadline)",
  "event StudentRegistered(uint256 indexed eventId,address indexed student,uint256 indexed tokenId,bytes32 nonce)",
  "event EventStaffUpdated(uint256 indexed eventId,address indexed staff,bool authorized)",
] as const;

export const TICKET_V2_ABI = [
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function eventOfTicket(uint256 tokenId) view returns (uint256)",
  "function checkedIn(uint256 tokenId) view returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
  "function mintTicket(address student,uint256 eventId) returns (uint256 tokenId)",
  "function checkIn(uint256 tokenId)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "event TicketMinted(uint256 indexed tokenId,uint256 indexed eventId,address indexed student)",
  "event TicketCheckedIn(uint256 indexed tokenId)",
] as const;

export const EVENT_MANAGER_V2_ADDRESS = process.env.NEXT_PUBLIC_EVENT_MANAGER_V2_ADDRESS ?? "";

export function eventManagerV2(runner: ContractRunner) {
  if (!EVENT_MANAGER_V2_ADDRESS) throw new Error("UniPass EventManager V2 chưa được triển khai/cấu hình.");
  return new Contract(EVENT_MANAGER_V2_ADDRESS, EVENT_MANAGER_V2_ABI, runner);
}

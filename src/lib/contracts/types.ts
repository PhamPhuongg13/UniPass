import type { ContractRunner } from "ethers";

export type OnChainEvent = { capacity: bigint; deadline: bigint };
/** Provisional interfaces from the Remix handoff spec. Replace only after owner supplies exported ABI. */
export interface EventManagerAdapter {
  getEvent(eventId: bigint): Promise<OnChainEvent>;
  canRegister(eventId: bigint): Promise<boolean>;
  registered(eventId: bigint, student: string): Promise<boolean>;
}
export interface TicketAdapter {
  ownerOf(tokenId: bigint): Promise<string>;
  eventOfTicket(tokenId: bigint): Promise<bigint>;
  checkedIn(tokenId: bigint): Promise<boolean>;
}
export type ContractAvailability = { available: false; reason: string } | { available: true; runner: ContractRunner };

export function contractAvailability(address: string | undefined, chainId: number | undefined): ContractAvailability {
  if (!address) return { available: false, reason: "Chưa cấu hình địa chỉ hợp đồng từ Remix." };
  if (chainId !== 43113) return { available: false, reason: "Hãy chuyển ví sang Avalanche Fuji (43113)." };
  return { available: false, reason: "Địa chỉ có nhưng chưa có ABI đã xác nhận; adapter đang tắt để tránh gọi nhầm hợp đồng." };
}

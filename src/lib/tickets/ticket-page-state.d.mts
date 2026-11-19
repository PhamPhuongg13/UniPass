export type TicketMetadataState = "loading" | "available" | "empty" | "unavailable" | "fallback";
export type TicketIndexerStatus = "ready" | "syncing" | "needs-deployment-block" | null;
export type TicketRpcState = "idle" | "checking" | "available" | "partial" | "unavailable";
export type TicketOwnershipState = "verified" | "unverified" | "not-owned";
export type TicketPageState = "loading" | "rpc-error" | "synchronizing" | "unverified" | "verified" | "metadata-unavailable" | "empty" | "idle";
export function deriveTicketPageState(input: {
  loading?: boolean;
  metadataState?: TicketMetadataState;
  indexStatus?: TicketIndexerStatus;
  indexStale?: boolean;
  rpcState?: TicketRpcState;
  ownershipStates?: TicketOwnershipState[];
}): {
  pageState: TicketPageState;
  metadataState: TicketMetadataState;
  indexerState: "needs-setup" | "syncing" | "stale" | "ready" | "unknown";
  rpcState: TicketRpcState;
  ownershipState: "none" | "verified" | "unverified" | "mixed" | "not-owned";
  notice: null | { tone: "info" | "warning"; code: string; text: string };
};
export function canUseTicketOwnershipActions(state: TicketOwnershipState | "unknown"): boolean;

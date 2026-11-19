"use client";

import { useState } from "react";
import { WalletTickets } from "@/components/WalletTickets";
import { TicketCheckInPass } from "@/components/TicketCheckInPass";
import type { TicketOwnershipState } from "@/lib/tickets/ticket-page-state.mjs";

export function TicketDetailClient({ tokenId, walletAddress }: { tokenId: string; walletAddress: string }) {
  const [ownership, setOwnership] = useState<TicketOwnershipState | "unknown">("unknown");
  return <>
    <WalletTickets tokenId={tokenId} walletAddress={walletAddress} onOwnershipChange={setOwnership} />
    <TicketCheckInPass tokenId={tokenId} walletAddress={walletAddress} ownershipVerified={ownership === "verified"} />
  </>;
}

"use client";

import { useEffect, useState } from "react";
import { formatDeadline } from "@/lib/contracts/format";

type Status = { capacity: string; minted: string; deadline: string; organizer: string; active: boolean };

export function OnChainEventStatus({ eventId }: { eventId: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    setStatus(null);
    setError("");
    let provider: import("ethers").JsonRpcProvider | undefined;
    async function read() {
      try {
        const { JsonRpcProvider } = await import("ethers");
        const { eventManager, verifyContractLink } = await import("@/lib/contracts/chain");
        const rpc = process.env.NEXT_PUBLIC_AVALANCHE_RPC_URL || "https://api.avax-test.network/ext/bc/C/rpc";
        provider = new JsonRpcProvider(rpc, 43113);
        const manager = await verifyContractLink(provider);
        const info = await manager.getFunction("getEvent")(BigInt(eventId));
        if (!cancelled) setStatus({ capacity: String(info[2]), minted: String(info[3]), deadline: formatDeadline(Number(info[4])), organizer: String(info[1]), active: Boolean(info[5]) });
      } catch (cause) { if (!cancelled) setError(cause instanceof Error ? cause.message : "Không đọc được dữ liệu Fuji."); }
    }
    void read();
    return () => { cancelled = true; provider?.destroy(); };
  }, [eventId]);
  if (error) return <p className="notice warning">Không đọc được trạng thái Fuji: {error}</p>;
  if (!status) return <p className="seed-note">Đang đọc trạng thái từ Avalanche Fuji…</p>;
  return <div className="chain-status"><span>{status.active ? "ĐANG MỞ" : "ĐÃ ĐÓNG"}</span><span>{status.minted} / {status.capacity} vé đã mint</span><span>Hạn đăng ký: {status.deadline}</span><span className="chain-address">Organizer: {status.organizer}</span></div>;
}

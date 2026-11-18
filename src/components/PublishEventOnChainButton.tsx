"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Log, LogDescription } from "ethers";
import { eventManager, eventManagerInterface, getFujiSigner, verifyContractLink } from "@/lib/contracts/chain";

export function PublishEventOnChainButton({ eventId, capacity, deadline, wallet }: { eventId: string; capacity: number | null; deadline: string | null; wallet: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  async function publish() {
    setBusy(true); setError("");
    try {
      if (!capacity || !deadline) throw new Error("Cần bổ sung sức chứa và hạn đăng ký trước khi tạo on-chain.");
      const connected = await getFujiSigner();
      if (connected.address.toLowerCase() !== wallet.toLowerCase()) throw new Error("Hãy kết nối ví của ban tổ chức.");
      const response = await fetch("/api/auth/session", { cache: "no-store" });
      const session = await response.json();
      if (session.wallet?.toLowerCase() !== wallet.toLowerCase()) throw new Error("Hãy đăng nhập bằng ví ban tổ chức.");
      await verifyContractLink(connected.signer);
      const manager = eventManager(connected.signer);
      const tx = await manager.createEvent(capacity, BigInt(Math.floor(new Date(deadline).getTime() / 1000)));
      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) throw new Error("Giao dịch chưa được xác nhận.");
      const created = receipt.logs.map((log: Log) => {
        try { return eventManagerInterface.parseLog({ topics: [...log.topics], data: log.data }); } catch { return null; }
      }).find((log: LogDescription | null) => log?.name === "EventCreated");
      if (!created) throw new Error(`Giao dịch ${tx.hash} thành công nhưng thiếu EventCreated.`);
      const saved = await fetch(`/api/events/${eventId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chainEventId: String(created.args.eventId), chainTx: tx.hash, syncStatus: "SYNCED", visibility: "PUBLIC" }) });
      if (!saved.ok) throw new Error(`Event đã tạo (${tx.hash}) nhưng chưa liên kết metadata: ${await saved.text()}`);
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể tạo event trên Fuji."); }
    finally { setBusy(false); }
  }
  return <div className="chain-publish"><button className="button button-dark" type="button" onClick={publish} disabled={busy}>{busy?"Đang tạo trên Fuji…":"Tạo event trên Fuji"}</button>{error&&<p className="notice warning" role="alert">{error}</p>}</div>;
}

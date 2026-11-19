"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Log, LogDescription } from "ethers";
import { eventManager, eventManagerInterface, getFujiSigner, verifyContractLink } from "@/lib/contracts/chain";

export function PublishEventOnChainButton({ eventId, capacity, deadline, wallet, chainTx }: { eventId: string; capacity: number | null; deadline: string | null; wallet: string; chainTx?: string | null }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  async function reconcile(hash: string, provider: NonNullable<Awaited<ReturnType<typeof getFujiSigner>>["signer"]["provider"]>) {
    const receipt = await provider.waitForTransaction(hash, 1, 120_000);
    if (!receipt) throw new Error(`Giao dịch ${hash} vẫn đang chờ Fuji xác nhận. Tải lại trang để kiểm tra tiếp.`);
    if (receipt.status !== 1) {
      await fetch(`/api/events/${eventId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ syncStatus: "FAILED" }) });
      throw new Error(`Giao dịch tạo sự kiện bị revert: ${hash}`);
    }
    const created = receipt.logs.map((log: Log) => {
      try { return eventManagerInterface.parseLog({ topics: [...log.topics], data: log.data }); } catch { return null; }
    }).find((log: LogDescription | null) => log?.name === "EventCreated");
    if (!created) throw new Error(`Giao dịch ${hash} thành công nhưng thiếu EventCreated.`);
    const saved = await fetch(`/api/events/${eventId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chainEventId: String(created.args.eventId), chainTx: hash, syncStatus: "SYNCED", visibility: "PUBLIC" }) });
    if (!saved.ok) throw new Error(`Event đã tạo (${hash}) nhưng chưa liên kết được metadata.`);
    router.refresh();
  }
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
      if (chainTx) {
        await reconcile(chainTx, connected.signer.provider!);
        return;
      }
      const manager = eventManager(connected.signer);
      const tx = await manager.createEvent(capacity, BigInt(Math.floor(new Date(deadline).getTime() / 1000)));
      const pendingSaved = await fetch(`/api/events/${eventId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chainTx: tx.hash, syncStatus: "PENDING" }) });
      if (!pendingSaved.ok) throw new Error(`Giao dịch ${tx.hash} đã gửi nhưng hash chưa lưu được. Không gửi lại; cung cấp hash này để khôi phục.`);
      await reconcile(tx.hash, connected.signer.provider!);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể tạo event trên Fuji."); }
    finally { setBusy(false); }
  }
  return <div className="chain-publish"><button className="button button-dark" type="button" onClick={publish} disabled={busy}>{busy?"Đang đối chiếu giao dịch…":chainTx?"Kiểm tra giao dịch đã gửi":"Tạo event trên Fuji"}</button>{error&&<p className="notice warning" role="alert">{error}</p>}</div>;
}

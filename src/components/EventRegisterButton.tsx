"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Log, LogDescription } from "ethers";
import { eventManager, getFujiSigner, ticketInterface, verifyContractLink } from "@/lib/contracts/chain";

export function EventRegisterButton({ eventId, metadataId }: { eventId: string; metadataId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ticket, setTicket] = useState("");
  const [syncWarning, setSyncWarning] = useState("");
  const router = useRouter();

  async function register() {
    setBusy(true); setError(""); setTicket("");
    try {
      const { signer, address } = await getFujiSigner();
      const sessionResponse = await fetch("/api/auth/session", { cache: "no-store" });
      const session = await sessionResponse.json();
      if (!session.wallet || session.wallet.toLowerCase() !== address.toLowerCase()) throw new Error("Hãy đăng nhập bằng chính ví đang dùng để đăng ký.");
      const manager = await verifyContractLink(signer);
      const id = BigInt(eventId);
      const info = await manager.getFunction("getEvent")(id);
      if (!Boolean(info[5])) throw new Error("Sự kiện đã đóng.");
      if (await manager.registered(id, address)) throw new Error("Ví này đã đăng ký sự kiện.");
      if (!(await manager.canRegister(id))) throw new Error("Đã hết chỗ hoặc hết hạn đăng ký.");
      const tx = await manager.registerEvent(id);
      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) throw new Error("Giao dịch đăng ký chưa được xác nhận.");
      const minted = receipt.logs.map((log: Log) => {
        try { return ticketInterface.parseLog({ topics: [...log.topics], data: log.data }); } catch { return null; }
      }).find((log: LogDescription | null) => log?.name === "TicketMinted");
      if (!minted) throw new Error(`Đăng ký đã lên chain (${tx.hash}) nhưng không đọc được TicketMinted.`);
      const tokenId = String(minted.args.tokenId);
      setTicket(tokenId);
      const mirror = await fetch(`/api/events/${metadataId}/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tokenId, chainTx: tx.hash }) });
      if (!mirror.ok) setSyncWarning("Ticket đã xác nhận trên chain nhưng chỉ mục ứng dụng chưa cập nhật.");
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể đăng ký."); }
    finally { setBusy(false); }
  }

  return <div className="register-action">
    <button className="button button-dark" type="button" onClick={register} disabled={busy}>{busy ? "Đang chờ xác nhận…" : "Đăng ký bằng ví"}</button>
    <p className="seed-note">Giao dịch mint NFT trên Fuji. Contract hiện chưa xác minh email sinh viên bằng zkEmail.</p>
    {ticket&&<p className="notice success">Đã mint vé NFT #{ticket}. <Link href={`/tickets/${ticket}`}>Mở vé</Link></p>}
    {syncWarning&&<p className="notice warning">{syncWarning}</p>}
    {error&&<p className="notice warning" role="alert">{error}</p>}
  </div>;
}

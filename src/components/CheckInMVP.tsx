"use client";

import { useState } from "react";
import { eventManager, getFujiSigner, ticketContract, verifyContractLink } from "@/lib/contracts/chain";

export function CheckInMVP({ metadataId, chainEventId, organizerWallet }: { metadataId: string; chainEventId: string; organizerWallet: string }) {
  const [tokenId, setTokenId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function checkIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(""); setError("");
    try {
      if (!/^\d+$/.test(tokenId)) throw new Error("Nhập token ID dạng số.");
      const { signer, address } = await getFujiSigner();
      const sessionResponse = await fetch("/api/auth/session", { cache: "no-store" });
      const session = await sessionResponse.json();
      if (!session.wallet || session.wallet.toLowerCase() !== address.toLowerCase()) throw new Error("Đăng nhập bằng ví ban tổ chức này trước.");
      if (address.toLowerCase() !== organizerWallet.toLowerCase()) throw new Error("Ví kết nối không phải ví tổ chức sự kiện.");
      const manager = await verifyContractLink(signer);
      const ticket = ticketContract(signer);
      const id = BigInt(tokenId);
      const [actualEventId, alreadyCheckedIn] = await Promise.all([ticket.eventOfTicket(id), ticket.checkedIn(id)]);
      if (String(actualEventId) !== chainEventId) throw new Error("Vé thuộc sự kiện khác.");
      if (alreadyCheckedIn) throw new Error("Vé này đã được dùng để check-in.");
      const tx = await manager.checkInStudent(id);
      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) throw new Error("Giao dịch check-in chưa được xác nhận.");
      const audit = await fetch(`/api/events/${metadataId}/check-in`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tokenId, chainTx: tx.hash }) });
      if (!audit.ok) setMessage(`Check-in đã được xác nhận trên Fuji (${tx.hash}); bản ghi ứng dụng chưa đồng bộ.`);
      else setMessage(`Check-in thành công cho vé #${tokenId}. Giao dịch: ${tx.hash}`);
      setTokenId("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể check-in vé."); }
    finally { setBusy(false); }
  }

  return <form className="tool-panel" onSubmit={checkIn}>
    <h2>Check-in vé</h2>
    <p>Nhập token ID từ vé NFT. Contract sẽ xác nhận vé thuộc sự kiện này, chưa check-in và ví hiện tại là ban tổ chức.</p>
    <label className="field">Token ID<input inputMode="numeric" pattern="[0-9]*" value={tokenId} onChange={event => setTokenId(event.target.value)} required placeholder="Ví dụ: 1"/></label>
    <button className="button button-dark" disabled={busy}>{busy?"Đang xác nhận…":"Xác nhận check-in trên Fuji"}</button>
    {message&&<p className="notice success" role="status">{message}</p>}
    {error&&<p className="notice warning" role="alert">{error}</p>}
  </form>;
}

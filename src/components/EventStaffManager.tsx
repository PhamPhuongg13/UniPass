"use client";

import { useEffect, useState } from "react";
import { getAddress } from "ethers";
import { eventManagerV2 } from "@/lib/contracts/v2";
import { getFujiSigner } from "@/lib/contracts/chain";

type Staff = { wallet: string; chainTx: string; updatedAt: string };
type PendingStaff = { wallet: string; authorized: boolean; chainTx: string };

export function EventStaffManager({ metadataEventId, chainEventId, organizerWallet }: { metadataEventId: string; chainEventId: string; organizerWallet: string }) {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [walletInput, setWalletInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState<PendingStaff | null>(null);

  async function refresh() {
    const response = await fetch(`/api/events/${metadataEventId}/staff`, { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || "Không tải được nhân viên.");
    setStaff(body.staff as Staff[]);
  }
  useEffect(() => { void refresh().catch(cause => setError(cause instanceof Error ? cause.message : "Không tải được danh sách nhân viên.")); }, [metadataEventId]);

  async function sync(pendingStaff: PendingStaff) {
    const response = await fetch(`/api/events/${metadataEventId}/staff`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pendingStaff), cache: "no-store",
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || "Giao dịch đã xác nhận nhưng danh sách chưa đồng bộ.");
    setPending(null); setMessage(pendingStaff.authorized ? "Đã thêm nhân viên." : "Đã thu hồi quyền nhân viên.");
    await refresh();
  }

  async function setPermission(address: string, authorized: boolean) {
    setBusy(true); setError(""); setMessage("");
    try {
      const normalized = getAddress(address);
      const { signer, address: connected } = await getFujiSigner();
      if (connected.toLowerCase() !== organizerWallet.toLowerCase()) throw new Error("Kết nối ví ban tổ chức của sự kiện.");
      const sessionResponse = await fetch("/api/auth/session", { cache: "no-store" });
      const session = await sessionResponse.json();
      if (session.wallet?.toLowerCase() !== connected.toLowerCase()) throw new Error("Đăng nhập bằng ví ban tổ chức trước.");
      const manager = eventManagerV2(signer);
      const transaction = await manager.getFunction("setEventStaff")(BigInt(chainEventId), normalized, authorized);
      const next = { wallet: normalized, authorized, chainTx: transaction.hash };
      setPending(next);
      const receipt = await transaction.wait();
      if (!receipt || receipt.status !== 1) throw new Error(`Giao dịch phân quyền chưa được xác nhận: ${transaction.hash}`);
      await sync(next);
      setWalletInput("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể cập nhật nhân viên."); }
    finally { setBusy(false); }
  }

  return <section className="tool-panel" aria-labelledby="event-staff-title">
    <h2 id="event-staff-title">Nhân viên check-in</h2>
    <p>Quyền được ghi trên EventManager V2 theo từng sự kiện. Chỉ ví ban tổ chức được thêm hoặc thu hồi nhân viên.</p>
    <div className="staff-add-row"><label className="field">Địa chỉ ví nhân viên<input value={walletInput} onChange={event => setWalletInput(event.target.value)} autoComplete="off" spellCheck={false} placeholder="0x…" /></label><button className="button button-dark" type="button" disabled={busy || Boolean(pending) || !walletInput.trim()} onClick={() => void setPermission(walletInput, true)}>{busy ? "Đang xác nhận…" : "Thêm nhân viên"}</button></div>
    {pending && <div className="notice warning" role="status"><p>Giao dịch đã được gửi. Hash: {pending.chainTx}</p><button className="button button-light" type="button" disabled={busy} onClick={() => { setBusy(true); void sync(pending).catch(cause => setError(cause instanceof Error ? cause.message : "Chưa đồng bộ được.")).finally(() => setBusy(false)); }}>Đồng bộ lại</button></div>}
    {staff.length > 0 ? <ul className="staff-list">{staff.map(item => <li key={item.wallet}><code>{item.wallet}</code><button className="button button-light" type="button" disabled={busy || Boolean(pending)} onClick={() => void setPermission(item.wallet, false)}>Thu hồi</button></li>)}</ul> : <p className="seed-note">Chưa có nhân viên được phân quyền.</p>}
    {message && <p className="notice success" role="status">{message}</p>}{error && <p className="notice warning" role="alert">{error}</p>}
  </section>;
}

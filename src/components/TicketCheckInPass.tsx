"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

type Pass = { credential: string; qrPayload: string; expiresAt: string; eventTitle: string; tokenId: string };

export function TicketCheckInPass({ tokenId, walletAddress, ownershipVerified = false }: { tokenId: string; walletAddress: string; ownershipVerified?: boolean }) {
  const [pass, setPass] = useState<Pass | null>(null);
  const [qr, setQr] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!ownershipVerified || !walletAddress) {
      setPass(null);
      setQr("");
      setCopied(false);
    }
  }, [ownershipVerified, walletAddress, tokenId]);

  async function issue() {
    if (!ownershipVerified || !walletAddress) return;
    setBusy(true); setError(""); setCopied(false); setPass(null); setQr("");
    try {
      const response = await fetch(`/api/tickets/${encodeURIComponent(tokenId)}/check-in-credential`, { method: "POST", cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Chưa thể tạo mã check-in.");
      const image = await QRCode.toDataURL(result.qrPayload, { errorCorrectionLevel: "Q", margin: 2, width: 320, color: { dark: "#21152e", light: "#ffffff" } });
      setPass(result as Pass); setQr(image);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Chưa thể tạo mã check-in."); }
    finally { setBusy(false); }
  }

  return <section className="tool-panel ticket-pass" aria-labelledby="ticket-pass-title">
    <h2 id="ticket-pass-title">Mã check-in của vé</h2>
    <p>Mã chỉ được tạo sau khi UniPass xác nhận ví đang đăng nhập sở hữu NFT trên Fuji. Mã có hiệu lực 2 phút và chỉ dùng một lần.</p>
    {!walletAddress ? <p className="notice warning">Kết nối và đăng nhập ví để xem vé.</p> : !ownershipVerified ? <p className="notice warning">Hãy xác minh quyền sở hữu trên Fuji trước khi tạo mã check-in.</p> : <button className="button button-dark" type="button" disabled={busy} onClick={() => void issue()}>{busy ? "Đang xác minh vé…" : pass ? "Tạo mã mới" : "Tạo mã check-in"}</button>}
    {error && <p className="notice warning" role="alert">{error}</p>}
    {pass && <div className="ticket-pass-content" aria-live="polite">
      <img className="ticket-pass-qr" src={qr} alt={`Mã QR check-in cho vé ${tokenId}`} />
      <p><strong>{pass.eventTitle}</strong> · Vé #{pass.tokenId}</p>
      <p>Mã hết hạn lúc {new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(pass.expiresAt))}. Tạo mã mới nếu đã hết hạn.</p>
      <button className="button button-light" type="button" onClick={async () => { await navigator.clipboard.writeText(pass.qrPayload); setCopied(true); }}>{copied ? "Đã sao chép" : "Sao chép mã dự phòng"}</button>
      <p className="seed-note">Mã QR là vé vào cửa tạm thời. Chỉ đưa cho nhân viên check-in; không đăng ảnh mã lên mạng.</p>
    </div>}
  </section>;
}

"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserQRCodeReader } from "@zxing/browser";
import { eventManager, getFujiSigner, ticketContract, verifyContractLink } from "@/lib/contracts/chain";

type PendingSync = { credential: string; tokenId: string; chainTx: string };

function getCredential(value: string) {
  const normalized = value.trim().replace(/^unipass:\/\/check-in\//i, "");
  return /^[A-Za-z0-9_-]{43}$/.test(normalized) ? normalized : null;
}

function safeCameraMessage(error: unknown) {
  const name = error && typeof error === "object" && "name" in error ? String(error.name) : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "Bạn chưa cho phép camera. Cho phép quyền camera hoặc dán mã check-in thủ công.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "Không tìm thấy camera phù hợp trên thiết bị này. Dán mã check-in thủ công.";
  return "Không mở được camera trên trình duyệt này. Bạn có thể dán mã check-in thủ công.";
}

export function CheckInMVP({ metadataId, chainEventId, organizerWallet }: { metadataId: string; chainEventId: string; organizerWallet: string }) {
  const [credential, setCredential] = useState("");
  const [busy, setBusy] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pendingSync, setPendingSync] = useState<PendingSync | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);

  useEffect(() => () => controlsRef.current?.stop(), []);

  function stopScanner() {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setCameraOpen(false);
  }

  async function startScanner() {
    setError(""); setMessage("");
    if (!navigator.mediaDevices?.getUserMedia || !videoRef.current) {
      setError("Camera không khả dụng. Dán mã check-in thủ công.");
      return;
    }
    try {
      const reader = new BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 250 });
      setCameraOpen(true);
      const controls = await reader.decodeFromVideoDevice(undefined, videoRef.current, (result, scanError, controls) => {
        if (result) {
          controls.stop(); controlsRef.current = null; setCameraOpen(false);
          setCredential(result.getText()); setMessage("Đã đọc mã. Kiểm tra sự kiện rồi xác nhận check-in.");
        } else if (scanError && scanError.name !== "NotFoundException" && scanError.name !== "ChecksumException" && scanError.name !== "FormatException") {
          controls.stop(); controlsRef.current = null; setCameraOpen(false); setError(safeCameraMessage(scanError));
        }
      });
      controlsRef.current = controls;
    } catch (cause) { setCameraOpen(false); setError(safeCameraMessage(cause)); }
  }

  async function syncCheckIn(pending: PendingSync) {
    const response = await fetch(`/api/events/${metadataId}/check-in`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pending), cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Chưa lưu được nhật ký check-in.");
    setPendingSync(null); setCredential("");
    setMessage(`Check-in thành công cho vé #${pending.tokenId}. Giao dịch: ${pending.chainTx}`);
  }

  async function checkIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(""); setError("");
    try {
      const normalizedCredential = getCredential(credential);
      if (!normalizedCredential) throw new Error("Mã check-in không đúng định dạng. Quét lại hoặc dán nguyên mã UniPass.");
      const preparedResponse = await fetch(`/api/events/${metadataId}/check-in/prepare`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: normalizedCredential }), cache: "no-store",
      });
      const prepared = await preparedResponse.json();
      if (!preparedResponse.ok) throw new Error(prepared.error || "Mã vé không hợp lệ.");
      if (new Date(prepared.expiresAt).getTime() <= Date.now()) throw new Error("Mã check-in vừa hết hạn. Yêu cầu người tham dự tạo mã mới.");

      const { signer, address } = await getFujiSigner();
      const sessionResponse = await fetch("/api/auth/session", { cache: "no-store" });
      const session = await sessionResponse.json();
      if (!session.wallet || session.wallet.toLowerCase() !== address.toLowerCase()) throw new Error("Đăng nhập bằng ví ban tổ chức này trước.");
      if (address.toLowerCase() !== organizerWallet.toLowerCase()) throw new Error("Chỉ ví ban tổ chức của sự kiện mới được check-in.");
      const manager = await verifyContractLink(signer);
      const ticket = ticketContract(signer);
      const id = BigInt(prepared.tokenId);
      const [actualEventId, alreadyCheckedIn] = await Promise.all([ticket.eventOfTicket(id), ticket.checkedIn(id)]);
      if (String(actualEventId) !== chainEventId) throw new Error("Vé thuộc một sự kiện khác.");
      if (alreadyCheckedIn) throw new Error("Vé này đã được check-in trên Fuji.");
      const tx = await manager.checkInStudent(id);
      const pending = { credential: normalizedCredential, tokenId: prepared.tokenId, chainTx: tx.hash };
      setPendingSync(pending);
      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) throw new Error(`Giao dịch check-in chưa được xác nhận (${tx.hash}).`);
      try { await syncCheckIn(pending); }
      catch (cause) { throw new Error(`Check-in đã lên Fuji (${tx.hash}), nhưng nhật ký chưa đồng bộ: ${cause instanceof Error ? cause.message : "lỗi máy chủ"}`); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể check-in vé."); }
    finally { setBusy(false); }
  }

  return <form className="tool-panel checkin-panel" onSubmit={checkIn}>
    <h2>Check-in vé</h2>
    <p>Quét mã UniPass còn hạn hoặc dán mã thủ công. UniPass xác nhận sự kiện và quyền sở hữu hiện tại trên Fuji; giao dịch check-in được ký bằng ví ban tổ chức.</p>
    <div className="checkin-controls">
      {!cameraOpen ? <button className="button button-light" type="button" onClick={() => void startScanner()}>Quét bằng camera</button> : <button className="button button-light" type="button" onClick={stopScanner}>Đóng camera</button>}
      <label className="field">Mã check-in<input autoComplete="off" value={credential} onChange={event => setCredential(event.target.value)} required maxLength={96} placeholder="Dán mã UniPass hoặc unipass://check-in/…"/></label>
    </div>
    <video ref={videoRef} className={cameraOpen ? "checkin-camera is-open" : "checkin-camera"} aria-label="Khung hình camera quét QR" muted playsInline />
    {cameraOpen && <p className="seed-note" role="status">Đưa mã QR vào giữa khung camera. Nếu camera không mở, dán mã check-in vào ô bên trên.</p>}
    <button className="button button-dark" disabled={busy || Boolean(pendingSync)}>{busy ? "Đang xác nhận trên Fuji…" : "Xác nhận check-in trên Fuji"}</button>
    {pendingSync && <div className="notice warning" role="status"><p>Giao dịch {pendingSync.chainTx} đã được gửi. Nếu Fuji đã xác nhận nhưng nhật ký chưa đồng bộ, có thể thử lại bước đồng bộ mà không gửi giao dịch mới.</p><button className="button button-light" type="button" disabled={busy} onClick={() => { setBusy(true); setError(""); void syncCheckIn(pendingSync).catch(cause => setError(cause instanceof Error ? cause.message : "Chưa đồng bộ được.")).finally(() => setBusy(false)); }}>Đồng bộ nhật ký</button></div>}
    {message && <p className="notice success" role="status">{message}</p>}
    {error && <p className="notice warning" role="alert">{error}</p>}
    <p className="seed-note">Chỉ ví chủ sự kiện được phép gửi giao dịch. Mã QR là bearer credential tạm thời; không chia sẻ trước khi check-in.</p>
  </form>;
}

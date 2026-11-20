"use client";

import { useEffect, useRef, useState } from "react";
import { useUniPassWallet } from "@/components/WalletProvider";
import { eventManager, ticketContract, verifyContractLink } from "@/lib/contracts/chain";

type PendingSync = { credential: string; tokenId: string; chainTx: string };

function getCredential(value: string) {
  const normalized = value.trim().replace(/^unipass:\/\/check-in\//i, "");
  return /^[A-Za-z0-9_-]{43}$/.test(normalized) ? normalized : null;
}

function safeCameraMessage(error: unknown) {
  const name = error && typeof error === "object" && "name" in error ? String(error.name) : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "Camera permission denied. Allow access or paste the check-in code.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No compatible camera found. Paste the check-in code.";
  return "Could not open the camera. Paste the check-in code.";
}

export function CheckInMVP({ metadataId, chainEventId, organizerWallet }: { metadataId: string; chainEventId: string; organizerWallet: string }) {
  const { getSigner, ensureGas, sendTx, waitForReceipt } = useUniPassWallet();
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
      setError("Camera unavailable. Paste the check-in code.");
      return;
    }
    try {
      type Detector = { detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>> };
      const DetectorClass = (window as unknown as { BarcodeDetector?: new (options: { formats: string[] }) => Detector }).BarcodeDetector;
      if (!DetectorClass) throw new Error("BarcodeDetector unavailable");
      const detector = new DetectorClass({ formats: ["qr_code"] });
      const video = videoRef.current;
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      video.srcObject = stream;
      await video.play();
      let active = true;
      let frame = 0;
      const stop = () => { active = false; window.cancelAnimationFrame(frame); stream.getTracks().forEach(track => track.stop()); video.srcObject = null; };
      controlsRef.current = { stop };
      setCameraOpen(true);
      const scan = async () => {
        if (!active) return;
        try {
          const codes = await detector.detect(video);
          if (codes.length) {
            stop(); controlsRef.current = null; setCameraOpen(false);
            setCredential(codes[0].rawValue); setMessage("Code scanned. Check the event and confirm check-in.");
            return;
          }
        } catch (cause) {
          stop(); controlsRef.current = null; setCameraOpen(false); setError(safeCameraMessage(cause));
          return;
        }
        frame = window.requestAnimationFrame(() => { void scan(); });
      };
      void scan();
    } catch (cause) { setCameraOpen(false); setError(safeCameraMessage(cause)); }
  }

  async function syncCheckIn(pending: PendingSync) {
    const response = await fetch(`/api/events/${metadataId}/check-in`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pending), cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Could not save the check-in record.");
    setPendingSync(null); setCredential("");
    setMessage(`Check-in succeeded for ticket #${pending.tokenId}. Transaction: ${pending.chainTx}`);
  }

  async function checkIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(""); setError("");
    try {
      const normalizedCredential = getCredential(credential);
      if (!normalizedCredential) throw new Error("Invalid check-in code. Scan again or paste the full UniPass code.");
      const preparedResponse = await fetch(`/api/events/${metadataId}/check-in/prepare`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: normalizedCredential }), cache: "no-store",
      });
      const prepared = await preparedResponse.json();
      if (!preparedResponse.ok) throw new Error(prepared.error || "Invalid ticket code.");
      if (new Date(prepared.expiresAt).getTime() <= Date.now()) throw new Error("Check-in code just expired. Ask the attendee for a new one.");

      const { signer, address } = await getSigner();
      const sessionResponse = await fetch("/api/auth/session", { cache: "no-store" });
      const session = await sessionResponse.json();
      if (!session.wallet || session.wallet.toLowerCase() !== address.toLowerCase()) throw new Error("Sign in with this organizer wallet first.");
      const manager = await verifyContractLink(signer);
      if (address.toLowerCase() !== organizerWallet.toLowerCase() && !await manager.getFunction("eventStaff")(BigInt(chainEventId), address)) throw new Error("This wallet is not authorized for check-in.");
      const ticket = ticketContract(signer);
      const id = BigInt(prepared.tokenId);
      const [actualEventId, alreadyCheckedIn] = await Promise.all([ticket.eventOfTicket(id), ticket.checkedIn(id)]);
      if (String(actualEventId) !== chainEventId) throw new Error("Ticket belongs to another event.");
      if (alreadyCheckedIn) throw new Error("This ticket was already checked in on Fuji.");
      await ensureGas();
      const tx = { hash: await sendTx({ to: await manager.getAddress(), data: manager.interface.encodeFunctionData("checkInStudent", [id]) }) };
      const pending = { credential: normalizedCredential, tokenId: prepared.tokenId, chainTx: tx.hash };
      setPendingSync(pending);
      const receipt = await waitForReceipt(tx.hash);
      if (!receipt || receipt.status !== 1) throw new Error(`Check-in transaction was not confirmed (${tx.hash}).`);
      try { await syncCheckIn(pending); }
      catch (cause) { throw new Error(`Check-in reached Fuji (${tx.hash}), but the record has not synced: ${cause instanceof Error ? cause.message : "server error"}`); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not check in ticket."); }
    finally { setBusy(false); }
  }

  return <form className="tool-panel checkin-panel" onSubmit={checkIn}>
    <h2>Check-in vé</h2>
    <p>Scan a current UniPass code or paste it. UniPass checks the event and current ownership on Fuji. The organizer or authorized staff wallet signs the check-in.</p>
    <div className="checkin-controls">
      {!cameraOpen ? <button className="button button-light" type="button" onClick={() => void startScanner()}>Scan with camera</button> : <button className="button button-light" type="button" onClick={stopScanner}>Close camera</button>}
      <label className="field">Check-in code<input autoComplete="off" value={credential} onChange={event => setCredential(event.target.value)} required maxLength={96} placeholder="Paste UniPass code or unipass://check-in/…"/></label>
    </div>
    <video ref={videoRef} className={cameraOpen ? "checkin-camera is-open" : "checkin-camera"} aria-label="Khung hình camera quét QR" muted playsInline />
    {cameraOpen && <p className="seed-note" role="status">Center the QR code in the camera. If it does not open, paste the code above.</p>}
    <button className="button button-dark" disabled={busy || Boolean(pendingSync)}>{busy ? "Confirming on Fuji…" : "Confirm check-in on Fuji"}</button>
    {pendingSync && <div className="notice warning" role="status"><p>Transaction {pendingSync.chainTx} was sent. If Fuji confirmed it but the record has not synced, retry sync without sending another transaction.</p><button className="button button-light" type="button" disabled={busy} onClick={() => { setBusy(true); setError(""); void syncCheckIn(pendingSync).catch(cause => setError(cause instanceof Error ? cause.message : "Could not sync.")).finally(() => setBusy(false)); }}>Sync record</button></div>}
    {message && <p className="notice success" role="status">{message}</p>}
    {error && <p className="notice warning" role="alert">{error}</p>}
    <p className="seed-note">Only organizer or authorized staff wallets can send the transaction. The QR code is temporary; do not share it before check-in.</p>
  </form>;
}

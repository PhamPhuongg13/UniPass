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
      if (!response.ok) throw new Error(result.error || "Could not create check-in code.");
      const image = await QRCode.toDataURL(result.qrPayload, { errorCorrectionLevel: "Q", margin: 2, width: 320, color: { dark: "#21152e", light: "#ffffff" } });
      setPass(result as Pass); setQr(image);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create check-in code."); }
    finally { setBusy(false); }
  }

  return <section className="tool-panel ticket-pass" aria-labelledby="ticket-pass-title">
    <h2 id="ticket-pass-title">Ticket check-in code</h2>
    <p>A code is created after UniPass verifies the signed-in wallet owns the NFT on Fuji. It lasts two minutes and can be used once.</p>
    {!walletAddress ? <p className="notice warning">Connect and sign in to view the ticket.</p> : !ownershipVerified ? <p className="notice warning">Verify ownership on Fuji before creating a check-in code.</p> : <button className="button button-dark" type="button" disabled={busy} onClick={() => void issue()}>{busy ? "Verifying ticket…" : pass ? "Create a new code" : "Create check-in code"}</button>}
    {error && <p className="notice warning" role="alert">{error}</p>}
    {pass && <div className="ticket-pass-content" aria-live="polite">
      <img className="ticket-pass-qr" src={qr} alt={`Check-in QR for ticket ${tokenId}`} />
      <p><strong>{pass.eventTitle}</strong> · Ticket #{pass.tokenId}</p>
      <p>Code expires at {new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(pass.expiresAt))}. Create a new code if it expired.</p>
      <button className="button button-light" type="button" onClick={async () => { await navigator.clipboard.writeText(pass.qrPayload); setCopied(true); }}>{copied ? "Copied" : "Copy backup code"}</button>
      <p className="seed-note">The QR code is temporary entry proof. Share it only with check-in staff; do not post it online.</p>
    </div>}
  </section>;
}

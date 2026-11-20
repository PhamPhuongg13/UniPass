"use client";

import { useEffect, useState } from "react";
import { useUniPassWallet } from "@/components/WalletProvider";
import { getAddress } from "ethers";
import { eventManagerV2 } from "@/lib/contracts/v2";

type Staff = { wallet: string; chainTx: string; updatedAt: string };
type PendingStaff = { wallet: string; authorized: boolean; chainTx: string };

export function EventStaffManager({ metadataEventId, chainEventId, organizerWallet }: { metadataEventId: string; chainEventId: string; organizerWallet: string }) {
  const { getSigner, ensureGas, sendTx, waitForReceipt } = useUniPassWallet();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [walletInput, setWalletInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState<PendingStaff | null>(null);

  async function refresh() {
    const response = await fetch(`/api/events/${metadataEventId}/staff`, { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || "Could not load staff.");
    setStaff(body.staff as Staff[]);
  }
  useEffect(() => { void refresh().catch(cause => setError(cause instanceof Error ? cause.message : "Could not load staff list.")); }, [metadataEventId]);

  async function sync(pendingStaff: PendingStaff) {
    const response = await fetch(`/api/events/${metadataEventId}/staff`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pendingStaff), cache: "no-store",
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || "Transaction confirmed, but the list has not synced.");
    setPending(null); setMessage(pendingStaff.authorized ? "Staff member added." : "Staff permission revoked.");
    await refresh();
  }

  async function setPermission(address: string, authorized: boolean) {
    setBusy(true); setError(""); setMessage("");
    try {
      const normalized = getAddress(address);
      const { signer, address: connected } = await getSigner();
      if (connected.toLowerCase() !== organizerWallet.toLowerCase()) throw new Error("Sign in with the event organizer wallet.");
      const sessionResponse = await fetch("/api/auth/session", { cache: "no-store" });
      const session = await sessionResponse.json();
      if (session.wallet?.toLowerCase() !== connected.toLowerCase()) throw new Error("Sign in with the organizer wallet first.");
      const manager = eventManagerV2(signer);
      await ensureGas();
      const transaction = { hash: await sendTx({ to: await manager.getAddress(), data: manager.interface.encodeFunctionData("setEventStaff", [BigInt(chainEventId), normalized, authorized]) }) };
      const next = { wallet: normalized, authorized, chainTx: transaction.hash };
      setPending(next);
      const receipt = await waitForReceipt(transaction.hash);
      if (!receipt || receipt.status !== 1) throw new Error(`Permission transaction was not confirmed: ${transaction.hash}`);
      await sync(next);
      setWalletInput("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update staff."); }
    finally { setBusy(false); }
  }

  return <section className="tool-panel" aria-labelledby="event-staff-title">
    <h2 id="event-staff-title">Check-in staff</h2>
    <p>Permissions are recorded on EventManager V2 per event. Only the organizer wallet can add or remove staff.</p>
    <div className="staff-add-row"><label className="field">Staff wallet address<input value={walletInput} onChange={event => setWalletInput(event.target.value)} autoComplete="off" spellCheck={false} placeholder="0x…" /></label><button className="button button-dark" type="button" disabled={busy || Boolean(pending) || !walletInput.trim()} onClick={() => void setPermission(walletInput, true)}>{busy ? "Confirming…" : "Add staff"}</button></div>
    {pending && <div className="notice warning" role="status"><p>Transaction sent. Hash: {pending.chainTx}</p><button className="button button-light" type="button" disabled={busy} onClick={() => { setBusy(true); void sync(pending).catch(cause => setError(cause instanceof Error ? cause.message : "Could not sync.")).finally(() => setBusy(false)); }}>Retry sync</button></div>}
    {staff.length > 0 ? <ul className="staff-list">{staff.map(item => <li key={item.wallet}><code>{item.wallet}</code><button className="button button-light" type="button" disabled={busy || Boolean(pending)} onClick={() => void setPermission(item.wallet, false)}>Revoke</button></li>)}</ul> : <p className="seed-note">No authorized staff yet.</p>}
    {message && <p className="notice success" role="status">{message}</p>}{error && <p className="notice warning" role="alert">{error}</p>}
  </section>;
}

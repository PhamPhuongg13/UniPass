"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Interface } from "ethers";
import { useUniPassWallet } from "@/components/WalletProvider";
import { BRIDGE_ABI } from "@/lib/icm/contracts";
import { claimMessage } from "@/lib/icm/quest-message.mjs";
type Config = { name: string; chainId: number; blockchainID: string; bridge: string; quest: string; explorer: string };
type Status = { passport: { expiresAt: number; sentAt: number; receivedAt: number; zkVerified: boolean }; isStudent: boolean; claimed: boolean; claimedAt: number; fujiSentAt: number; l1ClaimedAt: number; fujiReceivedAt: number; l1DeliveryTx: string | null; l1ClaimTx: string | null; fujiDeliveryTx: string | null; fujiSendTx: string | null };
function Tx({ hash, base, label }: { hash: string | null; base: string; label: string }) {
  if (!hash) return null;
  return <p>{label}: {base ? <a href={`${base.replace(/\/$/, "")}/tx/${hash}`} target="_blank" rel="noopener noreferrer">{hash.slice(0, 10)}…{hash.slice(-6)} ↗</a> : <code title="Click to copy" onClick={() => void navigator.clipboard.writeText(hash)} style={{ cursor: "copy" }}>{hash}</code>}</p>;
}
export function PassportL1Panel({ config }: { config: Config }) {
  const wallet = useUniPassWallet();
  const [status, setStatus] = useState<Status | null>(null);
  const [passportReady, setPassportReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fujiTx, setFujiTx] = useState("");
  const [l1Tx, setL1Tx] = useState("");
  const [sendTime, setSendTime] = useState(0);
  const [claimTime, setClaimTime] = useState(0);
  const [now, setNow] = useState(Date.now());
  const refresh = useCallback(async () => {
    if (!wallet.address || !wallet.ready) return;
    const [stateResponse, eligibilityResponse] = await Promise.all([fetch("/api/icm/status", { cache: "no-store" }), fetch("/api/student-verification/status", { cache: "no-store" })]);
    if (stateResponse.ok) setStatus(await stateResponse.json());
    if (eligibilityResponse.ok) setPassportReady(Boolean((await eligibilityResponse.json()).verified));
  }, [wallet.address, wallet.ready]);
  useEffect(() => { void refresh().catch(() => {}); const poll = setInterval(() => void refresh().catch(() => {}), 3000); return () => clearInterval(poll); }, [refresh]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  async function sendPassport() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/icm/attestation", { method: "POST" });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not sign passport.");
      const iface = new Interface(BRIDGE_ABI);
      await wallet.ensureGas();
      const hash = await wallet.sendTx({ to: config.bridge, data: iface.encodeFunctionData("sendPassport", [config.blockchainID, data.attestation, data.signature]) });
      setFujiTx(hash); await wallet.waitForReceipt(hash); setSendTime(Date.now()); await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not send passport."); }
    finally { setBusy(false); }
  }
  async function claimQuest() {
    setBusy(true); setError("");
    try {
      const { signer, address } = await wallet.getSigner();
      const deadline = Math.floor(Date.now() / 1000) + 600;
      const signature = await signer.signMessage(claimMessage(address, 1, config.chainId, config.quest, deadline));
      const response = await fetch("/api/icm/quest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deadline, signature }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not claim quest.");
      setL1Tx(data.txHash); setClaimTime(Date.now()); await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not claim quest."); }
    finally { setBusy(false); }
  }
  const arrived = Boolean(status?.isStudent);
  const stamped = Boolean(status?.claimedAt);
  const outboundSeconds = status?.passport.receivedAt && status?.passport.sentAt ? Math.max(0, status.passport.receivedAt - status.passport.sentAt) : (sendTime || status?.fujiSentAt) ? Math.floor((now - (sendTime || status!.fujiSentAt * 1000)) / 1000) : 0;
  const inboundSeconds = stamped && status?.fujiReceivedAt && status?.l1ClaimedAt ? Math.max(0, status.fujiReceivedAt - status.l1ClaimedAt) : claimTime ? Math.floor((now - claimTime) / 1000) : 0;
  return <div className="tool-panel icm-panel"><span className="eyebrow">AVALANCHE INTERCHAIN MESSAGING</span><h3>{config.name} · Campus Quest</h3><p>Avalanche Interchain Messaging carries your passport to another chain — no bridge, no tokens, no call to UniPass servers.</p>
    {!wallet.ready ? <p>Connecting wallet…</p> : !wallet.address ? <p>Sign in to send your passport. <button className="button button-dark" onClick={wallet.login}>Sign in</button></p> : !passportReady ? <p>Get your student passport first. <Link href="/verify-student">Verify your school email →</Link></p> : <>
      <ol><li><b>Send your passport to {config.name}</b>{arrived ? <p>Passport arrived on {config.name} in {outboundSeconds} s.</p> : (fujiTx || status?.fujiSendTx) ? <p>Relaying through Avalanche ICM… {outboundSeconds} s</p> : <p>Your signed school status travels to the L1.</p>}{!arrived && <button className="button button-dark" disabled={busy} onClick={() => void sendPassport()}>{busy ? "Sending…" : (fujiTx || status?.fujiSendTx) ? "Send a fresh passport" : "Send your passport"}</button>}<Tx hash={fujiTx || status?.fujiSendTx || null} base="https://testnet.snowtrace.io" label="Fuji transaction"/><Tx hash={status?.l1DeliveryTx || null} base={config.explorer} label="L1 delivery"/></li>
      <li><b>Claim Campus Quest on {config.name}</b>{arrived ? status?.claimed ? <p>Quest claimed on {config.name}.</p> : <button className="button button-dark" disabled={busy} onClick={() => void claimQuest()}>{busy ? "Claiming…" : `Claim Campus Quest on ${config.name}`}</button> : <p>Available after your passport arrives.</p>}<Tx hash={l1Tx || status?.l1ClaimTx || null} base={config.explorer} label="L1 claim"/></li>
      <li><b>Return stamp to Fuji</b>{stamped ? <p>Stamp returned to your passport on Avalanche C-Chain{status?.fujiReceivedAt && status?.l1ClaimedAt || claimTime ? ` in ${inboundSeconds} s` : ""}.</p> : status?.claimed ? <p>Relaying through Avalanche ICM… {inboundSeconds} s</p> : <p>The Campus Quest stamp will appear on your passport.</p>}<Tx hash={status?.fujiDeliveryTx || null} base="https://testnet.snowtrace.io" label="Fuji delivery"/></li></ol>
    </>}{error && <p role="alert" className="form-error">{error}</p>}</div>;
}

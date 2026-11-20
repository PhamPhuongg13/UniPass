"use client";

import { useEffect, useState } from "react";
import { useUniPassWallet } from "@/components/WalletProvider";
import Link from "next/link";
import { EVENT_MANAGER_ADDRESS, eventManager, eventManagerInterface, ticketInterface } from "@/lib/contracts/chain";

type Result = { tokenId: string; txHash: string };

function messageFor(cause: unknown, eligibility: string) {
  const value = cause as { reason?: string; shortMessage?: string; message?: string };
  const message = `${value?.reason || ""} ${value?.shortMessage || ""} ${value?.message || ""}`;
  if (message.includes("Student already registered")) return eligibility === "OPEN" ? "This wallet already has a ticket." : "this passport already has a ticket (from another wallet).";
  if (message.includes("Already registered")) return "This wallet already has a ticket.";
  if (message.includes("Event full")) return "Event is full.";
  if (message.includes("Registration closed")) return "Registration is closed.";
  if (message.includes("Authorization expired")) return "Registration authorization expired. Try again.";
  if (message.includes("ACTION_REJECTED") || message.includes("user rejected")) return "You cancelled the wallet transaction.";
  return "Could not register. Check the wallet and Fuji connection, then retry.";
}

export function EventRegisterButton({ eventId, metadataId, wallet, eligibility, allowedSchoolDomains, passportReady = true }: { eventId: string; metadataId: string; wallet: string | null; eligibility: "OPEN" | "STUDENT" | "SCHOOLS"; allowedSchoolDomains: string[]; passportReady?: boolean }) {
  const { getSigner, ensureGas, sendTx, waitForReceipt } = useUniPassWallet();
  const [verified, setVerified] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  useEffect(() => {
    if (eligibility === "OPEN") { setVerified(true); return; }
    if (!wallet) { setVerified(false); return; }
    void fetch("/api/student-verification/status", { cache: "no-store" }).then(response => response.json()).then(data => setVerified(data.verified === true)).catch(() => setVerified(false));
  }, [wallet, eligibility]);

  async function register() {
    if (!wallet) { setError("Sign in before registering."); return; }
    setBusy(true); setError(""); setResult(null);
    try {
      if (eligibility !== "OPEN") {
        const status = await fetch("/api/student-verification/status", { cache: "no-store" }).then(response => response.json());
        setVerified(status.verified === true);
        if (!status.verified) throw new Error("STUDENT_NOT_VERIFIED");
        if (eligibility === "SCHOOLS" && !allowedSchoolDomains.some(domain => status.domain === domain || status.domain?.endsWith(`.${domain}`))) throw new Error("SCHOOL_NOT_ALLOWED");
      }
      const response = await fetch(`/api/events/${metadataId}/registration-authorization`, { method: "POST", cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Server could not issue registration authorization.");
      const connected = await getSigner();
      if (connected.address.toLowerCase() !== wallet.toLowerCase()) throw new Error("Connected wallet differs from your sign-in session.");
      const manager = eventManager(connected.signer);
      await manager.registerEvent.staticCall(data.authorization, data.signature);
      await ensureGas();
      const transaction = { hash: await sendTx({ to: await manager.getAddress(), data: manager.interface.encodeFunctionData("registerEvent", [data.authorization, data.signature]) }) };
      const receipt = await waitForReceipt(transaction.hash);
      if (!receipt || receipt.status !== 1) throw new Error("Transaction was not confirmed on Fuji.");
      const minted = receipt.logs.map((log: { topics: readonly string[]; data: string }) => { try { return ticketInterface.parseLog({ topics: [...log.topics], data: log.data }); } catch { return null; } }).find((log: { name: string } | null) => log?.name === "TicketMinted");
      const registered = receipt.logs.map((log: { topics: readonly string[]; data: string }) => { try { return eventManagerInterface.parseLog({ topics: [...log.topics], data: log.data }); } catch { return null; } }).find((log: { name: string } | null) => log?.name === "StudentRegistered");
      if (!minted || !registered || String(minted.args.eventId) !== eventId || String(registered.args.eventId) !== eventId || String(minted.args.student).toLowerCase() !== wallet.toLowerCase()) throw new Error("Receipt lacks a valid registration or ticket mint.");
      const tokenId = String(minted.args.tokenId);
      setResult({ tokenId, txHash: transaction.hash });
      const mirror = await fetch(`/api/events/${metadataId}/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tokenId, chainTx: transaction.hash }) });
      if (!mirror.ok) setError("Ticket minted on Fuji but is not yet in your list. You can still open it from the blockchain.");
    } catch (cause) {
      if (cause instanceof Error && cause.message === "STUDENT_NOT_VERIFIED") setError("Get your UniPass with a school email before registering.");
      else if (cause instanceof Error && cause.message === "SCHOOL_NOT_ALLOWED") setError("Your verified school is not eligible for this event.");
      else if (cause instanceof Error && !cause.message.includes("CALL_EXCEPTION") && !cause.message.includes("execution reverted") && !cause.message.includes("ACTION_REJECTED")) setError(cause.message);
      else setError(messageFor(cause, eligibility));
    } finally { setBusy(false); }
  }

  const duplicate = error.includes("this passport already has a ticket") || error.includes("This wallet already has a ticket");
  return <div className="register-action">
    {!wallet && <p className="notice warning">Sign in to register.</p>}
    {wallet && !passportReady && <p className="notice warning">This needs a verified passport. <Link href="/verify-student">Get your UniPass →</Link></p>}
    {wallet && eligibility !== "OPEN" && verified === false && passportReady && <p className="notice warning">Get your UniPass before receiving a ticket.</p>}
    <button className="button button-dark" type="button" disabled={busy || !wallet || !passportReady} onClick={() => void register()}>{busy ? "Registering on Fuji…" : "Register for event"}</button>
    {error && <div className="notice warning" role="alert" style={duplicate ? { borderColor: "#b91c1c", color: "#991b1b", background: "#fef2f2" } : undefined}><b>{error}</b>{eligibility !== "OPEN" && error.includes("verify school email") && <p><Link href="/verify-student">Get your UniPass</Link></p>}{duplicate && <p>Event #{eventId} · Contract {EVENT_MANAGER_ADDRESS}</p>}</div>}
    {result && <div className="notice" role="status">NFT ticket #{result.tokenId} minted. <Link href={`/tickets/${result.tokenId}`}>Open ticket</Link> · <a href={`https://testnet.snowtrace.io/tx/${result.txHash}`} target="_blank" rel="noopener noreferrer">View transaction on Snowtrace</a></div>}
  </div>;
}

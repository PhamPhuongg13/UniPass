"use client";

import { useState } from "react";
import { useUniPassWallet } from "@/components/WalletProvider";
import { useRouter } from "next/navigation";
import type { Log, LogDescription } from "ethers";
import { eventManager, eventManagerInterface, verifyContractLink } from "@/lib/contracts/chain";

export function PublishEventOnChainButton({ eventId, capacity, deadline, wallet, chainTx }: { eventId: string; capacity: number | null; deadline: string | null; wallet: string; chainTx?: string | null }) {
  const { getSigner, ensureGas, sendTx, waitForReceipt } = useUniPassWallet();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  async function reconcile(hash: string) {
    const receipt = await waitForReceipt(hash);
    if (!receipt) throw new Error(`Transaction ${hash} is still pending on Fuji. Reload to check again.`);
    if (receipt.status !== 1) {
      await fetch(`/api/events/${eventId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ syncStatus: "FAILED" }) });
      throw new Error(`Transaction event creation reverted: ${hash}`);
    }
    const created = receipt.logs.map((log: Log) => {
      try { return eventManagerInterface.parseLog({ topics: [...log.topics], data: log.data }); } catch { return null; }
    }).find((log: LogDescription | null) => log?.name === "EventCreated");
    if (!created) throw new Error(`Transaction ${hash} succeeded but lacks EventCreated.`);
    const saved = await fetch(`/api/events/${eventId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chainEventId: String(created.args.eventId), chainTx: hash, syncStatus: "SYNCED", visibility: "PUBLIC" }) });
    if (!saved.ok) throw new Error(`Event created (${hash}) but metadata could not be linked.`);
    router.refresh();
  }
  async function publish() {
    setBusy(true); setError("");
    try {
      if (!capacity || !deadline) throw new Error("Add capacity and registration deadline before creating on-chain.");
      const connected = await getSigner();
      if (connected.address.toLowerCase() !== wallet.toLowerCase()) throw new Error("Connect the organizer wallet.");
      const response = await fetch("/api/auth/session", { cache: "no-store" });
      const session = await response.json();
      if (session.wallet?.toLowerCase() !== wallet.toLowerCase()) throw new Error("Sign in with the organizer wallet.");
      await verifyContractLink(connected.signer);
      if (chainTx) {
        await reconcile(chainTx);
        return;
      }
      const manager = eventManager(connected.signer);
      await ensureGas();
      const tx = { hash: await sendTx({ to: await manager.getAddress(), data: manager.interface.encodeFunctionData("createEvent", [capacity, BigInt(Math.floor(new Date(deadline).getTime() / 1000))]) }) };
      const pendingSaved = await fetch(`/api/events/${eventId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chainTx: tx.hash, syncStatus: "PENDING" }) });
      if (!pendingSaved.ok) throw new Error(`Transaction ${tx.hash} was sent but its hash was not saved. Do not resend; use this hash to recover it.`);
      await reconcile(tx.hash);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create event on Fuji."); }
    finally { setBusy(false); }
  }
  return <div className="chain-publish"><button className="button button-dark" type="button" onClick={publish} disabled={busy}>{busy?"Checking transaction…":chainTx?"Check sent transaction":"Create event on Fuji"}</button>{error&&<p className="notice warning" role="alert">{error}</p>}</div>;
}

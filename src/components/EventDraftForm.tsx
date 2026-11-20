"use client";
import { useState } from "react";
import { useUniPassWallet } from "@/components/WalletProvider";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { EligibilityPicker } from "@/components/EligibilityPicker";
import type { Log, LogDescription } from "ethers";
import { contractsConfigured, eventManager, eventManagerInterface, verifyContractLink } from "@/lib/contracts/chain";

type EditableEvent = { id: string; title: string; description: string; category: string; startsAt: string; endsAt: string; location: string; isOnline: boolean; metadataCapacity: number | null; registrationDeadline: string | null; coverUrl: string | null; eligibility: string; allowedSchoolDomains: string[] };
function toLocal(iso: string) { const date = new Date(new Date(iso).getTime() + 7 * 60 * 60_000); return date.toISOString().slice(0, 16); }
export function EventDraftForm({ event }: { event?: EditableEvent }) {
  const { getSigner, ensureGas, sendTx, waitForReceipt } = useUniPassWallet();
  const router = useRouter();
  const [eligibility, setEligibility] = useState(event?.eligibility ?? "OPEN");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [savedEventUrl, setSavedEventUrl] = useState("");
  async function submit(form: FormData) {
    setError("");setFieldErrors({});
    const capacity = String(form.get("capacity") || "");
    const deadline = String(form.get("deadline") || "");
    const coverUrl = String(form.get("coverUrl") || "");
    const parseVietnam = (value: string) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? new Date(`${value}:00+07:00`) : new Date(NaN);
    const start = parseVietnam(String(form.get("startsAt") || ""));
    const end = parseVietnam(String(form.get("endsAt") || ""));
    const limit = deadline ? parseVietnam(deadline) : new Date(start.getTime() - 60 * 60_000);
    const errors: Record<string, string> = {};
    if (!Number.isFinite(start.getTime()) || start <= new Date()) errors.startsAt = "Choose a future start time (Vietnam time).";
    if (!Number.isFinite(end.getTime()) || end <= start) errors.endsAt = "End time must be after start time.";
    if (!Number.isFinite(limit.getTime()) || limit <= new Date() || limit >= start) errors.deadline = "Registration deadline must be in the future and before the event.";
    if (!Number.isInteger(Number(capacity)) || Number(capacity) < 1 || Number(capacity) > 100000) errors.capacity = "Capacity must be between 1 and 100,000.";
    const selectedDomains = form.getAll("schoolDomain").map(String);
    const extraDomains = String(form.get("extraDomains") || "").split(/[\s,;]+/).filter(Boolean).map(value => value.toLowerCase());
    const allowedSchoolDomains = [...new Set([...selectedDomains, ...extraDomains])];
    const domainPattern = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+edu\.vn$/;
    if (eligibility === "SCHOOLS" && !allowedSchoolDomains.length) errors.schools = "Select at least one school.";
    if (eligibility === "SCHOOLS" && allowedSchoolDomains.some(domain => !domainPattern.test(domain))) errors.schools = "Domain must end in .edu.vn.";
    if (Object.keys(errors).length) { setFieldErrors(errors); setError("Check the highlighted fields."); return; }
    setBusy(true);
    let metadataEventId = "";
    const payload = {
      title: String(form.get("title") || ""), description: String(form.get("description") || ""),
      category: String(form.get("category") || "community"),
      startsAt: start.toISOString(), endsAt: end.toISOString(),
      location: String(form.get("location") || ""), isOnline: form.get("isOnline") === "on", timezone: "Asia/Ho_Chi_Minh",
      metadataCapacity: Number(capacity), registrationDeadline: limit.toISOString(), ...(coverUrl ? { coverUrl } : event ? { coverUrl: null } : {}),
      eligibility, allowedSchoolDomains: eligibility === "SCHOOLS" ? allowedSchoolDomains : [],
      ...(event ? {} : { visibility: "UNLISTED" }),
    };
    try {
      if (event) {
        const response = await fetch(`/api/events/${event.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not update event.");
        router.refresh();
        setSavedEventUrl(`/organizer/events/${event.id}`);
        return;
      }
      if (!contractsConfigured()) throw new Error("Contract address is missing. Check configuration and restart.");
      const connected = await getSigner();
      const sessionResponse = await fetch("/api/auth/session", { cache: "no-store" });
      const session = await sessionResponse.json();
      if (!session.wallet || session.wallet.toLowerCase() !== connected.address.toLowerCase()) throw new Error("Sign in with the wallet that will create the transaction.");
      await verifyContractLink(connected.signer);
      const response = await fetch("/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save event.");
      metadataEventId = result.event.id;
      const eventUrl = `/organizer/events/${metadataEventId}`;
      setSavedEventUrl(eventUrl);
      const manager = eventManager(connected.signer);
      await ensureGas();
      const tx = { hash: await sendTx({ to: await manager.getAddress(), data: manager.interface.encodeFunctionData("createEvent", [Number(capacity), BigInt(Math.floor(limit.getTime() / 1000))]) }) };
      const pendingSaved = await fetch(`/api/events/${metadataEventId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chainTx: tx.hash, syncStatus: "PENDING" }) });
      if (!pendingSaved.ok) throw new Error(`Transaction ${tx.hash} was sent but its hash was not saved. Do not resend; use the organizer page to recover it.`);
      const receipt = await waitForReceipt(tx.hash);
      if (!receipt || receipt.status !== 1) throw new Error("Event creation transaction was not confirmed.");
      const created = receipt.logs.map((log: Log) => {
        try { return eventManagerInterface.parseLog({ topics: [...log.topics], data: log.data }); } catch { return null; }
      }).find((log: LogDescription | null) => log?.name === "EventCreated");
      if (!created) throw new Error(`Transaction ${tx.hash} succeeded, but event ID could not be read from the receipt.`);
      const syncResponse = await fetch(`/api/events/${metadataEventId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chainEventId: String(created.args.eventId), chainTx: tx.hash, syncStatus: "SYNCED", visibility: "PUBLIC" }) });
      if (!syncResponse.ok) throw new Error(`Event was created on-chain (${tx.hash}), but its ID was not synced to UniPass. Check the organizer page.`);
      router.push(eventUrl);
      router.refresh();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Could not save event.";
      setError(metadataEventId ? `Metadata saved. ${message}` : message);
    }
    finally { setBusy(false); }
  }
  return <form action={submit} className="tool-panel"><div className="form-grid">
    <label className="field full">Event title<input name="title" defaultValue={event?.title} required minLength={3} maxLength={140} placeholder="Your event title"/></label>
    <label className="field">Category<select name="category" defaultValue={event?.category ?? "community"}><option value="community">Community</option><option value="tech">Tech & hackathons</option><option value="workshop">Workshop</option><option value="career">Careers</option><option value="club">Clubs</option></select></label>
    <label className="field">Starts · Vietnam time<input name="startsAt" type="datetime-local" defaultValue={event ? toLocal(event.startsAt) : undefined} required aria-invalid={!!fieldErrors.startsAt}/>{fieldErrors.startsAt&&<small className="field-error">{fieldErrors.startsAt}</small>}</label><label className="field">Ends · Vietnam time<input name="endsAt" type="datetime-local" defaultValue={event ? toLocal(event.endsAt) : undefined} required aria-invalid={!!fieldErrors.endsAt}/>{fieldErrors.endsAt&&<small className="field-error">{fieldErrors.endsAt}</small>}</label>
    <label className="field">Location<input name="location" defaultValue={event?.location} required minLength={2} maxLength={300} placeholder="Venue name or Online"/></label>
    <label className="field">Capacity<input name="capacity" defaultValue={event?.metadataCapacity ?? undefined} type="number" min="1" max="100000" placeholder="120" required aria-invalid={!!fieldErrors.capacity}/>{fieldErrors.capacity&&<small className="field-error">{fieldErrors.capacity}</small>}</label>
    <label className="field">Registration deadline · Vietnam time<input name="deadline" defaultValue={event?.registrationDeadline ? toLocal(event.registrationDeadline) : undefined} type="datetime-local" aria-invalid={!!fieldErrors.deadline}/>{fieldErrors.deadline&&<small className="field-error">{fieldErrors.deadline}</small>}</label>
    <label className="field">Cover image URL<input name="coverUrl" defaultValue={event?.coverUrl ?? undefined} type="url" placeholder="https://…"/></label>
    <label className="field full">Description<textarea name="description" defaultValue={event?.description} required minLength={10} maxLength={10000} placeholder="What will attendees experience?"/></label>
    <EligibilityPicker eligibility={eligibility} onChange={setEligibility} selectedDomains={event?.allowedSchoolDomains} error={fieldErrors.schools}/>
    <label className="check-inline full"><input name="isOnline" defaultChecked={event?.isOnline} type="checkbox"/><span>Online event</span></label>
  </div>{!event && <div className="notice">Creating an event saves its details and sends createEvent on Fuji. Capacity is required; the default deadline is one hour before start.</div>}{error&&<div className="notice warning" role="alert">{error}{savedEventUrl&&<> <Link className="text-link" href={savedEventUrl}>Open event manager</Link></>}</div>}<button className="button button-dark" type="submit" disabled={busy}>{busy ? "Saving…" : event ? "Save changes" : "Create event"}</button></form>;
}

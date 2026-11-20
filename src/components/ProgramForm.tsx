"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { parseUnits } from "ethers";
import { EligibilityPicker } from "@/components/EligibilityPicker";
const paths: Record<string,string> = { GIVEAWAY:"giveaways", SCHOLARSHIP:"scholarships", DISCOUNT:"discounts", ECOSYSTEM:"ecosystem" };
export function ProgramForm({ kind }: { kind: "GIVEAWAY"|"SCHOLARSHIP"|"DISCOUNT"|"ECOSYSTEM" }) {
  const router = useRouter(); const [eligibility,setEligibility] = useState(kind === "SCHOLARSHIP" || kind === "ECOSYSTEM" ? "STUDENT" : "OPEN"); const [busy,setBusy] = useState(false); const [error,setError] = useState("");
  async function submit(form: FormData) {
    setBusy(true); setError("");
    try {
      const selected = form.getAll("schoolDomain").map(String); const extraDomains = String(form.get("extraDomains") || "").split(/[\s,;]+/).filter(Boolean);
      const extra = kind === "SCHOLARSHIP" ? { awardAmount: parseUnits(String(form.get("awardAmount")||"0"),6).toString(), questionPrompt: String(form.get("questionPrompt")||"") } : kind === "DISCOUNT" ? { brand: String(form.get("brand")||""), discountText: String(form.get("discountText")||""), terms: String(form.get("terms")||"") } : kind === "ECOSYSTEM" ? { partnerName: String(form.get("partnerName")||""), redirectAllowList: String(form.get("redirectAllowList")||"").split(/[\s,]+/).filter(Boolean), questText: String(form.get("questText")||"") } : {};
      const body = { kind, title: String(form.get("title")||""), description: String(form.get("description")||""), sponsor: String(form.get("sponsor")||""), cap: Number(form.get("cap")), closesAt: new Date(`${form.get("closesAt")}:00+07:00`).toISOString(), eligibility, allowedSchoolDomains: eligibility === "SCHOOLS" ? [...new Set([...selected,...extraDomains])] : [], amountPerClaim: kind === "GIVEAWAY" ? parseUnits(String(form.get("amountPerClaim")||"0"),6).toString() : "0", extra };
      const response = await fetch("/api/programs", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body) }); const result = await response.json(); if (!response.ok) throw new Error(result.error||"Could not create program."); router.push(`/${paths[kind]}/${result.program.slug}`); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create program."); } finally { setBusy(false); }
  }
  return <form action={submit} className="tool-panel"><div className="form-grid"><label className="field full">Program title<input name="title" minLength={3} maxLength={100} required placeholder={kind === "ECOSYSTEM" ? "Avalanche Builder Quest" : kind === "SCHOLARSHIP" ? "Student Builder Scholarship" : kind === "DISCOUNT" ? "Campus cafe offer" : "Welcome giveaway"}/></label><label className="field full">Description<textarea name="description" minLength={10} maxLength={2000} required placeholder="What will students receive?"/></label><label className="field">Sponsor or organizer<input name="sponsor" minLength={2} maxLength={100} required/></label><label className="field">Maximum stamps<input name="cap" type="number" min={1} max={1000000} required/></label><label className="field full">Closes at · Vietnam time<input name="closesAt" type="datetime-local" required/></label>
  {kind === "GIVEAWAY" && <label className="field">tUSDC per claim<input name="amountPerClaim" type="number" min="0.000001" step="0.000001" defaultValue="5" required/></label>}
  {kind === "SCHOLARSHIP" && <><label className="field">Award · tUSDC<input name="awardAmount" type="number" min="0.000001" step="0.000001" required/></label><label className="field full">Question for applicants<input name="questionPrompt" minLength={5} maxLength={300} required/></label></>}
  {kind === "DISCOUNT" && <><label className="field">Brand<input name="brand" required/></label><label className="field">Discount offer<input name="discountText" required/></label><label className="field full">Terms<textarea name="terms" required/></label></>}
  {kind === "ECOSYSTEM" && <><label className="field">Partner name<input name="partnerName" required/></label><label className="field full">Allowed callback URLs, separated by commas<input name="redirectAllowList" required placeholder="https://partner.example/callback"/></label><label className="field full">Quest text<input name="questText" required/></label></>}
  <EligibilityPicker eligibility={eligibility} onChange={setEligibility}/></div>{error && <p className="notice warning" role="alert">{error}</p>}<button className="button button-dark" disabled={busy}>{busy ? "Creating on Avalanche…" : "Create program"}</button></form>;
}

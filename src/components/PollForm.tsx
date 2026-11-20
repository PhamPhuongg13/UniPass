"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { EligibilityPicker } from "@/components/EligibilityPicker";
export function PollForm() {
  const router = useRouter();
  const [options, setOptions] = useState(["", ""]);
  const [eligibility, setEligibility] = useState("OPEN");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(form: FormData) {
    setBusy(true); setError("");
    const selected = form.getAll("schoolDomain").map(String);
    const extra = String(form.get("extraDomains") || "").split(/[\s,;]+/).filter(Boolean);
    const closes = String(form.get("closesAt") || "");
    try {
      const response = await fetch("/api/polls", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: String(form.get("title") || ""), description: String(form.get("description") || ""), options, closesAt: new Date(`${closes}:00+07:00`).toISOString(), eligibility, allowedSchoolDomains: eligibility === "SCHOOLS" ? [...new Set([...selected, ...extra])] : [] }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not create poll.");
      router.push(`/polls/${result.poll.slug}`); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create poll."); }
    finally { setBusy(false); }
  }
  return <form action={submit} className="tool-panel"><div className="form-grid"><label className="field full">Title<input name="title" minLength={3} maxLength={120} required placeholder="What should our club do next?"/></label><label className="field full">Description<textarea name="description" maxLength={2000} placeholder="Give voters the context they need."/></label><label className="field full">Closes at · Vietnam time<input name="closesAt" type="datetime-local" required/></label><div className="full"><h2>Options</h2>{options.map((value,index)=><div className="poll-option-row" key={index}><input aria-label={`Option ${index+1}`} value={value} maxLength={80} required onChange={event=>setOptions(current=>current.map((item,i)=>i===index?event.target.value:item))}/>{options.length>2&&<button type="button" onClick={()=>setOptions(current=>current.filter((_,i)=>i!==index))}>Remove</button>}</div>)}{options.length<10&&<button type="button" className="button button-light" onClick={()=>setOptions(current=>[...current,""])}>Add option</button>}</div><EligibilityPicker eligibility={eligibility} onChange={setEligibility}/></div>{error&&<p className="notice warning" role="alert">{error}</p>}<button className="button button-dark" type="submit" disabled={busy}>{busy?"Creating poll…":"Create a poll"}</button></form>;
}

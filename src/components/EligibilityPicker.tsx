"use client";
import { schools } from "@/lib/schools";
export function EligibilityPicker({ eligibility, onChange, selectedDomains = [], error }: { eligibility: string; onChange: (value: string) => void; selectedDomains?: string[]; error?: string }) {
  return <fieldset className="choice-group full"><legend>Who can participate?</legend><div className="choice-cards">{[
    ["OPEN", "Everyone", "Anyone with a wallet. One action per wallet."],
    ["STUDENT", "Verified students", "A verified .edu.vn school email. One action per passport."],
    ["SCHOOLS", "Specific schools", "Only students from the schools you select."],
  ].map(([value,title,description])=><label key={value} className={`choice-card${eligibility === value ? " is-selected" : ""}`}><input type="radio" name="eligibility" value={value} checked={eligibility === value} onChange={() => onChange(value)}/><span><b>{title}</b><small>{description}</small></span></label>)}</div>
    {eligibility === "SCHOOLS" && <div className="school-picker"><div className="school-options">{Object.entries(schools).map(([domain, school])=><label key={domain} className="school-chip" title={school.name}><input type="checkbox" name="schoolDomain" value={domain} defaultChecked={selectedDomains.includes(domain)}/><span>{school.short}</span></label>)}</div><label className="field">Other school domains<input name="extraDomains" placeholder="abc.edu.vn, xyz.edu.vn" defaultValue={selectedDomains.filter(domain => !schools[domain]).join(", ")}/></label>{error&&<small className="field-error">{error}</small>}</div>}</fieldset>;
}

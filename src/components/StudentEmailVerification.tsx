"use client";

import { useEffect, useState } from "react";
import { Copy, ShieldCheck, Upload } from "lucide-react";
import { usePrivy, useLinkEmail } from "@privy-io/react-auth";
import { useUniPassWallet } from "@/components/WalletProvider";
import { APP_ID_STATE } from "@/lib/privy/app-id";

type Challenge = { challengeId: string; challenge: string; expiresAt: string; subject: string; body: string };
type Status = { verified: boolean; school?: string; expiresAt?: string };

function ActiveStudentEmailVerification({ wallet: _wallet }: { wallet: string | null }) {
  const { address, login, ready, getAccessToken } = useUniPassWallet();
  const { linkGoogle } = usePrivy();
  const { sendCode, linkWithCode } = useLinkEmail();
  const [schoolEmail, setSchoolEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [status, setStatus] = useState<Status>({ verified: false });
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!ready || !address) return;
    void fetch("/api/student-verification/status", { cache: "no-store" }).then(response => response.json()).then(data => setStatus(data)).catch(() => {});
  }, [ready, address]);

  async function run(action: () => Promise<void>) {
    setBusy(true); setError(""); setMessage("");
    try { await action(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not complete verification."); }
    finally { setBusy(false); }
  }
  async function confirmPrivy() {
    await run(async () => {
      const accessToken = await getAccessToken();
      if (!accessToken) throw new Error("Sign in to UniPass first.");
      const response = await fetch("/api/student-verification/privy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accessToken }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.code === "NO_SCHOOL_EMAIL" ? "No verified school email found in Privy. Add your school email or link your school Google account." : data.error || "Could not verify school email.");
      setStatus(data); setMessage(`Verified ${data.school}. Valid until ${new Date(data.expiresAt).toLocaleDateString("en-GB", { timeZone: "Asia/Ho_Chi_Minh" })}.`);
    });
  }
  async function verifyDkim() {
    await run(async () => {
      if (!challenge || !file) throw new Error("Create a challenge and choose an .eml file first.");
      if (new Date(challenge.expiresAt) <= new Date()) throw new Error("Challenge expired. Create a new one.");
      if (file.size > 2_000_000) throw new Error(".eml file exceeds 2 MB.");
      const response = await fetch("/api/student-verification/verify-dkim", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ challengeId: challenge.challengeId, challenge: challenge.challenge, eml: await file.text() }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not verify DKIM signature.");
      const refreshed = await fetch("/api/student-verification/status", { cache: "no-store" }).then(res => res.json());
      setStatus(refreshed); setMessage(`Verified ${refreshed.school}.`);
    });
  }

  return <section className="student-verify" aria-labelledby="student-verification-title">
    <div className="student-verify-intro"><span className="student-verify-stamp"><ShieldCheck size={15}/> SCHOOL EMAIL .EDU.VN</span><h2 id="student-verification-title">Verify student status.<br/><span>Keep your email private.</span></h2><p>Get a code at your school email or link your school Google account. UniPass stores only a hash.</p></div>
    {status.verified && <div className="notice success" role="status">Verified student {status.school ? `· ${status.school}` : ""}{status.expiresAt ? ` · valid until ${new Date(status.expiresAt).toLocaleDateString("en-GB", { timeZone: "Asia/Ho_Chi_Minh" })}` : ""}.</div>}
    <ol className="student-verify-steps"><li className={address ? "is-done" : "is-current"}><b>01</b><span>Sign in to UniPass</span></li><li className={address ? "is-current" : ""}><b>02</b><span>Add school email</span></li><li><b>03</b><span>Confirm</span></li></ol>
    {!address ? <button className="button button-dark" type="button" onClick={login}>Sign in to UniPass</button> : <div className="student-verify-actions">
      <label className="field">School email<input type="email" value={schoolEmail} onChange={event => setSchoolEmail(event.target.value)} placeholder="name@school.edu.vn" autoComplete="email" /></label>
      <button className="button button-light" type="button" disabled={busy || !schoolEmail} onClick={() => void run(async () => { await sendCode({ email: schoolEmail }); setCodeSent(true); setMessage("Code sent. Check your school inbox."); })}>Send code to school email</button>
      {codeSent && <><label className="field">Confirmation code<input value={code} onChange={event => setCode(event.target.value)} inputMode="numeric" autoComplete="one-time-code" /></label><button className="button button-light" type="button" disabled={busy || !code} onClick={() => void run(async () => { await linkWithCode({ code }); setMessage("Email linked. Click Confirm to finish."); })}>Link email</button></>}
      <button className="button button-light" type="button" disabled={busy} onClick={linkGoogle}>Or link your school Google account</button>
      <button className="button button-dark" type="button" disabled={busy || !ready} onClick={() => void confirmPrivy()}>Confirm</button>
    </div>}
    {address && <details className="tool-panel"><summary>No code? Verify with an .eml file</summary><p>Send from your school email and upload the original .eml file. UniPass checks its DKIM signature and deletes the message content.</p><button className="button button-light" type="button" disabled={busy} onClick={() => void run(async () => { const response = await fetch("/api/student-verification/challenge", { method: "POST" }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not create challenge."); setChallenge(data); })}>Create email challenge</button>
      {challenge && <div className="student-challenge-card"><p className="eyebrow">SEND FROM SCHOOL EMAIL</p><div className="student-template-row"><b>Subject</b><code>{challenge.subject}</code><button type="button" aria-label="Copy subject" onClick={() => void navigator.clipboard.writeText(challenge.subject)}><Copy size={15}/></button></div><div className="student-template-body"><b>Body</b><pre>{challenge.body}</pre><button type="button" onClick={() => void navigator.clipboard.writeText(challenge.body)}>Copy body</button></div><p className="seed-note">Send from your school email to your own inbox, open “Show original” and download the .eml file.</p></div>}
      <label className="student-file-picker"><Upload size={18}/><span><b>{file?.name || "Choose original email (.eml)"}</b><small>Maximum 2 MB</small></span><input type="file" accept=".eml,message/rfc822" disabled={!challenge || busy} onChange={event => setFile(event.target.files?.[0] ?? null)}/></label><button className="button button-dark student-proof-button" type="button" disabled={!file || !challenge || busy} onClick={() => void verifyDkim()}>Verify DKIM signature</button></details>}

    {error && <div className="notice warning" role="alert">{error}</div>}{message && <div className="notice success" role="status">{message}</div>}
  </section>;
}

export function StudentEmailVerification(props: { wallet: string | null }) {
  if (APP_ID_STATE !== "ok") return <div className="notice warning">NEXT_PUBLIC_PRIVY_APP_ID is missing</div>;
  return <ActiveStudentEmailVerification {...props}/>;
}

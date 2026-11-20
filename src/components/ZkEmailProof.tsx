"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Upload } from "lucide-react";
import { useUniPassWallet } from "@/components/WalletProvider";
import { zkEmailAddress, zkEmailContract, zkEmailInterface } from "@/lib/contracts/zkemail";

type Challenge = { subject: string; body: string; expiresAt: string };
const PROGRAM_VKEY = "0x0084f70cf44dfbe813c34e00c2f9316f5bb751f3bc98bdd65a76c7ebbe8e49d3";
function proofError(cause: unknown) {
  const error = cause as { data?: string; error?: { data?: string }; message?: string };
  const data = error?.data || error?.error?.data;
  if (data) {
    try {
      const parsed = zkEmailInterface.parseError(data);
      if (parsed?.name === "UnknownDkimKey") return "Your school's email key isn't registered yet.";
      if (parsed?.name === "ProofAlreadyUsed") return "This proof was already used.";
    } catch { /* verifier errors use a separate ABI */ }
  }
  if (error?.message?.includes("UnknownDkimKey")) return "Your school's email key isn't registered yet.";
  if (error?.message?.includes("ProofAlreadyUsed")) return "This proof was already used.";
  return "The proof did not verify.";
}

export function ZkEmailProof({ wallet }: { wallet: string }) {
  const { getSigner, ensureGas, sendTx, waitForReceipt } = useUniPassWallet();
  const router = useRouter();
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [sentHash, setSentHash] = useState("");
  if (!process.env.NEXT_PUBLIC_ZKEMAIL_BLUEPRINT_SLUG || !zkEmailAddress()) return null;

  async function saveReceipt(hash: string) {
    const receipt = await waitForReceipt(hash);
    if (receipt.status !== 1) throw new Error("The Avalanche transaction reverted.");
    const response = await fetch("/api/student-verification/zk-proof", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ txHash: hash }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not save the transaction. Retry with the same hash.");
    setStatus("ZK-verified on Avalanche.");
    router.refresh();
  }
  async function createChallenge() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/student-verification/challenge", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not create challenge.");
      setChallenge(data); setFile(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create challenge."); }
    finally { setBusy(false); }
  }
  async function verifyZkEmail() {
    if (!challenge || !file) return;
    setBusy(true); setError(""); setStatus("");
    try {
      if (new Date(challenge.expiresAt) <= new Date()) throw new Error("Challenge expired. Create a new one.");
      if (file.size > 2_000_000) throw new Error(".eml file exceeds 2 MB.");
      const { address, signer } = await getSigner();
      if (address.toLowerCase() !== wallet.toLowerCase()) throw new Error("Sign in with your passport wallet.");
      const { initZkEmailSdk } = await import("@zk-email/sdk");
      const sdk = initZkEmailSdk({ logging: { enabled: false, level: "silent" } });
      const blueprint = await sdk.getBlueprint(process.env.NEXT_PUBLIC_ZKEMAIL_BLUEPRINT_SLUG!);
      const emlText = await file.text();
      setStatus("Validating email…");
      try { await blueprint.validateEmail(emlText); }
      catch { throw new Error("This email doesn't match: send the challenge from your @vnu.edu.vn mailbox and upload the original .eml."); }
      setStatus("Generating proof with zkEmail (about 10–90 s)…");
      let proof;
      try { proof = await blueprint.createProver().generateProof(emlText, []); }
      catch { throw new Error("zkEmail could not generate the proof. Please try again."); }
      const proofData = proof.props.proofData as unknown as string | { hex?: string } | undefined;
      const proofHex = typeof proofData === "string" ? proofData : proofData?.hex;
      const proofBytes = `0x${proofHex?.replace(/^0x/, "") ?? ""}`;
      const output = proof.props.publicOutputs;
      const publicValues = `0x${(!Array.isArray(output) ? output?.outputs_hex : "")?.replace(/^0x/, "") ?? ""}`;
      if (proof.props.sp1VkeyHash?.toLowerCase() !== PROGRAM_VKEY || !proofBytes.startsWith("0x4388a21c") || publicValues.length < 322) throw new Error("zkEmail returned an unexpected proof format.");
      setStatus("Checking proof on Avalanche…");
      const contract = zkEmailContract(signer);
      try { await contract.proveStudentEmail.staticCall(publicValues, proofBytes); }
      catch (cause) { throw new Error(proofError(cause)); }
      setStatus("Waiting for your transaction…");
      await ensureGas();
      const hash = await sendTx({ to: zkEmailAddress()!, data: contract.interface.encodeFunctionData("proveStudentEmail", [publicValues, proofBytes]) });
      setSentHash(hash);
      await saveReceipt(hash);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not prove student email."); setStatus(""); }
    finally { setBusy(false); }
  }
  return <details className="tool-panel"><summary>Prove it on Avalanche with zkEmail</summary>
    <p>Send the challenge from your school mailbox and pick the original .eml. The zkEmail prover turns it into a zero-knowledge proof and the UniPass contract on Avalanche checks it. UniPass never receives your email — the chain only sees the proof and your school&apos;s domain.</p>
    <p className="seed-note">Supported today: vnu.edu.vn. More schools are added by registering their DKIM key.</p>
    <button className="button button-light" type="button" disabled={busy} onClick={() => void createChallenge()}>Create email challenge</button>
    {challenge && <div className="student-challenge-card"><div className="student-template-row"><b>Subject</b><code>{challenge.subject}</code><button type="button" aria-label="Copy subject" onClick={() => void navigator.clipboard.writeText(challenge.subject)}><Copy size={15}/></button></div><div className="student-template-body"><b>Body</b><pre>{challenge.body}</pre><button type="button" onClick={() => void navigator.clipboard.writeText(challenge.body)}>Copy body</button></div><p>Send from your school mailbox to your own inbox, then download the original .eml.</p></div>}
    <label className="student-file-picker"><Upload size={18}/><span><b>{file ? "Original email selected" : "Choose original email (.eml)"}</b><small>Maximum 2 MB</small></span><input type="file" accept=".eml,message/rfc822" disabled={!challenge || busy} onChange={event => setFile(event.target.files?.[0] ?? null)}/></label>
    <button className="button button-dark student-proof-button" type="button" disabled={!file || !challenge || busy} onClick={() => void verifyZkEmail()}>{busy ? "Working…" : "Generate proof and verify on Avalanche"}</button>
    {sentHash && <p><a href={`https://testnet.snowtrace.io/tx/${sentHash}`} target="_blank" rel="noopener noreferrer">View transaction on Snowtrace ↗</a> <button type="button" disabled={busy} onClick={() => void saveReceipt(sentHash).catch(cause => setError(cause instanceof Error ? cause.message : "Could not save transaction."))}>Check transaction again</button></p>}
    {status && <p className="notice success" role="status">{status}</p>}{error && <p className="notice warning" role="alert">{error}</p>}
  </details>;
}

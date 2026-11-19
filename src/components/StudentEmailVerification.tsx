"use client";

import { useEffect, useState } from "react";
import { Copy, LoaderCircle, ShieldCheck, Upload, WalletCards } from "lucide-react";

const BLUEPRINT = "PhamPhuongg13/UniPass_Student_Verification@v2";
type Challenge = { challengeId: string; challenge: string; expiresAt: string; subject: string; body: string };
type Stage = "idle" | "issuing" | "ready" | "loading-blueprint" | "validating" | "proving" | "local-verify" | "server-verify" | "success" | "error";

const stageLabels: Record<Stage, string> = {
  idle: "Chưa bắt đầu", issuing: "Đang tạo challenge", ready: "Chờ email gốc", "loading-blueprint": "Đang tải Blueprint v2",
  validating: "Đang kiểm tra email", proving: "Đang tạo proof trên thiết bị", "local-verify": "Đang xác minh proof trên thiết bị",
  "server-verify": "Máy chủ đang xác minh lại proof", success: "Proof đã được xác minh", error: "Cần xử lý lỗi",
};

function safeMessage(error: unknown) {
  const value = error as { message?: unknown } | null;
  const message = String(value?.message ?? error).replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email]").replace(/[\r\n]+/g, " ").slice(0, 220);
  if (/502|503|504|fetch failed|network/i.test(message)) return "Registry hoặc máy chủ xác minh đang tạm thời không truy cập được. Challenge vẫn chưa bị tiêu thụ; hãy thử lại.";
  return message || "Không thể hoàn tất bước này. Hãy thử lại bằng email .eml gốc.";
}

export function StudentEmailVerification({ wallet }: { wallet: string | null }) {
  const [stage, setStage] = useState<Stage>("idle");
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const [now, setNow] = useState(Date.now());
  const [copied, setCopied] = useState(false);
  const busy = ["issuing", "loading-blueprint", "validating", "proving", "local-verify", "server-verify"].includes(stage);
  const expired = !challenge || new Date(challenge.expiresAt).getTime() <= now;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 5_000);
    return () => window.clearInterval(timer);
  }, []);

  async function issueChallenge() {
    setError(""); setResult(""); setStage("issuing");
    try {
      const response = await fetch("/api/student-verification/challenge", { method: "POST", cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Không thể tạo challenge.");
      setChallenge(data); setFile(null); setStage("ready");
    } catch (cause) { setError(safeMessage(cause)); setStage("error"); }
  }

  async function copyText(value: string) {
    try { await navigator.clipboard.writeText(value); setCopied(true); window.setTimeout(() => setCopied(false), 1500); }
    catch { setError("Trình duyệt không cho phép sao chép. Hãy chọn và sao chép nội dung thủ công."); }
  }

  async function verifyEmail() {
    if (!challenge || expired) { setError("Challenge đã hết hạn. Tạo mã mới trước khi gửi email."); setStage("error"); return; }
    if (!file) { setError("Chọn file .eml gốc bạn vừa nhận trong Gmail."); setStage("error"); return; }
    if (file.size > 2_000_000) { setError("File .eml vượt quá giới hạn 2 MB."); setStage("error"); return; }

    setError(""); setResult("");
    try {
      const eml = await file.text();
      setStage("loading-blueprint");
      const { initZkEmailSdk } = await import("@zk-email/sdk");
      const sdk = initZkEmailSdk({ logging: { enabled: false, level: "silent" } });
      let blueprint;
      let lastLoadError: unknown;
      for (let attempt = 0; attempt < 3; attempt++) {
        try { blueprint = await sdk.getBlueprint(BLUEPRINT); lastLoadError = undefined; break; }
        catch (cause) {
          lastLoadError = cause;
          const message = String((cause as { message?: unknown })?.message ?? cause);
          const retryable = /HTTP error! status: (429|500|502|503|504)\b|fetch failed|network/i.test(message);
          if (attempt < 2 && retryable) await new Promise(resolve => window.setTimeout(resolve, 250 * (2 ** attempt)));
          else break;
        }
      }
      if (!blueprint) throw lastLoadError ?? new Error("Không tải được Blueprint v2.");

      setStage("validating");
      await blueprint.validateEmail(eml);

      setStage("proving");
      const { initNoirWasm } = await import("@zk-email/sdk/initNoirWasm");
      const noirWasm = await initNoirWasm();
      const proof = await blueprint.createProver({ isLocal: true }).generateProof(eml, [], { noirWasm });

      setStage("local-verify");
      if (!await blueprint.verifyProof(proof)) throw new Error("Proof chưa vượt qua xác minh mật mã trên thiết bị.");
      const proofData = proof.getProofData();
      const decoded = proofData.publicData;
      const senderDomain = decoded?.sender_domain?.length === 1 ? decoded.sender_domain[0] : null;
      const bodyChallenge = decoded?.challenge?.length === 1 ? decoded.challenge[0] : null;
      if (senderDomain !== "vnu.edu.vn" || bodyChallenge !== challenge.challenge) {
        throw new Error("Public outputs không khớp domain VNU và challenge đang chờ. Không gửi proof lên máy chủ.");
      }
      if (!Array.isArray(proofData.publicOutputs) || typeof proofData.proofData !== "string") {
        throw new Error("Blueprint trả về định dạng proof không được backend hỗ trợ.");
      }

      setStage("server-verify");
      const response = await fetch("/api/student-verification/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ challengeId: challenge.challengeId, challenge: challenge.challenge, publicOutputs: proofData.publicOutputs, proofData: proofData.proofData }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Máy chủ chưa xác minh được proof.");
      setResult(data.message || "Proof đã được xác minh cho phiên ví hiện tại.");
      setStage("success");
    } catch (cause) {
      setError(safeMessage(cause)); setStage("error");
    }
  }

  return <section className="student-verify" aria-labelledby="student-verification-title">
    <div className="student-verify-intro">
      <span className="student-verify-stamp"><ShieldCheck size={15}/> LOCAL EMAIL PROOF · V2 PINNED</span>
      <h2 id="student-verification-title">Chứng minh email VNU.<br/><span>Giữ nguyên sự riêng tư.</span></h2>
      <p>Email .eml chỉ được đọc trong tab này. UniPass gửi lên máy chủ public signals và proof, không gửi email gốc.</p>
    </div>

    {!wallet ? <div className="notice warning"><WalletCards size={17}/> Kết nối và đăng nhập ví Fuji ở thanh điều hướng trước khi tạo challenge.</div> : <>
      <ol className="student-verify-steps">
        <li className={challenge ? "is-done" : "is-current"}><b>01</b><span>Tạo challenge gắn với phiên ví này</span></li>
        <li className={stage === "ready" ? "is-current" : ""}><b>02</b><span>Gửi email VNU đến chính bạn</span></li>
        <li className={busy && stage !== "issuing" && stage !== "ready" ? "is-current" : ""}><b>03</b><span>Kiểm tra và xác minh proof</span></li>
      </ol>
      <div className="student-verify-actions">
        <button className="button button-dark" type="button" disabled={busy} onClick={issueChallenge}>{stage === "issuing" ? <><LoaderCircle className="spin" size={16}/> Đang tạo…</> : challenge && !expired ? "Tạo challenge mới" : "Tạo challenge email"}</button>
        {challenge && <span className={expired ? "challenge-expiry expired" : "challenge-expiry"}>{expired ? "Challenge đã hết hạn" : `Hết hạn ${new Date(challenge.expiresAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}`}</span>}
      </div>

      {challenge && !expired && <div className="student-challenge-card">
        <p className="eyebrow">GỬI TỪ EMAIL VNU ĐẾN CHÍNH ĐỊA CHỈ ĐÓ</p>
        <div className="student-template-row"><b>Tiêu đề</b><code>{challenge.subject}</code><button type="button" aria-label="Sao chép tiêu đề" onClick={() => void copyText(challenge.subject)}><Copy size={15}/></button></div>
        <div className="student-template-body"><div className="student-template-row"><b>Nội dung</b><button type="button" aria-label="Sao chép nội dung" onClick={() => void copyText(challenge.body)}><Copy size={15}/></button></div><pre>{challenge.body}</pre></div>
        <p className="seed-note">Gửi thư, mở thư đã nhận trong Gmail → “Show original” → kiểm tra DKIM=PASS → tải original `.eml`. Không dùng file tải xuống dạng `.txt` hoặc bản forward.</p>
      </div>}

      <label className="student-file-picker"><Upload size={18}/><span><b>{file?.name || "Chọn email gốc (.eml)"}</b><small>{file ? `${(file.size / 1024).toFixed(1)} KB · chỉ đọc trong trình duyệt` : "Tối đa 2 MB · email không được tải lên"}</small></span><input type="file" accept=".eml,message/rfc822" disabled={!challenge || expired || busy} onChange={event => { setFile(event.target.files?.[0] ?? null); setError(""); setResult(""); setStage("ready"); }}/></label>
      <button className="button button-dark student-proof-button" type="button" disabled={!file || !challenge || expired || busy} onClick={() => void verifyEmail()}>{busy ? <><LoaderCircle className="spin" size={16}/> {stageLabels[stage]}…</> : "Tạo proof cục bộ & xác minh"}</button>

      <div className="student-progress" aria-live="polite"><span className={`student-progress-dot ${stage === "success" ? "success" : stage === "error" ? "error" : busy ? "working" : ""}`}/><span>{stageLabels[stage]}</span></div>
      {error && <div className="notice warning student-feedback" role="alert">{error}</div>}
      {result && <div className="notice student-feedback" role="status">{result}</div>}
      {copied && <span className="sr-only" role="status">Đã sao chép.</span>}
    </>}

    <div className="notice warning student-eligibility-note"><b>Giới hạn bảo mật:</b> chỉ khi proof được xác minh, UniPass mới biết circuit v2 chấp nhận DKIM/domain/challenge. Challenge gắn với phiên ví ở máy chủ, không nằm trong circuit; gửi thư cho chính mình chưa chứng minh riêng người tải file kiểm soát mailbox. Tính năng này chưa xác nhận tư cách sinh viên và chưa được hợp đồng Fuji kiểm tra.</div>
  </section>;
}

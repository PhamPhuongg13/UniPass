"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Log, LogDescription } from "ethers";
import { contractsConfigured, eventManager, eventManagerInterface, getFujiSigner, verifyContractLink } from "@/lib/contracts/chain";

export function EventDraftForm() {
  const router = useRouter();
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
    if (!Number.isFinite(start.getTime()) || start <= new Date()) errors.startsAt = "Chọn thời gian bắt đầu trong tương lai (giờ Việt Nam).";
    if (!Number.isFinite(end.getTime()) || end <= start) errors.endsAt = "Thời gian kết thúc phải sau lúc bắt đầu.";
    if (!Number.isFinite(limit.getTime()) || limit <= new Date() || limit >= start) errors.deadline = "Hạn đăng ký phải trong tương lai và trước lúc bắt đầu.";
    if (!Number.isInteger(Number(capacity)) || Number(capacity) < 1 || Number(capacity) > 100000) errors.capacity = "Sức chứa phải từ 1 đến 100.000.";
    if (Object.keys(errors).length) { setFieldErrors(errors); setError("Kiểm tra lại các trường được đánh dấu."); return; }
    setBusy(true);
    let metadataEventId = "";
    const payload = {
      title: String(form.get("title") || ""), description: String(form.get("description") || ""),
      category: String(form.get("category") || "community"),
      startsAt: start.toISOString(), endsAt: end.toISOString(),
      location: String(form.get("location") || ""), isOnline: form.get("isOnline") === "on", timezone: "Asia/Ho_Chi_Minh",
      metadataCapacity: Number(capacity), registrationDeadline: limit.toISOString(), ...(coverUrl ? { coverUrl } : {}),
      visibility: "UNLISTED",
    };
    try {
      if (!contractsConfigured()) throw new Error("Thiếu địa chỉ contract. Kiểm tra .env và khởi động lại ứng dụng.");
      const connected = await getFujiSigner();
      const sessionResponse = await fetch("/api/auth/session", { cache: "no-store" });
      const session = await sessionResponse.json();
      if (!session.wallet || session.wallet.toLowerCase() !== connected.address.toLowerCase()) throw new Error("Hãy đăng nhập bằng chính ví sẽ tạo giao dịch on-chain.");
      await verifyContractLink(connected.signer);
      const response = await fetch("/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Không thể lưu sự kiện.");
      metadataEventId = result.event.id;
      const eventUrl = `/organizer/events/${metadataEventId}`;
      setSavedEventUrl(eventUrl);
      const manager = eventManager(connected.signer);
      const tx = await manager.createEvent(Number(capacity), BigInt(Math.floor(limit.getTime() / 1000)));
      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) throw new Error("Giao dịch tạo sự kiện chưa được xác nhận.");
      const created = receipt.logs.map((log: Log) => {
        try { return eventManagerInterface.parseLog({ topics: [...log.topics], data: log.data }); } catch { return null; }
      }).find((log: LogDescription | null) => log?.name === "EventCreated");
      if (!created) throw new Error(`Đã có giao dịch ${tx.hash} nhưng chưa đọc được eventId từ receipt.`);
      const syncResponse = await fetch(`/api/events/${metadataEventId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chainEventId: String(created.args.eventId), chainTx: tx.hash, syncStatus: "SYNCED", visibility: "PUBLIC" }) });
      if (!syncResponse.ok) throw new Error(`Event đã tạo trên chain (${tx.hash}), nhưng chưa đồng bộ được mã event vào UniPass. Mở trang quản lý để kiểm tra.`);
      router.push(eventUrl);
      router.refresh();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Không thể lưu sự kiện.";
      setError(metadataEventId ? `Metadata đã lưu. ${message}` : message);
    }
    finally { setBusy(false); }
  }
  return <form action={submit} className="tool-panel"><div className="form-grid">
    <label className="field full">Tên sự kiện<input name="title" required minLength={3} maxLength={140} placeholder="Ví dụ: Build Night — Cùng làm một dự án"/></label>
    <label className="field">Chủ đề<select name="category" defaultValue="community"><option value="community">Cộng đồng</option><option value="tech">Công nghệ & hackathon</option><option value="workshop">Workshop</option><option value="career">Nghề nghiệp</option><option value="club">Câu lạc bộ</option></select></label>
    <label className="field">Bắt đầu · giờ Việt Nam<input name="startsAt" type="datetime-local" required aria-invalid={!!fieldErrors.startsAt}/>{fieldErrors.startsAt&&<small className="field-error">{fieldErrors.startsAt}</small>}</label><label className="field">Kết thúc · giờ Việt Nam<input name="endsAt" type="datetime-local" required aria-invalid={!!fieldErrors.endsAt}/>{fieldErrors.endsAt&&<small className="field-error">{fieldErrors.endsAt}</small>}</label>
    <label className="field">Địa điểm<input name="location" required minLength={2} maxLength={300} placeholder="Tên địa điểm hoặc Online"/></label>
    <label className="field">Sức chứa<input name="capacity" type="number" min="1" max="100000" placeholder="120" required aria-invalid={!!fieldErrors.capacity}/>{fieldErrors.capacity&&<small className="field-error">{fieldErrors.capacity}</small>}</label>
    <label className="field">Hạn đăng ký · giờ Việt Nam<input name="deadline" type="datetime-local" aria-invalid={!!fieldErrors.deadline}/>{fieldErrors.deadline&&<small className="field-error">{fieldErrors.deadline}</small>}</label>
    <label className="field">Ảnh bìa URL<input name="coverUrl" type="url" placeholder="https://…"/></label>
    <label className="field full">Mô tả<textarea name="description" required minLength={10} maxLength={10000} placeholder="Người tham dự sẽ trải nghiệm điều gì?"/></label>
    <label className="field full" style={{display:"flex",alignItems:"center",gap:9}}><input name="isOnline" type="checkbox"/> Sự kiện online</label>
  </div><div className="notice warning">Tạo sự kiện sẽ lưu thông tin trên UniPass và gửi giao dịch createEvent lên Fuji. Sức chứa là bắt buộc; hạn mặc định trước giờ bắt đầu 1 tiếng. Dữ liệu sinh viên chưa được xác minh bằng zkEmail.</div>{error&&<div className="notice warning" role="alert">{error}{savedEventUrl&&<> <Link className="text-link" href={savedEventUrl}>Mở trang quản lý sự kiện</Link></>}</div>}<button className="button button-dark" type="submit" disabled={busy}>{busy?"Đang tạo sự kiện…":"Tạo sự kiện"}</button></form>;
}

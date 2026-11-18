"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function EventDraftForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(form: FormData) {
    setBusy(true); setError("");
    const capacity = String(form.get("capacity") || "");
    const deadline = String(form.get("deadline") || "");
    const coverUrl = String(form.get("coverUrl") || "");
    const payload = {
      title: String(form.get("title") || ""), description: String(form.get("description") || ""),
      startsAt: new Date(String(form.get("startsAt"))).toISOString(), endsAt: new Date(String(form.get("endsAt"))).toISOString(),
      location: String(form.get("location") || ""), isOnline: form.get("isOnline") === "on", timezone: "Asia/Ho_Chi_Minh",
      ...(capacity ? { metadataCapacity: Number(capacity) } : {}), ...(deadline ? { registrationDeadline: new Date(deadline).toISOString() } : {}), ...(coverUrl ? { coverUrl } : {}),
    };
    try {
      const response = await fetch("/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Không thể lưu sự kiện.");
      router.push(`/organizer/events/${result.event.id}`);
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể lưu sự kiện."); }
    finally { setBusy(false); }
  }
  return <form action={submit} className="tool-panel"><div className="form-grid">
    <label className="field full">Tên sự kiện<input name="title" required minLength={3} maxLength={140} placeholder="Ví dụ: Build Night — Cùng làm một dự án"/></label>
    <label className="field">Bắt đầu · giờ Việt Nam<input name="startsAt" type="datetime-local" required/></label><label className="field">Kết thúc · giờ Việt Nam<input name="endsAt" type="datetime-local" required/></label>
    <label className="field">Địa điểm<input name="location" required minLength={2} maxLength={300} placeholder="Tên địa điểm hoặc Online"/></label>
    <label className="field">Sức chứa · metadata<input name="capacity" type="number" min="1" max="100000" placeholder="120"/></label>
    <label className="field">Hạn đăng ký<input name="deadline" type="datetime-local"/></label>
    <label className="field">Ảnh bìa URL<input name="coverUrl" type="url" placeholder="https://…"/></label>
    <label className="field full">Mô tả<textarea name="description" required minLength={10} maxLength={10000} placeholder="Người tham dự sẽ trải nghiệm điều gì?"/></label>
    <label className="field full" style={{display:"flex",alignItems:"center",gap:9}}><input name="isOnline" type="checkbox"/> Sự kiện online</label>
  </div><div className="notice warning">Lưu metadata yêu cầu đăng nhập bằng ví tổ chức. Đây chưa tạo event on-chain hoặc đăng ký vé.</div>{error&&<div className="notice warning" role="alert">{error}</div>}<button className="button button-dark" type="submit" disabled={busy}>{busy?"Đang lưu…":"Lưu metadata sự kiện"}</button></form>;
}

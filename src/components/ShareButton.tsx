"use client";
import { useState } from "react";
import { Share2 } from "lucide-react";

export function ShareButton() {
  const [message, setMessage] = useState("");
  async function share() {
    try {
      if (navigator.share) await navigator.share({ url: location.href, title: document.title });
      else { await navigator.clipboard.writeText(location.href); setMessage("Đã sao chép liên kết"); }
    } catch { setMessage("Không thể chia sẻ. Hãy sao chép địa chỉ trên thanh trình duyệt."); }
  }
  return <><button type="button" className="button button-light" onClick={share}><Share2 size={16}/> Chia sẻ</button>{message&&<span role="status" className="share-status">{message}</span>}</>;
}

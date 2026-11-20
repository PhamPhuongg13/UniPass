"use client";
import { useState } from "react";
import { Share2 } from "lucide-react";

export function ShareButton() {
  const [message, setMessage] = useState("");
  async function share() {
    try {
      if (navigator.share) await navigator.share({ url: location.href, title: document.title });
      else { await navigator.clipboard.writeText(location.href); setMessage("Link copied"); }
    } catch { setMessage("Could not share. Copy the URL from your browser."); }
  }
  return <><button type="button" className="button button-light" onClick={share}><Share2 size={16}/> Share</button>{message&&<span role="status" className="share-status">{message}</span>}</>;
}

"use client";
import { useState } from "react";
export function CopyCode({ code }: { code: string }) {
  const [copied,setCopied] = useState(false);
  return <div className="code-wrap"><button type="button" onClick={async()=>{await navigator.clipboard.writeText(code);setCopied(true);setTimeout(()=>setCopied(false),2000)}}>{copied?"Copied":"Copy"}</button><pre><code>{code}</code></pre></div>;
}

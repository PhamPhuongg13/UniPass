"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu, WalletCards, X } from "lucide-react";
import { connectWallet, switchToFuji } from "@/lib/web3/client";

export function SiteHeader() {
  const [wallet, setWallet] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    fetch("/api/auth/session", { cache: "no-store" }).then(r=>r.ok?r.json():null).then(data=>setWallet(data?.wallet||null)).catch(()=>{});
    const ethereum = (globalThis as typeof globalThis & { ethereum?: { on?: (event: string, listener: (...args: unknown[]) => void) => void; removeListener?: (event: string, listener: (...args: unknown[]) => void) => void } }).ethereum;
    if (!ethereum?.on) return;
    const resetWallet = () => { setWallet(null); setAccountOpen(false); void fetch("/api/auth/session", { method: "DELETE" }).catch(()=>{}); router.refresh(); };
    ethereum.on("accountsChanged", resetWallet);
    ethereum.on("chainChanged", resetWallet);
    return () => { ethereum.removeListener?.("accountsChanged", resetWallet); ethereum.removeListener?.("chainChanged", resetWallet); };
  }, [router]);

  async function signIn() {
    setError(""); setBusy(true);
    try {
      const connected = await connectWallet();
      if (connected.chainId !== 43113) {
        await switchToFuji(connected.provider);
        if (Number(await connected.provider.send("eth_chainId", [])) !== 43113) throw new Error("Hãy chuyển ví sang Avalanche Fuji.");
      }
      const response = await fetch("/api/auth/challenge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address: connected.address }) });
      const challenge = await response.json();
      if (!response.ok) throw new Error(challenge.error || "Không thể tạo yêu cầu đăng nhập.");
      const signature = await (await connected.provider.getSigner()).signMessage(challenge.message);
      const verifiedResponse = await fetch("/api/auth/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: challenge.message, signature }) });
      const verified = await verifiedResponse.json();
      if (!verifiedResponse.ok) throw new Error(verified.error || "Không thể xác thực ví.");
      setWallet(verified.wallet);
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể kết nối ví."); }
    finally { setBusy(false); }
  }
  async function signOut() { await fetch("/api/auth/session", { method: "DELETE" }).catch(()=>{}); setWallet(null); setAccountOpen(false); router.refresh(); }
  return <header className="topbar"><Link href="/" className="brand"><span className="brand-mark">u.</span><span>uni<span className="brand-heavy">pass</span></span><span className="brand-sticker">VNU EDITION</span></Link><nav className="main-nav"><Link className={pathname==="/discover"?"nav-active":""} href="/discover">Khám phá</Link><Link className={pathname==="/my-events"?"nav-active":""} href="/my-events">Vé của tôi</Link><Link className={pathname.startsWith("/organizer")?"nav-active":""} href="/organizer">Ban tổ chức</Link></nav><div className="nav-actions"><button className="wallet-button" onClick={wallet?()=>setAccountOpen(!accountOpen):signIn} disabled={busy} aria-expanded={wallet?accountOpen:undefined} aria-haspopup={wallet?"menu":undefined} title={error||undefined}><WalletCards size={16}/>{busy?"Đang xác thực…":wallet?`${wallet.slice(0,6)}…${wallet.slice(-4)}`:"Kết nối ví"}</button>{wallet&&accountOpen&&<div className="account-menu" role="menu"><span className="account-address">{wallet}</span><Link role="menuitem" href="/profile" onClick={()=>setAccountOpen(false)}>Hồ sơ ví</Link><button role="menuitem" onClick={signOut}>Ngắt kết nối</button></div>}<button className="mobile-menu" aria-label={menuOpen?"Đóng menu":"Mở menu"} aria-expanded={menuOpen} onClick={()=>setMenuOpen(!menuOpen)}>{menuOpen?<X/>:<Menu/>}</button></div>{menuOpen&&<nav className="mobile-nav"><Link href="/discover" onClick={()=>setMenuOpen(false)}>Khám phá</Link><Link href="/my-events" onClick={()=>setMenuOpen(false)}>Vé của tôi</Link><Link href="/organizer" onClick={()=>setMenuOpen(false)}>Ban tổ chức</Link></nav>}{error&&<p className="wallet-error" role="status">{error}</p>}</header>;
}

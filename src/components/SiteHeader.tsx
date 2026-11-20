"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, WalletCards, X } from "lucide-react";
import { useUniPassWallet } from "@/components/WalletProvider";
import { APP_ID_STATE } from "@/lib/privy/app-id";

export function SiteHeader() {
  const { address, authenticated, login, logout, ready } = useUniPassWallet();
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [error, setError] = useState("");
  const pathname = usePathname();
  const signedIn = authenticated && Boolean(address);
  const short = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "";
  async function copyAddress() { if (!address) return; try { await navigator.clipboard.writeText(address); setAccountOpen(false); } catch { setError("Could not copy wallet address."); } }
  return <header className="topbar">
    <Link href="/" className="brand"><span className="brand-mark">u.</span><span>uni<span className="brand-heavy">pass</span></span></Link>
    <nav className="main-nav">{[["Events","/discover"],["Polls","/polls"],["Giveaways","/giveaways"],["Scholarships","/scholarships"],["Discounts","/discounts"],["Developers","/developers"]].map(([label,href])=><Link key={href} className={pathname === href || pathname.startsWith(`${href}/`) ? "nav-active" : ""} href={href}>{label}</Link>)}</nav>
    <div className="nav-actions"><button className="wallet-button" onClick={signedIn ? () => setAccountOpen(!accountOpen) : login} disabled={APP_ID_STATE !== "ok" || (authenticated && !ready)} aria-expanded={signedIn ? accountOpen : undefined} aria-haspopup={signedIn ? "menu" : undefined}><WalletCards size={16}/>{signedIn ? short : "Sign in"}</button>
      {signedIn && accountOpen && <div className="account-menu" role="menu"><span className="account-address">{address}</span><button role="menuitem" onClick={() => void copyAddress()}>Copy wallet address</button><Link role="menuitem" href="/my-passport" onClick={() => setAccountOpen(false)}>My passport</Link><button role="menuitem" onClick={() => void logout()}>Sign out</button></div>}
      <button className="mobile-menu" aria-label={menuOpen ? "Close menu" : "Open menu"} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X/> : <Menu/>}</button></div>
    {menuOpen && <nav className="mobile-nav">{[["Events","/discover"],["Polls","/polls"],["Giveaways","/giveaways"],["Scholarships","/scholarships"],["Discounts","/discounts"],["Developers","/developers"],["My passport","/my-passport"]].map(([label,href])=><Link key={href} href={href} onClick={() => setMenuOpen(false)}>{label}</Link>)}</nav>}
    {APP_ID_STATE !== "ok" && <p className="wallet-error" role="status">NEXT_PUBLIC_PRIVY_APP_ID is missing</p>}{error && <p className="wallet-error" role="status">{error}</p>}
  </header>;
}

"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { BrowserProvider, type JsonRpcSigner, type TransactionReceipt } from "ethers";
import { createReadOnlyFujiProvider } from "@/lib/contracts/chain";
import { useRouter } from "next/navigation";
import { APP_ID_STATE } from "@/lib/privy/app-id";

type WalletContext = { ready: boolean; authenticated: boolean; address: string | null; login: () => void; logout: () => Promise<void>; getSigner: () => Promise<{ signer: JsonRpcSigner; address: string; provider: BrowserProvider }>; ensureGas: () => Promise<void>; sendTx: (request: { to: string; data: string }) => Promise<string>; waitForReceipt: (hash: string) => Promise<TransactionReceipt>; getAccessToken: () => Promise<string | null> };
const Context = createContext<WalletContext | null>(null);

function ActiveWalletProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const privy = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  const wallet = wallets.find(item => item.walletClientType === "privy") ?? null;
  const address = privy.authenticated && wallet ? wallet.address.toLowerCase() : null;
  const [sessionWallet, setSessionWallet] = useState<string | null>(null);
  const sessionAttempt = useRef<string | null>(null);

  useEffect(() => {
    if (!privy.ready || !privy.authenticated || !address) { sessionAttempt.current = null; setSessionWallet(null); return; }
    if (sessionAttempt.current === address) return;
    sessionAttempt.current = address;
    void (async () => {
      const existing = await fetch("/api/auth/session", { cache: "no-store" }).then(response => response.json()).catch(() => ({}));
      if (existing.wallet?.toLowerCase() === address) { setSessionWallet(address); return; }
      const accessToken = await privy.getAccessToken();
      if (!accessToken) throw new Error("Privy access token unavailable.");
      const response = await fetch("/api/auth/privy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accessToken }) });
      if (!response.ok) throw new Error("UniPass session unavailable.");
      setSessionWallet(address);
      router.refresh();
    })().catch(() => { sessionAttempt.current = null; });
  }, [privy.ready, privy.authenticated, privy.getAccessToken, address, router]);

  const getSigner = useCallback(async () => {
    if (!wallet || !address) throw new Error("Sign in to UniPass first.");
    await wallet.switchChain(43113);
    const eip1193 = await wallet.getEthereumProvider();
    const provider = new BrowserProvider(eip1193);
    const signer = await provider.getSigner(address);
    const network = await provider.getNetwork();
    if (Number(network.chainId) !== 43113) throw new Error("Wallet must be on Avalanche Fuji.");
    return { signer, address, provider };
  }, [wallet, address]);

  // Send through the Privy embedded wallet but never wait on its provider: ethers' post-send
  // polling through Privy's EIP-1193 provider can hang even after the transaction is mined.
  const sendTx = useCallback(async (request: { to: string; data: string }) => {
    const { signer } = await getSigner();
    return signer.sendUncheckedTransaction(request);
  }, [getSigner]);

  const waitForReceipt = useCallback(async (hash: string) => {
    const reader = createReadOnlyFujiProvider();
    try {
      const receipt = await reader.waitForTransaction(hash, 1, 180_000);
      if (!receipt) throw new Error(`Transaction ${hash} is still pending on Fuji. Reload to check again.`);
      return receipt;
    } finally { reader.destroy(); }
  }, []);

  const ensureGas = useCallback(async () => {
    try {
      const response = await fetch("/api/wallet/gas", { method: "POST" });
      if (!response.ok) throw new Error("Gas drip unavailable.");
    } catch {
      const { provider } = await getSigner();
      if (await provider.getBalance(address!) === BigInt(0)) throw new Error("Wallet needs testnet AVAX to send the transaction.");
    }
  }, [getSigner, address]);

  const logout = useCallback(async () => {
    await fetch("/api/auth/session", { method: "DELETE" }).catch(() => {});
    await privy.logout();
    setSessionWallet(null);
    router.refresh();
  }, [privy, router]);

  return <Context.Provider value={{ ready: privy.ready && walletsReady && (address ? sessionWallet === address : true), authenticated: privy.authenticated, address, login: privy.login, logout, getSigner, ensureGas, sendTx, waitForReceipt, getAccessToken: privy.getAccessToken }}>{children}</Context.Provider>;
}

const unavailable: WalletContext = { ready: false, authenticated: false, address: null, login: () => {}, logout: async () => {}, getSigner: async () => { throw new Error("NEXT_PUBLIC_PRIVY_APP_ID is missing"); }, ensureGas: async () => {}, sendTx: async () => { throw new Error("NEXT_PUBLIC_PRIVY_APP_ID is missing"); }, waitForReceipt: async () => { throw new Error("NEXT_PUBLIC_PRIVY_APP_ID is missing"); }, getAccessToken: async () => null };
export function WalletProvider({ children }: { children: React.ReactNode }) {
  if (APP_ID_STATE !== "ok") return <Context.Provider value={unavailable}>{children}</Context.Provider>;
  return <ActiveWalletProvider>{children}</ActiveWalletProvider>;
}
export function useUniPassWallet() {
  const value = useContext(Context);
  if (!value) throw new Error("WalletProvider is missing.");
  return value;
}

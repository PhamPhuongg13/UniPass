"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { avalancheFuji } from "viem/chains";
import { APP_ID_STATE, PRIVY_APP_ID } from "@/lib/privy/app-id";
import { WalletProvider } from "@/components/WalletProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  if (APP_ID_STATE !== "ok") return <WalletProvider>{children}</WalletProvider>;
  return <PrivyProvider appId={PRIVY_APP_ID} config={{
    loginMethods: ["email", "google", "wallet"],
    defaultChain: avalancheFuji,
    supportedChains: [avalancheFuji],
    embeddedWallets: { ethereum: { createOnLogin: "all-users" } },
    appearance: { theme: "light", accentColor: "#fa58a0" },
  }}><WalletProvider>{children}</WalletProvider></PrivyProvider>;
}

import { BrowserProvider, JsonRpcProvider, type Eip1193Provider } from "ethers";

export const FUJI_CHAIN_ID = 43113;
export type WalletState = { status: "disconnected" | "connected" | "wrong-network" | "unavailable"; address?: string; chainId?: number; message: string };

export function getReadProvider() {
  const rpc = process.env.NEXT_PUBLIC_AVALANCHE_RPC_URL;
  return rpc ? new JsonRpcProvider(rpc, FUJI_CHAIN_ID) : null;
}

export async function connectWallet(): Promise<{ provider: BrowserProvider; address: string; chainId: number }> {
  const ethereum = (globalThis as typeof globalThis & { ethereum?: Eip1193Provider }).ethereum;
  if (!ethereum) throw new Error("MetaMask hoặc ví EIP-1193 chưa khả dụng.");
  const provider = new BrowserProvider(ethereum);
  const accounts = await provider.send("eth_requestAccounts", []) as string[];
  const network = await provider.getNetwork();
  return { provider, address: accounts[0], chainId: Number(network.chainId) };
}

export async function switchToFuji(provider: BrowserProvider) {
  try {
    await provider.send("wallet_switchEthereumChain", [{ chainId: "0xa869" }]);
  } catch (error) {
    const code = (error as { code?: number }).code;
    if (code !== 4902) throw error;
    await provider.send("wallet_addEthereumChain", [{
      chainId: "0xa869", chainName: "Avalanche Fuji C-Chain",
      nativeCurrency: { name: "AVAX", symbol: "AVAX", decimals: 18 },
      rpcUrls: [process.env.NEXT_PUBLIC_AVALANCHE_RPC_URL || "https://api.avax-test.network/ext/bc/C/rpc"],
      blockExplorerUrls: ["https://testnet.snowtrace.io/"],
    }]);
  }
}

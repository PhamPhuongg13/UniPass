import { JsonRpcProvider } from "ethers";

export const FUJI_CHAIN_ID = 43113;
export function getReadProvider() {
  const rpc = process.env.NEXT_PUBLIC_AVALANCHE_RPC_URL;
  return rpc ? new JsonRpcProvider(rpc, FUJI_CHAIN_ID) : null;
}

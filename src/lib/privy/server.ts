import "server-only";
import { PrivyClient } from "@privy-io/node";
import { PRIVY_APP_ID } from "./app-id";

let client: PrivyClient | null = null;
export function getPrivyServer() {
  const appSecret = process.env.PRIVY_APP_SECRET?.trim();
  if (!appSecret || !PRIVY_APP_ID) throw new Error("PRIVY_APP_SECRET or NEXT_PUBLIC_PRIVY_APP_ID is not configured.");
  return client ??= new PrivyClient({ appId: PRIVY_APP_ID, appSecret });
}

export async function getVerifiedPrivyUser(accessToken: string) {
  const privy = getPrivyServer();
  const token = await privy.utils().auth().verifyAccessToken(accessToken);
  const user = await privy.users()._get(token.user_id);
  if (user.id !== token.user_id) throw new Error("Privy user mismatch.");
  const embedded = user.linked_accounts.find(account => account.type === "wallet" && account.chain_type === "ethereum" && account.wallet_client_type === "privy" && "address" in account);
  if (!embedded || !("address" in embedded)) throw new Error("Privy embedded Ethereum wallet not found.");
  return { user, wallet: embedded.address.toLowerCase() };
}

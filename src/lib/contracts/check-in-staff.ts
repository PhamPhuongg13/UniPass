import { eventManager, createReadOnlyFujiProvider } from "@/lib/contracts/chain";

export async function canCheckInEvent(chainEventId: string, wallet: string, organizerWallet: string) {
  if (wallet.toLowerCase() === organizerWallet.toLowerCase()) return true;
  const provider = createReadOnlyFujiProvider();
  try { return Boolean(await eventManager(provider).getFunction("eventStaff")(BigInt(chainEventId), wallet)); }
  finally { provider.destroy(); }
}

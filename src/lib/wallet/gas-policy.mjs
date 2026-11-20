export function shouldDrip({ balanceWei, lastDripAt, dripsToday, now, config }) {
  if (BigInt(balanceWei) >= BigInt(config.minBalanceWei)) return { drip: false, reason: "enough" };
  if (lastDripAt && new Date(lastDripAt).getTime() > new Date(now).getTime() - 86_400_000) return { drip: false, reason: "wallet-limit" };
  if (dripsToday >= config.dailyCap) return { drip: false, reason: "daily-cap" };
  return { drip: true };
}

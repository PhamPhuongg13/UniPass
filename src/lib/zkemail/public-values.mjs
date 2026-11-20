export function parseZkEmailPublicValues(value) {
  const hex = value.startsWith("0x") ? value.slice(2) : value;
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length < 320 || hex.length % 2) throw new Error("Invalid public values length.");
  if (BigInt(`0x${hex.slice(0, 64)}`) !== 32n || BigInt(`0x${hex.slice(64, 128)}`) !== 64n) throw new Error("Invalid public values layout.");
  return { fromDomainHash: `0x${hex.slice(192, 256).toLowerCase()}`, publicKeyHash: `0x${hex.slice(256, 320).toLowerCase()}` };
}

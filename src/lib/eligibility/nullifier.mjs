import { createHmac } from "node:crypto";

export function normalizeStudentEmail(address) {
  if (typeof address !== "string") throw new TypeError("Invalid email address.");
  const normalized = address.trim().toLowerCase();
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(normalized) || normalized.includes("..") || normalized.split("@")[1].split(".").some(label => !label || label.startsWith("-") || label.endsWith("-"))) throw new TypeError("Invalid email address.");
  return normalized;
}

function keyBytes(secret) {
  if (Buffer.isBuffer(secret)) return secret;
  if (typeof secret !== "string") throw new TypeError("Invalid nullifier secret.");
  if (/^(?:0x)?[0-9a-fA-F]{64,}$/.test(secret) && secret.replace(/^0x/, "").length % 2 === 0) return Buffer.from(secret.replace(/^0x/, ""), "hex");
  if (/^[A-Za-z0-9_-]+={0,2}$/.test(secret)) return Buffer.from(secret, "base64url");
  throw new TypeError("Invalid nullifier secret.");
}

export function getNullifierSecret() {
  const secret = keyBytes(process.env.EMAIL_NULLIFIER_SECRET);
  if (secret.length < 32) throw new Error("EMAIL_NULLIFIER_SECRET must contain at least 32 bytes.");
  return secret;
}

export function deriveEmailNullifier(secret, normalizedEmail) {
  if (normalizeStudentEmail(normalizedEmail) !== normalizedEmail) throw new TypeError("Email must be normalized.");
  return `0x${createHmac("sha256", keyBytes(secret)).update(`unipass:email-nullifier:v1\n${normalizedEmail}`).digest("hex")}`;
}

export function deriveWalletNullifier(secret, wallet) {
  if (typeof wallet !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(wallet)) throw new TypeError("Invalid wallet address.");
  return `0x${createHmac("sha256", keyBytes(secret)).update(`unipass:wallet-nullifier:v1\n${wallet.toLowerCase()}`).digest("hex")}`;
}

export function deriveEventNullifier(secret, emailNullifier, { chainId, manager, eventId }) {
  if (typeof emailNullifier !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(emailNullifier)) throw new TypeError("Invalid email nullifier.");
  if (!Number.isSafeInteger(Number(chainId)) || Number(chainId) <= 0 || !/^0x[0-9a-fA-F]{40}$/.test(manager) || !/^\d+$/.test(String(eventId)) || BigInt(eventId) <= 0n) throw new TypeError("Invalid event identity.");
  const value = `unipass:event-nullifier:v1\n${chainId}\n${manager.toLowerCase()}\n${eventId}\n${emailNullifier.toLowerCase()}`;
  return `0x${createHmac("sha256", keyBytes(secret)).update(value).digest("hex")}`;
}

export function derivePollNullifier(secret, baseNullifier, { chainId, contract, pollId }) {
  if (typeof baseNullifier !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(baseNullifier)) throw new TypeError("Invalid base nullifier.");
  if (!Number.isSafeInteger(Number(chainId)) || Number(chainId) <= 0 || !/^0x[0-9a-fA-F]{40}$/.test(contract) || !/^\d+$/.test(String(pollId)) || BigInt(pollId) <= 0n) throw new TypeError("Invalid poll identity.");
  return `0x${createHmac("sha256", keyBytes(secret)).update(`unipass:poll-nullifier:v1\n${chainId}\n${contract.toLowerCase()}\n${pollId}\n${baseNullifier.toLowerCase()}`).digest("hex")}`;
}

export function deriveProgramNullifier(secret, baseNullifier, { chainId, contract, programId }) {
  if (typeof baseNullifier !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(baseNullifier)) throw new TypeError("Invalid base nullifier.");
  if (!Number.isSafeInteger(Number(chainId)) || Number(chainId) <= 0 || !/^0x[0-9a-fA-F]{40}$/.test(contract) || !/^\d+$/.test(String(programId)) || BigInt(programId) <= 0n) throw new TypeError("Invalid program identity.");
  return `0x${createHmac("sha256", keyBytes(secret)).update(`unipass:program-nullifier:v1\n${chainId}\n${contract.toLowerCase()}\n${programId}\n${baseNullifier.toLowerCase()}`).digest("hex")}`;
}

export function deriveZkEmailNullifier(secret, senderHash) {
  if (typeof senderHash !== "string" || !/^0x[0-9a-fA-F]{1,64}$/.test(senderHash) || BigInt(senderHash) === 0n) throw new TypeError("Invalid sender hash.");
  return `0x${createHmac("sha256", keyBytes(secret)).update(`zk:0x${BigInt(senderHash).toString(16)}`).digest("hex")}`;
}

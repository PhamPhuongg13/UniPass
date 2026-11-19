import { createHash, randomBytes } from "node:crypto";

export const TICKET_CHECK_IN_TTL_MS = 2 * 60_000;
const CREDENTIAL_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function createTicketCheckInCredential() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashTicketCheckInCredential(token) };
}

export function hashTicketCheckInCredential(token) {
  if (typeof token !== "string" || !CREDENTIAL_PATTERN.test(token)) throw new TypeError("Invalid ticket check-in credential.");
  return createHash("sha256").update(token).digest("hex");
}

export function readTicketCheckInCredential(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/^unipass:\/\/check-in\//i, "");
  return CREDENTIAL_PATTERN.test(normalized) ? normalized : null;
}

export function createTicketCheckInQrPayload(token) {
  if (typeof token !== "string" || !CREDENTIAL_PATTERN.test(token)) throw new TypeError("Invalid ticket check-in credential.");
  return `unipass://check-in/${token}`;
}

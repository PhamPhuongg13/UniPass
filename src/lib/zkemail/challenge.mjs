import { createHash, randomBytes } from "node:crypto";

export const STUDENT_EMAIL_CHAIN_ID = 43113;
export const STUDENT_EMAIL_PURPOSE = "unipass-student-email-control";
export const STUDENT_EMAIL_CHALLENGE_TTL_MS = 10 * 60_000;

export function createEmailChallenge() {
  const nonce = randomBytes(32).toString("base64url");
  return { nonce, nonceHash: hashEmailChallenge(nonce) };
}

export function hashEmailChallenge(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function isEmailChallenge(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}

export function createChallengeEmailBody(nonce) {
  if (!isEmailChallenge(nonce)) throw new TypeError("Challenge must be a 43-character base64url nonce.");
  return `UniPass email verification\r\n\r\nUNIPASS-CHALLENGE:${nonce}\r\n`;
}

export function isRetryableRegistryError(error) {
  const message = String(error?.message ?? error);
  return /HTTP error! status: (429|500|502|503|504)\b/.test(message)
    || /fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ECONNREFUSED/i.test(message);
}

/**
 * @typedef {{maxAttempts?: number, baseDelayMs?: number, maxDelayMs?: number, retryable?: (error: unknown) => boolean, sleep?: (ms: number) => Promise<unknown>, onRetry?: (event: {attempt: number, delayMs: number, error: unknown}) => void}} RetryOptions
 */
/** @param {(attempt: number) => Promise<any>} operation @param {RetryOptions} [options] */
export async function retryWithBackoff(operation, {
  maxAttempts = 3,
  baseDelayMs = 250,
  maxDelayMs = 1_000,
  retryable = isRetryableRegistryError,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  onRetry = () => {},
} = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await operation(attempt);
    } catch (error) {
      if (attempt >= maxAttempts || !retryable(error)) throw error;
      const delayMs = Math.min(maxDelayMs, baseDelayMs * (2 ** (attempt - 1)));
      onRetry({ attempt, delayMs, error });
      await sleep(delayMs);
    }
  }
}

import test from "node:test";
import assert from "node:assert/strict";
import { decodeNoirPublicSignals, decodePublicSignals } from "../../src/lib/zkemail/public-signals.mjs";
import {
  createChallengeEmailBody,
  createEmailChallenge,
  hashEmailChallenge,
  isEmailChallenge,
  isRetryableRegistryError,
  retryWithBackoff,
  STUDENT_EMAIL_CHAIN_ID,
  STUDENT_EMAIL_CHALLENGE_TTL_MS,
  STUDENT_EMAIL_PURPOSE,
} from "../../src/lib/zkemail/challenge.mjs";

test("email challenges are fresh 32-byte base64url nonces with hashed storage", () => {
  const first = createEmailChallenge();
  const second = createEmailChallenge();
  assert.match(first.nonce, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(Buffer.from(first.nonce, "base64url").byteLength, 32);
  assert.equal(isEmailChallenge(first.nonce), true);
  assert.notEqual(first.nonce, second.nonce);
  assert.equal(first.nonceHash, hashEmailChallenge(first.nonce));
  assert.notEqual(first.nonceHash, first.nonce);
  assert.equal(isEmailChallenge("A".repeat(42)), false);
  assert.equal(isEmailChallenge("A".repeat(44)), false);
});

test("challenge email template binds the nonce into a single body line", () => {
  assert.equal(
    createChallengeEmailBody("A".repeat(43)),
    `UniPass email verification\r\n\r\nUNIPASS-CHALLENGE:${"A".repeat(43)}\r\n`,
  );
  assert.throws(() => createChallengeEmailBody("bad"), TypeError);
  assert.equal(STUDENT_EMAIL_CHAIN_ID, 43113);
  assert.equal(STUDENT_EMAIL_PURPOSE, "unipass-student-email-control");
  assert.equal(STUDENT_EMAIL_CHALLENGE_TTL_MS, 10 * 60_000);
});

test("Registry retry is bounded with exponential delays and only retries transient failures", async () => {
  const delays = [];
  let calls = 0;
  await assert.rejects(retryWithBackoff(async () => {
    calls++;
    throw new Error("HTTP error! status: 502");
  }, { maxAttempts: 3, baseDelayMs: 100, sleep: async ms => delays.push(ms) }));
  assert.equal(calls, 3);
  assert.deepEqual(delays, [100, 200]);
  assert.equal(isRetryableRegistryError(new Error("HTTP error! status: 502")), true);
  assert.equal(isRetryableRegistryError(new Error("HTTP error! status: 404")), false);

  calls = 0;
  await assert.rejects(retryWithBackoff(async () => {
    calls++;
    throw new Error("HTTP error! status: 404");
  }, { maxAttempts: 3, sleep: async () => {} }));
  assert.equal(calls, 1);
});

test("verified Circom public signals decode exact domain and challenge outputs", () => {
  const encodeChunk = value => {
    const reversed = Buffer.from(value, "utf8").reverse();
    return reversed.length ? BigInt(`0x${reversed.toString("hex")}`).toString() : "0";
  };
  const encodeValue = (value, maxLength) => {
    const chunks = [];
    for (let index = 0; index < maxLength; index += 31) chunks.push(encodeChunk(value.slice(index, index + 31)));
    return chunks;
  };
  const regexes = [
    { name: "sender_domain", maxLength: 64, parts: [{ isPublic: false }, { isPublic: true }, { isPublic: false }] },
    { name: "challenge", maxLength: 96, parts: [{ isPublic: false }, { isPublic: true }, { isPublic: false }] },
  ];
  const nonce = "OE4SYFfV3TSF9rsN-d7pCZAc4BlDmF6DAXsmpKxOxew";
  const signals = ["1", "2", "3", ...encodeValue("vnu.edu.vn", 64), ...encodeValue(nonce, 96)];
  assert.deepEqual(decodePublicSignals(signals, regexes), { sender_domain: ["vnu.edu.vn"], challenge: [nonce] });
  assert.throws(() => decodePublicSignals(signals.slice(0, -1), regexes), /Incomplete public signals/);
  assert.throws(() => decodePublicSignals([...signals, "0"], regexes), /Unexpected extra public signals/);
  assert.throws(() => decodePublicSignals(["not-a-field"], regexes), /decimal field strings/);
});

test("Noir public outputs decode using the pinned SDK byte and length layout", () => {
  const nonce = "OE4SYFfV3TSF9rsN-d7pCZAc4BlDmF6DAXsmpKxOxew";
  const signals = ["0x0", "0x0", "0x0", "0x0"];
  for (const [value, maxLength] of [["vnu.edu.vn", 10], [nonce, 43]]) {
    for (const char of value) signals.push(`0x${char.charCodeAt(0).toString(16)}`);
    while (signals.length < (value === nonce ? 4 + 10 + 1 + maxLength : 4 + maxLength)) signals.push("0x0");
    signals.push(`0x${value.length.toString(16)}`);
  }
  const regexes = [
    { name: "sender_domain", maxLength: 10, parts: [{ isPublic: true }] },
    { name: "challenge", maxLength: 43, parts: [{ isPublic: true }] },
  ];
  assert.deepEqual(decodeNoirPublicSignals(signals, regexes), { sender_domain: ["vnu.edu.vn"], challenge: [nonce] });
  const changedChallenge = [...signals];
  changedChallenge[15] = "0x58";
  const wrongNonceOutput = decodeNoirPublicSignals(changedChallenge, regexes).challenge[0];
  assert.notEqual(wrongNonceOutput, nonce);
  assert.equal(wrongNonceOutput.length, nonce.length);
  const changedDomain = [...signals];
  changedDomain[4] = "0x78";
  assert.notEqual(decodeNoirPublicSignals(changedDomain, regexes).sender_domain[0], "vnu.edu.vn");
  const shortChallenge = [...signals];
  shortChallenge[15 + nonce.length - 1] = "0x0";
  shortChallenge[15 + nonce.length] = "0x2a";
  assert.equal(decodeNoirPublicSignals(shortChallenge, regexes).challenge[0].length, 42);
  assert.throws(() => decodeNoirPublicSignals([...signals, "0x0"], regexes), /Unexpected extra Noir public signals/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { normalizeStudentEmail, deriveEmailNullifier, deriveEventNullifier, deriveWalletNullifier, getNullifierSecret } from "../../src/lib/eligibility/nullifier.mjs";

const secret = Buffer.alloc(32, 7);
const email = normalizeStudentEmail("  Student@VNU.edu.vn  ");
const event = { chainId: 43113, manager: "0x1000000000000000000000000000000000000001", eventId: "1" };
test("email normalization and deterministic nullifiers", () => {
  assert.equal(email, "student@vnu.edu.vn");
  const first = deriveEmailNullifier(secret, email);
  assert.match(first, /^0x[0-9a-f]{64}$/);
  assert.equal(first, deriveEmailNullifier(secret, email));
  assert.notEqual(first, deriveEmailNullifier(Buffer.alloc(32, 8), email));
  const scoped = deriveEventNullifier(secret, first, event);
  assert.equal(scoped, deriveEventNullifier(secret, first, event));
  assert.notEqual(scoped, deriveEventNullifier(secret, first, { ...event, eventId: "2" }));
  assert.notEqual(scoped, deriveEventNullifier(Buffer.alloc(32, 8), first, event));
});
test("invalid emails, event identities and secrets fail closed", () => {
  for (const address of ["a@@vnu.edu.vn", "a@", "a b@vnu.edu.vn", "a@vnu.edu.vn,b@vnu.edu.vn", "a..b@vnu.edu.vn"]) assert.throws(() => normalizeStudentEmail(address));
  assert.throws(() => deriveEmailNullifier(secret, " Student@VNU.edu.vn "));
  assert.throws(() => deriveEventNullifier(secret, "bad", event));
  assert.throws(() => deriveEventNullifier(secret, `0x${"ab".repeat(32)}`, { ...event, eventId: "0" }));
  const prior = process.env.EMAIL_NULLIFIER_SECRET;
  try {
    process.env.EMAIL_NULLIFIER_SECRET = secret.toString("base64url");
    assert.equal(getNullifierSecret().toString("hex"), secret.toString("hex"));
    process.env.EMAIL_NULLIFIER_SECRET = secret.toString("hex");
    assert.equal(getNullifierSecret().toString("hex"), secret.toString("hex"));
    process.env.EMAIL_NULLIFIER_SECRET = "short";
    assert.throws(() => getNullifierSecret());
  } finally { if (prior === undefined) delete process.env.EMAIL_NULLIFIER_SECRET; else process.env.EMAIL_NULLIFIER_SECRET = prior; }
});

test("wallet nullifier is deterministic and wallet-scoped", () => {
  const wallet = "0x1000000000000000000000000000000000000001";
  const first = deriveWalletNullifier(secret, wallet);
  assert.match(first, /^0x[0-9a-f]{64}$/);
  assert.equal(first, deriveWalletNullifier(secret, wallet.toUpperCase().replace(/^0X/, "0x")));
  assert.notEqual(first, deriveWalletNullifier(secret, "0x2000000000000000000000000000000000000002"));
  assert.notEqual(deriveEventNullifier(secret, first, event), deriveEventNullifier(secret, first, { ...event, eventId: "2" }));
  assert.throws(() => deriveWalletNullifier(secret, "bad"));
});

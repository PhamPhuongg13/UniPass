import test from "node:test";
import assert from "node:assert/strict";
import { Wallet, id } from "ethers";
import { buildRegistrationAuthorization, hashAuthorizationNonce, REGISTRATION_AUTH_TTL_SECONDS, REGISTRATION_AUTH_TYPES, REGISTRATION_DOMAIN_NAME, REGISTRATION_DOMAIN_VERSION, REGISTRATION_PURPOSE, signRegistrationAuthorization, verifyRegistrationAuthorization } from "../../src/lib/contracts/registration-authorization.mjs";

const manager = "0x1000000000000000000000000000000000000001";

test("EIP-712 authorization binds wallet, event, Fuji chain, contract, expiry, nonce, and purpose", async () => {
  const issuer = Wallet.createRandom();
  const student = Wallet.createRandom();
  const nowSeconds = 1_800_000_000;
  const signed = await signRegistrationAuthorization(issuer.privateKey, { wallet: student.address, eventId: "77", verifyingContract: manager, nowSeconds });

  assert.equal(signed.authorization.wallet, student.address);
  assert.equal(signed.authorization.eventId, "77");
  assert.equal(signed.authorization.chainId, 43113);
  assert.equal(signed.authorization.verifyingContract, manager);
  assert.equal(signed.authorization.expiresAt, nowSeconds + REGISTRATION_AUTH_TTL_SECONDS);
  assert.equal(signed.authorization.purpose, REGISTRATION_PURPOSE);
  assert.match(signed.authorization.nonce, /^0x[0-9a-f]{64}$/);
  assert.equal(verifyRegistrationAuthorization(issuer.address, signed.domain, signed.authorization, signed.signature), true);

  const invalidCases = [
    { domain: { ...signed.domain, chainId: 1 }, authorization: signed.authorization },
    { domain: { ...signed.domain, verifyingContract: "0x2000000000000000000000000000000000000002" }, authorization: signed.authorization },
    { domain: signed.domain, authorization: { ...signed.authorization, wallet: issuer.address } },
    { domain: signed.domain, authorization: { ...signed.authorization, eventId: "78" } },
    { domain: signed.domain, authorization: { ...signed.authorization, chainId: 1 } },
    { domain: signed.domain, authorization: { ...signed.authorization, verifyingContract: "0x2000000000000000000000000000000000000002" } },
    { domain: signed.domain, authorization: { ...signed.authorization, expiresAt: nowSeconds + 601 } },
    { domain: signed.domain, authorization: { ...signed.authorization, nonce: `0x${"ab".repeat(32)}` } },
    { domain: signed.domain, authorization: { ...signed.authorization, purpose: id("OTHER_PURPOSE") } },
  ];
  for (const entry of invalidCases) assert.equal(verifyRegistrationAuthorization(issuer.address, entry.domain, entry.authorization, signed.signature), false);
  assert.equal(verifyRegistrationAuthorization(student.address, signed.domain, signed.authorization, signed.signature), false);
});

test("authorization builder rejects malformed IDs, addresses, and excessive lifetime", () => {
  const wallet = Wallet.createRandom().address;
  assert.throws(() => buildRegistrationAuthorization({ wallet, eventId: "0", verifyingContract: manager }), /event ID/);
  assert.throws(() => buildRegistrationAuthorization({ wallet: "bad", eventId: "1", verifyingContract: manager }), /invalid address/i);
  assert.throws(() => buildRegistrationAuthorization({ wallet, eventId: "1", verifyingContract: "0x3000000000000000000000000000000000000003", ttlSeconds: 601 }), /lifetime/);
});

test("authorization digest schema stays aligned with the V2 Solidity struct", () => {
  assert.deepEqual(REGISTRATION_AUTH_TYPES.RegistrationAuthorization.map(({ name, type }) => [name, type]), [
    ["wallet", "address"], ["eventId", "uint256"], ["chainId", "uint256"], ["verifyingContract", "address"], ["expiresAt", "uint64"], ["nonce", "bytes32"], ["purpose", "bytes32"],
  ]);
  assert.equal(REGISTRATION_DOMAIN_NAME, "UniPass Event Manager");
  assert.equal(REGISTRATION_DOMAIN_VERSION, "2");
  const { authorization } = buildRegistrationAuthorization({ wallet: Wallet.createRandom().address, eventId: "9", verifyingContract: manager, nowSeconds: 1000 });
  assert.equal(hashAuthorizationNonce(authorization.nonce).length, 64);
  assert.notEqual(hashAuthorizationNonce(authorization.nonce), authorization.nonce.slice(2));
  assert.throws(() => hashAuthorizationNonce("0x1234"), /nonce/);
});

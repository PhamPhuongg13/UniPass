import test from "node:test";
import assert from "node:assert/strict";
import { createTicketCheckInCredential, createTicketCheckInQrPayload, hashTicketCheckInCredential, readTicketCheckInCredential, TICKET_CHECK_IN_TTL_MS } from "../../src/lib/tickets/check-in-credential.mjs";

test("creates an opaque one-time QR credential and stores only a distinct hash", () => {
  const first = createTicketCheckInCredential();
  const second = createTicketCheckInCredential();
  assert.match(first.token, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(first.token, second.token);
  assert.notEqual(first.tokenHash, first.token);
  assert.equal(first.tokenHash, hashTicketCheckInCredential(first.token));
  assert.equal(TICKET_CHECK_IN_TTL_MS, 120_000);
  assert.equal(createTicketCheckInQrPayload(first.token), `unipass://check-in/${first.token}`);
});

test("accepts only the exact raw or UniPass-prefixed token format", () => {
  const { token } = createTicketCheckInCredential();
  assert.equal(readTicketCheckInCredential(token), token);
  assert.equal(readTicketCheckInCredential(`unipass://check-in/${token}`), token);
  assert.equal(readTicketCheckInCredential(`${token}x`), null);
  assert.equal(readTicketCheckInCredential("unipass://check-in/not-a-secret"), null);
  assert.equal(readTicketCheckInCredential(null), null);
  assert.throws(() => hashTicketCheckInCredential("bad"), /Invalid/);
});

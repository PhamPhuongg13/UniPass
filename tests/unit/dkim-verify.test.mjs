import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { dkimSign } from "mailauth/lib/dkim/sign";
import { verifyStudentEmail, isAllowedStudentDomain } from "../../src/lib/eligibility/dkim-verify.mjs";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const privatePem = privateKey.export({ type: "pkcs8", format: "pem" });
const record = `v=DKIM1; k=rsa; p=${publicKey.export({ type: "spki", format: "der" }).toString("base64")}`;
const challenge = "A".repeat(43);
const resolver = async (name, rr) => {
  assert.equal(rr, "TXT");
  assert.match(name, /^test\._domainkey\.[a-z0-9.-]+$/);
  return [[record]];
};
async function signed({ domain = "vnu.edu.vn", from = "student@vnu.edu.vn", body = `UNIPASS-CHALLENGE:${challenge}`, extraFrom = "", maxBodyLength, encoding = "7bit" } = {}) {
  const encodedBody = encoding === "quoted-printable" ? body.replace("UNIPASS-", "UNIPASS=2D") : encoding === "base64" ? Buffer.from(body).toString("base64") : body;
  const raw = `From: ${from}\r\n${extraFrom}To: ${from}\r\nSubject: UniPass email verification\r\nDate: Thu, 19 Nov 2026 10:00:00 +0700\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: ${encoding}\r\n\r\n${encodedBody}\r\n`;
  const result = await dkimSign(raw, { headerList: "from:to:subject:date:content-type:content-transfer-encoding", signatureData: [{ signingDomain: domain, selector: "test", privateKey: privatePem, ...(maxBodyLength === undefined ? {} : { maxBodyLength }) }] });
  assert.equal(result.errors.length, 0);
  return result.signatures + raw;
}
async function code(eml) { return (await verifyStudentEmail(eml, { expectedChallenge: challenge, resolver })).code; }
test("valid DKIM signed email", async () => {
  const result = await verifyStudentEmail(await signed(), { expectedChallenge: challenge, resolver });
  assert.deepEqual(result, { ok: true, domain: "vnu.edu.vn", senderDomain: "vnu.edu.vn", normalizedSender: "student@vnu.edu.vn" });
});
test("wrong signing domain", async () => assert.equal(await code(await signed({ domain: "gmail.com", from: "student@gmail.com" })), "SIGNING_DOMAIN"));
test("From domain mismatch", async () => assert.equal(await code(await signed({ from: "student@gmail.com" })), "FROM_ALIGNMENT"));
test("challenge missing", async () => assert.equal(await code(await signed({ body: "Hello" })), "CHALLENGE_MISSING"));
test("challenge mismatch", async () => assert.equal(await code(await signed({ body: `UNIPASS-CHALLENGE:${"B".repeat(43)}` })), "CHALLENGE_MISMATCH"));
test("body changed after signing", async () => assert.equal(await code((await signed()).replace(`UNIPASS-CHALLENGE:${challenge}`, "UNIPASS-CHALLENGE:" + "B".repeat(43))), "DKIM_FAILED"));
test("two From headers", async () => assert.equal(await code(await signed({ extraFrom: "From: attacker@vnu.edu.vn\r\n" })), "FROM_COUNT"));
test("body length limit", async () => assert.equal(await code(await signed({ maxBodyLength: 10 })), "BODY_LENGTH_LIMIT"));
test("quoted-printable text body", async () => assert.equal((await verifyStudentEmail(await signed({ encoding: "quoted-printable" }), { expectedChallenge: challenge, resolver })).ok, true));
test("LF-only saved .eml still verifies", async () => assert.equal((await verifyStudentEmail((await signed()).replace(/\r\n/g, "\n"), { expectedChallenge: challenge, resolver })).ok, true));
test("base64 text body", async () => assert.equal((await verifyStudentEmail(await signed({ encoding: "base64" }), { expectedChallenge: challenge, resolver })).ok, true));

test("university DKIM signer allows aligned From subdomains", async () => {
  const uit = await verifyStudentEmail(await signed({ domain: "uit.edu.vn", from: "x@gm.uit.edu.vn" }), { expectedChallenge: challenge, resolver });
  assert.deepEqual(uit, { ok: true, domain: "uit.edu.vn", senderDomain: "gm.uit.edu.vn", normalizedSender: "x@gm.uit.edu.vn" });
  assert.equal((await verifyStudentEmail(await signed({ domain: "hcmus.edu.vn", from: "x@hcmus.edu.vn" }), { expectedChallenge: challenge, resolver })).ok, true);
});
test("DKIM domain policy and alignment", async () => {
  assert.equal(await code(await signed({ domain: "uit.edu.vn", from: "x@hcmus.edu.vn" })), "FROM_ALIGNMENT");
  assert.equal(await code(await signed({ domain: "evil-edu.vn", from: "x@evil-edu.vn" })), "SIGNING_DOMAIN");
  assert.equal(await code(await signed({ domain: "gm.uit.edu.vn", from: "x@uit.edu.vn" })), "FROM_ALIGNMENT");
  assert.equal(isAllowedStudentDomain("uit.edu.vn"), true);
  assert.equal(isAllowedStudentDomain("gm.uit.edu.vn"), true);
  assert.equal(isAllowedStudentDomain("evil-edu.vn"), false);
  assert.equal(isAllowedStudentDomain("gmail.com"), false);
});

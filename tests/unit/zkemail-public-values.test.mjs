import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseZkEmailPublicValues } from "../../src/lib/zkemail/public-values.mjs";
import { dkimPublicKeyHash } from "../../src/lib/zkemail/dkim-key-hash.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("../../scripts/zkemail/fixtures/vnu-proof-v2.json", import.meta.url), "utf8"));
test("v2 public values carry the known domain and DKIM key hashes", () => {
  assert.deepEqual(parseZkEmailPublicValues(fixture.publicValues), { fromDomainHash: fixture.expected.fromDomainHash, publicKeyHash: fixture.expected.publicKeyHash });
  assert.throws(() => parseZkEmailPublicValues("0x" + "00".repeat(160)), /layout/);
});
test("DKIM SPKI key is hashed as PKCS#1 DER", () => {
  const spki = "MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCyVv66/xkAoxTdEdsqiHh3Nkl+WxgRaCbfCo01Mqkzk2ab6agvpzECyWuapUqP5UL/ekqG7FSZVMgfP0vfdvAmh0w1awIFEG+67NjpCMfAaC64e+YAcgdN6YFKpvNcxFgYMRbUI0A2HiFAs27Hr61FxVEXM0Il+6tN7avModD+rwIDAQAB";
  assert.equal(dkimPublicKeyHash(spki), "0x4c8ecc9338e4b8811d4aa7ee05fa35cd94a98171f2ed0d2c0df9cc65a17aa986");
});

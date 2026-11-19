import { readFile } from "node:fs/promises";
import { initZkEmailSdk, parseEmail } from "@zk-email/sdk";

const PINNED_BLUEPRINT = "PhamPhuongg13/UniPass_Student_Verification@v2";
const EXPECTED_CHALLENGE = process.env.ZKEMAIL_EXPECTED_CHALLENGE;
const fixturePath = process.env.ZKEMAIL_EML_PATH;
if (!fixturePath) throw new Error("Set ZKEMAIL_EML_PATH to the private local fixture.");
if (!EXPECTED_CHALLENGE || !/^[A-Za-z0-9_-]{43}$/.test(EXPECTED_CHALLENGE)) {
  throw new Error("Set ZKEMAIL_EXPECTED_CHALLENGE to the expected 43-character challenge.");
}

const eml = await readFile(fixturePath, "utf8");
const sdk = initZkEmailSdk({ logging: { enabled: false, level: "silent" } });
const blueprint = await sdk.getBlueprint(PINNED_BLUEPRINT);

async function check(name, candidate) {
  try {
    await blueprint.validateEmail(candidate);
    const parsed = await parseEmail(candidate, false);
    const values = [...parsed.cleanedBody.matchAll(/(?:^|\r\n)UNIPASS-CHALLENGE:([^\r\n]*)/g)].map(match => match[1]);
    return { name, blueprintValidation: "PASS", sdkExtractedChallengeLineCount: values.length, extractedChallengeMatchesFixture: values.length === 1 && values[0] === EXPECTED_CHALLENGE };
  } catch (error) {
    const value = error && typeof error === "object" ? error : {};
    const rawMessage = typeof value.message === "string" ? value.message : typeof error === "string" ? error : "Unknown SDK error";
    return {
      name,
      blueprintValidation: "FAIL",
      errorName: typeof value.name === "string" ? value.name : "Error",
      error: rawMessage
        .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted]")
        .replace(/[A-Za-z0-9_-]{40,}/g, "[redacted-token]")
        .slice(0, 500),
    };
  }
}

const badNonce = `${EXPECTED_CHALLENGE.slice(1)}A`;
const invalidNonce = `${EXPECTED_CHALLENGE.slice(0, -1)}!`;
const withoutChallenge = eml.replace(`UNIPASS-CHALLENGE:${EXPECTED_CHALLENGE}`, "REMOVED-CHALLENGE");
const extraChallenge = eml.replace(`UNIPASS-CHALLENGE:${EXPECTED_CHALLENGE}`, `UNIPASS-CHALLENGE:${EXPECTED_CHALLENGE}\r\nUNIPASS-CHALLENGE:${EXPECTED_CHALLENGE}`);
const bodyTampered = eml.replace(`UNIPASS-CHALLENGE:${EXPECTED_CHALLENGE}`, `TAMPERED-BODY\r\nUNIPASS-CHALLENGE:${EXPECTED_CHALLENGE}`);

const results = [];
for (const [name, candidate] of [
  ["original fixture", eml],
  ["body changed while challenge remains", bodyTampered],
  ["different 43-character challenge", eml.replace(EXPECTED_CHALLENGE, badNonce)],
  ["invalid challenge character", eml.replace(EXPECTED_CHALLENGE, invalidNonce)],
  ["missing challenge line", withoutChallenge],
  ["duplicate challenge line", extraChallenge],
]) results.push(await check(name, candidate));

console.log(JSON.stringify({
  blueprint: { slug: blueprint.getClonedProps().slug, version: blueprint.getClonedProps().version, id: blueprint.getId() },
  tests: results,
  note: "SDK validateEmail checks DKIM/body-hash validity and Blueprint constraints, but does not generate or cryptographically verify a zk proof. No raw email or nonce values are emitted.",
}, null, 2));
process.exit(0);

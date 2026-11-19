import { readFile } from "node:fs/promises";
import { initZkEmailSdk, parseEmail, testDecomposedRegex } from "@zk-email/sdk";

const PINNED_BLUEPRINT = "PhamPhuongg13/UniPass_Student_Verification@v2";
const EXPECTED_CHALLENGE = "OE4SYFfV3TSF9rsN-d7pCZAc4BlDmF6DAXsmpKxOxew";
const fixturePath = process.env.ZKEMAIL_EML_PATH;
if (!fixturePath) throw new Error("Set ZKEMAIL_EML_PATH to the private local fixture.");

const sdk = initZkEmailSdk({ logging: { enabled: false, level: "silent" } });
const blueprint = await sdk.getBlueprint(PINNED_BLUEPRINT);
const metadata = blueprint.getClonedProps();
const email = await readFile(fixturePath, "utf8");
const parsed = await parseEmail(email, false);
const domainRegex = metadata.decomposedRegexes.find(regex => regex.name === "sender_domain");
const challengeRegex = metadata.decomposedRegexes.find(regex => regex.name === "challenge");
if (!domainRegex || !challengeRegex) throw new Error("Pinned v2 is missing the expected sender_domain/challenge extractors.");
const fromLine = parsed.canonicalizedHeader.match(/^from:[^\r\n]*/im)?.[0] ?? "";
const withFrom = replacement => parsed.canonicalizedHeader.replace(/^from:[^\r\n]*/im, replacement);
function safeError(error) {
  const value = error && typeof error === "object" ? error : {};
  const raw = typeof value.message === "string" ? value.message : String(error);
  return {
    name: typeof value.name === "string" ? value.name : "Error",
    message: raw.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted]").replace(/[A-Za-z0-9_-]{32,}/g, "[redacted-token]").slice(0, 400),
  };
}

const results = [];
for (const [name, body] of [
  ["fixture challenge", parsed.cleanedBody],
  ["wrong 43-character nonce", `UNIPASS-CHALLENGE:${`A${EXPECTED_CHALLENGE.slice(1)}`}\r\n`],
  ["42-character nonce", `UNIPASS-CHALLENGE:${EXPECTED_CHALLENGE.slice(1)}\r\n`],
  ["invalid nonce character", `UNIPASS-CHALLENGE:${`${EXPECTED_CHALLENGE.slice(0, -1)}!`}\r\n`],
  ["missing challenge", "UniPass verification\r\n"],
  ["two challenge lines", `UNIPASS-CHALLENGE:${EXPECTED_CHALLENGE}\r\nUNIPASS-CHALLENGE:${EXPECTED_CHALLENGE}\r\n`],
]) {
  try {
    const outputs = await testDecomposedRegex(body, "", challengeRegex);
    results.push({
      name,
      result: "PASS: extractor executed",
      outputCount: outputs.length,
      outputLengths: outputs.map(value => value.length),
      singleOutputMatchesExpected: outputs.length === 1 && outputs[0] === EXPECTED_CHALLENGE,
    });
  } catch (error) {
    results.push({ name, result: "FAIL: extractor rejected input", error: safeError(error) });
  }
}

const domainCases = [
  ["fixture canonical header", parsed.canonicalizedHeader],
  ["uppercase field name", withFrom(fromLine.replace(/^from:/i, "FROM:"))],
  ["display text contains external address", withFrom("from: other@gmail.com Student <student@vnu.edu.vn>")],
  ["non-VNU mailbox", withFrom("from: Student <student@gmail.com>")],
  ["multiple From fields", `${parsed.canonicalizedHeader}\r\n${fromLine}`],
];
const domainResults = [];
for (const [name, header] of domainCases) {
  try {
    const outputs = await testDecomposedRegex("", header, domainRegex);
    domainResults.push({ name, result: "PASS: extractor executed", outputCount: outputs.length, onlyVnuDomain: outputs.length === 1 && outputs[0] === "vnu.edu.vn" });
  } catch (error) {
    domainResults.push({ name, result: "FAIL: extractor rejected input", error: safeError(error) });
  }
}

console.log(JSON.stringify({
  blueprint: { id: blueprint.getId(), version: metadata.version },
  extractors: Object.fromEntries([domainRegex, challengeRegex].map(regex => [regex.name, { location: regex.location, maxLength: regex.maxLength, isHashed: regex.isHashed ?? false, parts: regex.parts.map(part => ({ isPublic: part.isPublic, regexDef: part.regexDef })) }])),
  challengeRegex: results,
  senderDomainRegex: domainResults,
  note: "SDK extractor tests are not DKIM or proof verification; synthetic header/body cases are not signed emails.",
}, null, 2));
process.exit(0);

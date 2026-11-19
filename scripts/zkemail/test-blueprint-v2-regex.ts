import { readFile } from "node:fs/promises";
import { extractEMLDetails, initZkEmailSdk, parseEmail, testDecomposedRegex } from "@zk-email/sdk";

const path = process.env.ZKEMAIL_EML_PATH || "/Users/vuphuongpham/Downloads/UniPass Verify TEST123 (1).eml";
const eml = await readFile(path, "utf8");
const parsed = await parseEmail(eml, false);
const blueprint = await initZkEmailSdk({ logging: { enabled: false, level: "silent" } }).getBlueprint("PhamPhuongg13/UniPass_Student_Verification@v1");
for (const regex of blueprint.getClonedProps().decomposedRegexes) {
  try {
    const outputs = await testDecomposedRegex(parsed.canonicalizedBody, parsed.canonicalizedHeader, regex);
    console.log(JSON.stringify({ name: regex.name, v1FieldTest: "PASS", outputCount: outputs.length, outputLengths: outputs.map(output => output.length) }));
  } catch (error) {
    console.log(JSON.stringify({ name: regex.name, v1FieldTest: "FAIL", error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 300) } : String(error) }));
  }
}
const candidates = [
  {
    name: "from_domain_current_v1_shape",
    location: "header" as const,
    maxLength: 32,
    parts: [
      { isPublic: false, regexDef: "(\\r\\n|^)from:[^\\r\\n]*@" },
      { isPublic: true, regexDef: "vnu[.]edu[.]vn" },
      { isPublic: false, regexDef: "[>\\r\\n]" },
    ],
  },
  {
    name: "challenge_body_canonical",
    location: "body" as const,
    maxLength: 43,
    parts: [
      { isPublic: false, regexDef: "(\\r\\n|^)UNIPASS-CHALLENGE:" },
      { isPublic: true, regexDef: "[A-Za-z0-9_-]+" },
      { isPublic: false, regexDef: "\\r\\n" },
    ],
  },
];

for (const regex of candidates) {
  try {
    const outputs = await testDecomposedRegex(parsed.canonicalizedBody, parsed.canonicalizedHeader, regex);
    console.log(JSON.stringify({ name: regex.name, compiler: "PASS", outputCount: outputs.length, outputLengths: outputs.map(output => output.length) }));
  } catch (error) {
    console.log(JSON.stringify({ name: regex.name, compiler: "FAIL", error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 500) } : "unknown" }));
  }
}

const challengeFixture = `${"x".repeat(40)}\r\nUNIPASS-CHALLENGE:${"A".repeat(43)}\r\n`;
for (const regex of candidates.filter(candidate => candidate.name === "challenge_body_canonical")) {
  try {
    const outputs = await testDecomposedRegex(challengeFixture, "", regex);
    console.log(JSON.stringify({ name: regex.name, syntheticCompiler: "PASS", outputCount: outputs.length, outputLengths: outputs.map(output => output.length) }));
  } catch (error) {
    console.log(JSON.stringify({ name: regex.name, syntheticCompiler: "FAIL", error: error instanceof Error ? { name: error.name, message: error.message.slice(0, 500) } : String(error) }));
  }
}

console.log(JSON.stringify({ fixtureBytes: Buffer.byteLength(eml), canonicalHeaderBytes: Buffer.byteLength(parsed.canonicalizedHeader), canonicalBodyBytes: Buffer.byteLength(parsed.canonicalizedBody), challengePresent: parsed.canonicalizedBody.includes("UNIPASS-CHALLENGE:"), sdkEmailDetails: await extractEMLDetails(eml, parsed) }));

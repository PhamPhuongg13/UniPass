import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { parseEmail, testDecomposedRegex } from "@zk-email/sdk";

const path = process.env.ZKEMAIL_EML_PATH;
const expectedChallenge = "OE4SYFfV3TSF9rsN-d7pCZAc4BlDmF6DAXsmpKxOxew";
if (!path) throw new Error("Set ZKEMAIL_EML_PATH to the local .eml file.");

const eml = await readFile(path, "utf8");
const parsed = await parseEmail(eml, false);
const candidates = [
  {
    name: "sender_domain",
    location: "header" as const,
    maxLength: 64,
    parts: [
      { isPublic: false, regexDef: "(\\r\\n|^)from:[^\\r\\n]*@" },
      { isPublic: true, regexDef: "vnu[.]edu[.]vn" },
      { isPublic: false, regexDef: "[>\\r\\n]" },
    ],
  },
  {
    name: "challenge",
    location: "body" as const,
    maxLength: 96,
    parts: [
      { isPublic: false, regexDef: "(\\r\\n|^)UNIPASS-CHALLENGE:" },
      { isPublic: true, regexDef: "[A-Za-z0-9_-]+" },
      { isPublic: false, regexDef: "\\r\\n" },
    ],
  },
];

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
for (const regex of candidates) {
  try {
    const outputs = await testDecomposedRegex(parsed.cleanedBody, parsed.canonicalizedHeader, regex);
    const expected = regex.name === "challenge" ? expectedChallenge : "vnu.edu.vn";
    console.log(JSON.stringify({
      name: regex.name,
      sdkCompiler: "PASS",
      outputCount: outputs.length,
      outputLengths: outputs.map(output => output.length),
      outputSha256: outputs.map(sha256),
      expectedValueMatch: outputs.length === 1 && outputs[0] === expected,
    }));
  } catch (error) {
    const value = error as { name?: unknown; message?: unknown };
    console.log(JSON.stringify({
      name: regex.name,
      sdkCompiler: "FAIL",
      error: {
        name: typeof value?.name === "string" ? value.name : "Error",
        message: String(value?.message ?? error).slice(0, 500),
      },
    }));
  }
}

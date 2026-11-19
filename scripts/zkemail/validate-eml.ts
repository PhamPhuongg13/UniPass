import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { initZkEmailSdk } from "@zk-email/sdk";

export const BLUEPRINT_SLUG = "PhamPhuongg13/UniPass_Student_Verification@v1";
const DEFAULT_FIXTURE = "/Users/vuphuongpham/Downloads/UniPass Verify TEST123 (1).eml";
const MAX_EML_BYTES = 5 * 1024 * 1024;

function errorSummary(error: unknown) {
  if (!(error instanceof Error)) return { name: "Error", message: "Unknown SDK error" };
  return { name: error.name, message: error.message.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted email]").slice(0, 1200) };
}

export async function validateFixture(fixturePath = process.env.ZKEMAIL_EML_PATH || DEFAULT_FIXTURE) {
  const absolutePath = resolve(fixturePath);
  const stat = await readFile(absolutePath);
  if (stat.byteLength === 0 || stat.byteLength > MAX_EML_BYTES) throw new Error(`Fixture size must be between 1 byte and ${MAX_EML_BYTES} bytes.`);
  const eml = stat.toString("utf8");
  if (!/^From: .+\r?\n/m.test(eml) || !/^DKIM-Signature: .+\r?\n/m.test(eml) || !/\r?\n\r?\n/.test(eml)) {
    throw new Error("Malformed RFC 5322 fixture: expected From, DKIM-Signature, and header/body separator.");
  }

  const sdk = initZkEmailSdk({ logging: { enabled: false, level: "silent" } });
  const blueprint = await sdk.getBlueprint(BLUEPRINT_SLUG);
  const metadata = blueprint.getClonedProps();
  const headerLength = Buffer.byteLength(eml.split(/\r?\n\r?\n/, 1)[0], "utf8");
  const report = {
    blueprint: { slug: metadata.slug, version: metadata.version, id: blueprint.getId(), compiled: (await blueprint.checkStatus()).clientStatus === 3 && (await blueprint.checkStatus()).serverStatus === 3 },
    fixture: { bytes: stat.byteLength, headerBytes: headerLength, headerWithinLimit: headerLength <= (metadata.emailHeaderMaxLength ?? Infinity) },
    dkim: "NOT_INDEPENDENTLY_CHECKED",
  };
  try {
    await blueprint.validateEmail(eml);
    return { ...report, blueprintValidation: "PASS", error: null };
  } catch (error) {
    return { ...report, blueprintValidation: "FAIL", error: errorSummary(error) };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = await validateFixture(process.argv[2]);
    console.log(JSON.stringify(result, null, 2));
    if (result.blueprintValidation !== "PASS") process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({ blueprintValidation: "NOT_RUN", error: errorSummary(error) }, null, 2));
    process.exitCode = 1;
  }
}

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { initZkEmailSdk } from "@zk-email/sdk";
import { BLUEPRINT_SLUG } from "./validate-eml";

const DEFAULT_FIXTURE = "/Users/vuphuongpham/Downloads/UniPass Verify TEST123 (1).eml";

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const start = Date.now();
  try {
    const eml = await readFile(resolve(process.argv[2] || process.env.ZKEMAIL_EML_PATH || DEFAULT_FIXTURE), "utf8");
    const sdk = initZkEmailSdk({ logging: { enabled: false, level: "silent" } });
    const blueprint = await sdk.getBlueprint(BLUEPRINT_SLUG);
    await blueprint.validateEmail(eml);
    const prover = blueprint.createProver({ isLocal: true });
    const proof = await prover.generateProof(eml);
    const verified = await blueprint.verifyProof(proof);
    const proofData = proof.getProofData();
    console.log(JSON.stringify({ proofGenerated: true, cryptographicVerification: verified ? "PASS" : "FAIL", elapsedMs: Date.now() - start, publicOutputs: proofData.publicOutputs, verifierChain: blueprint.getClonedProps().verifierContract?.chain }, null, 2));
    if (!verified) process.exitCode = 1;
  } catch (error) {
    const message = error instanceof Error ? error.message.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted email]").slice(0, 1600) : "Unknown SDK error";
    console.error(JSON.stringify({ proofGenerated: false, cryptographicVerification: "NOT_VERIFIED", elapsedMs: Date.now() - start, error: { name: error instanceof Error ? error.name : "Error", message } }, null, 2));
    process.exitCode = 1;
  }
}

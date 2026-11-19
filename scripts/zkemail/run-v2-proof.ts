import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { initZkEmailSdk, parseEmail } from "@zk-email/sdk";
import { initNoirWasm } from "@zk-email/sdk/initNoirWasm";
import { retryWithBackoff } from "../../src/lib/zkemail/challenge.mjs";

const SLUG = "PhamPhuongg13/UniPass_Student_Verification@v2";
const EXPECTED_CHALLENGE = "OE4SYFfV3TSF9rsN-d7pCZAc4BlDmF6DAXsmpKxOxew";
const FIXTURE = process.env.ZKEMAIL_EML_PATH;
const start = Date.now();
const evidence: Record<string, unknown> = { pinnedSlug: SLUG };
const safeError = (error: unknown) => {
  const value = error as { name?: unknown; message?: unknown; stack?: unknown } | null;
  const rawMessage = typeof value?.message === "string" ? value.message : String(error);
  return {
    name: typeof value?.name === "string" ? value.name : "NonErrorThrow",
    message: rawMessage.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted]").slice(0, 1800),
    stack: typeof value?.stack === "string" ? value.stack.split("\n").slice(0, 5).join("\n").slice(0, 1000) : undefined,
  };
};
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

try {
  if (!FIXTURE) throw new Error("Set ZKEMAIL_EML_PATH to the local .eml file; the script does not assume or copy a fixture path.");
  const bytes = await readFile(FIXTURE);
  const eml = bytes.toString("utf8");
  evidence.fixtureBytes = bytes.byteLength;
  const parsed = await parseEmail(eml, false);
  // Blueprint.validateEmail extracts from cleanedBody (the SDK's circuit input), not canonicalizedBody.
  const bodyText = parsed.cleanedBody;
  const challengeMatches = [...bodyText.matchAll(/(?:^|\r\n)UNIPASS-CHALLENGE:([A-Za-z0-9_-]+)(?=\r\n|$)/g)].map(match => match[1]);
  Object.assign(evidence, {
    sdkParseEmail: "PASS",
    dkimSignatureBytes: parsed.signature.length,
    dkimPublicKeyBytes: parsed.publicKey.length,
    canonicalHeaderBytes: Buffer.byteLength(parsed.canonicalizedHeader),
    canonicalBodyBytes: Buffer.byteLength(parsed.canonicalizedBody),
    sdkValidatedBodyBytes: Buffer.byteLength(bodyText),
    challengeCountInSdkValidatedBody: challengeMatches.length,
    challengeMatchesExpectedNonce: challengeMatches.length === 1 && challengeMatches[0] === EXPECTED_CHALLENGE,
    challengeLength: challengeMatches[0]?.length ?? null,
    challengeSha256: challengeMatches[0] ? hash(challengeMatches[0]) : null,
    dkim: "Signature and public key parsed; cryptographic DKIM enforcement requires proof verification",
  });

  const sdk = initZkEmailSdk({ logging: { enabled: false, level: "silent" } });
  let blueprint: Awaited<ReturnType<typeof sdk.getBlueprint>>;
  const registryRequests: Array<{ endpoint: string; status?: number; error?: string }> = [];
  const nativeFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const rawUrl = input instanceof Request ? input.url : String(input);
    let endpoint = "unknown";
    try {
      const url = new URL(rawUrl);
      endpoint = `${url.origin}${url.pathname}`;
    } catch {}
    try {
      const response = await nativeFetch(input, init);
      if (!response.ok) registryRequests.push({ endpoint, status: response.status });
      return response;
    } catch (error) {
      registryRequests.push({ endpoint, error: safeError(error).message });
      throw error;
    }
  };
  try {
    blueprint = await retryWithBackoff(() => sdk.getBlueprint(SLUG), {
      maxAttempts: 3,
      baseDelayMs: 250,
      maxDelayMs: 1_000,
      onRetry: ({ attempt, delayMs }) => {
        const retries = (evidence.registryRetries as Array<{ failedAttempt: number; delayMs: number }> | undefined) ?? [];
        retries.push({ failedAttempt: attempt, delayMs });
        evidence.registryRetries = retries;
      },
    });
    globalThis.fetch = nativeFetch;
  } catch (error) {
    globalThis.fetch = nativeFetch;
    evidence.blueprintLoad = "FAIL";
    evidence.blueprintLoadError = safeError(error);
    evidence.registryRequests = registryRequests;
    evidence.registryAttempts = registryRequests.length;
    evidence.elapsedMs = Date.now() - start;
    console.error(JSON.stringify(evidence, null, 2));
    process.exitCode = 1;
    process.exit(1);
  }
  const metadata = blueprint.getClonedProps();
  Object.assign(evidence, {
    blueprintVersion: metadata.version,
    compiled: (await blueprint.checkStatus()).clientStatus === 3 && (await blueprint.checkStatus()).serverStatus === 3,
    clientFramework: metadata.clientZkFramework,
    serverFramework: metadata.serverZkFramework,
    headerLimit: metadata.emailHeaderMaxLength,
    bodyLimit: metadata.emailBodyMaxLength,
  });
  if (Buffer.byteLength(parsed.canonicalizedHeader) > (metadata.emailHeaderMaxLength ?? Infinity)) throw Object.assign(new Error("Canonical header exceeds pinned Blueprint limit."), { evidence });
  if (Buffer.byteLength(bodyText) > (metadata.emailBodyMaxLength ?? Infinity)) throw Object.assign(new Error("Canonical body exceeds pinned Blueprint limit."), { evidence });

  try {
    await blueprint.validateEmail(eml);
    evidence.validateEmail = "PASS";
  } catch (error) {
    evidence.validateEmail = "FAIL";
    evidence.validationError = safeError(error);
    console.log(JSON.stringify(evidence, null, 2));
    process.exitCode = 1;
    process.exit(1);
  }

  if (challengeMatches.length !== 1 || challengeMatches[0] !== EXPECTED_CHALLENGE) throw Object.assign(new Error("Expected exactly one canonical challenge line matching the supplied nonce."), { evidence });
  if (challengeMatches[0].length !== 43) throw Object.assign(new Error("Expected a 43-character base64url challenge nonce."), { evidence });
  evidence.noirWasmInitialization = "STARTED";
  const noirWasm = await initNoirWasm();
  evidence.noirWasmInitialization = "PASS";
  const artifactRequests: Array<{ endpoint: string; status?: number; contentType?: string; contentLength?: string | null; error?: string }> = [];
  const artifactFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const rawUrl = input instanceof Request ? input.url : String(input);
    let endpoint = "unknown";
    try { const url = new URL(rawUrl); endpoint = `${url.origin}${url.pathname}`; } catch {}
    try {
      const response = await artifactFetch(input, init);
      artifactRequests.push({ endpoint, status: response.status, contentType: response.headers.get("content-type") ?? undefined, contentLength: response.headers.get("content-length") });
      return response;
    } catch (error) {
      artifactRequests.push({ endpoint, error: safeError(error).message });
      throw error;
    }
  };
  try {
    const circuit = await blueprint.getNoirCircuit();
    evidence.noirCircuitArtifact = { result: "PASS", topLevelKeys: circuit && typeof circuit === "object" ? Object.keys(circuit).slice(0, 12) : [], requestCount: artifactRequests.length };
  } catch (error) {
    evidence.noirCircuitArtifact = { result: "FAIL", error: safeError(error), requests: artifactRequests };
  }
  globalThis.fetch = artifactFetch;
  if ((evidence.noirCircuitArtifact as { result?: string }).result !== "PASS") {
    evidence.proofGeneration = "BLOCKED: compiled Noir circuit JSON is unavailable";
    evidence.verifyProof = "NOT_RUN";
    evidence.publicOutputChecks = "NOT_RUN";
    evidence.elapsedMs = Date.now() - start;
    console.log(JSON.stringify(evidence, null, 2));
    process.exit(1);
  }
  const prover = blueprint.createProver({ isLocal: true });
  const proof = await prover.generateProof(eml, [], { noirWasm });
  evidence.proofGenerated = true;
  evidence.proofId = proof.getId();
  const verified = await blueprint.verifyProof(proof);
  evidence.verifyProof = verified ? "PASS" : "FAIL";
  const proofData = proof.getProofData();
  const outputDomain = proofData.publicData?.sender_domain?.[0] ?? null;
  const outputChallenge = proofData.publicData?.challenge?.[0] ?? null;
  evidence.publicOutputChecks = {
    senderDomainOutputCount: proofData.publicData?.sender_domain?.length ?? 0,
    senderDomainEqualsVnu: outputDomain === "vnu.edu.vn",
    senderDomainLength: outputDomain?.length ?? null,
    challengeOutputCount: proofData.publicData?.challenge?.length ?? 0,
    challengeEqualsExpectedNonce: outputChallenge === EXPECTED_CHALLENGE,
    challengeLength: outputChallenge?.length ?? null,
    challengeSha256: outputChallenge ? hash(outputChallenge) : null,
    expectedChallengeSha256: hash(EXPECTED_CHALLENGE),
  };
  evidence.expectedChallengeSha256 = hash(EXPECTED_CHALLENGE);
  evidence.elapsedMs = Date.now() - start;
  console.log(JSON.stringify(evidence, null, 2));
  if (!verified || outputDomain !== "vnu.edu.vn" || outputChallenge !== EXPECTED_CHALLENGE || proofData.publicData?.sender_domain?.length !== 1 || proofData.publicData?.challenge?.length !== 1) process.exit(1);
  process.exit(0);
} catch (error) {
  console.error(JSON.stringify({ ...evidence, error: safeError(error), elapsedMs: Date.now() - start }, null, 2));
  process.exit(1);
}

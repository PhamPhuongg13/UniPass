import { initZkEmailSdk } from "@zk-email/sdk";

const PINNED_BLUEPRINT = "PhamPhuongg13/UniPass_Student_Verification@v2";
const sdk = initZkEmailSdk({ logging: { enabled: false, level: "silent" } });

function safeEndpoint(value) {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return "unparseable-endpoint";
  }
}

const blueprint = await sdk.getBlueprint(PINNED_BLUEPRINT);
const metadata = blueprint.getClonedProps();
const probes = [];

for (const [name, getUrl] of [
  ["noirCircuit", () => blueprint.getNoirCircuitDownloadLink()],
  ["noirCircuitJson", () => blueprint.getNoirCircuitJsonDownloadLink()],
  ["noirRegexGraphs", () => blueprint.getNoirRegexGraphsDownloadLink()],
]) {
  try {
    const url = await getUrl();
    const response = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(12_000) });
    probes.push({
      name,
      endpoint: safeEndpoint(url),
      status: response.status,
      contentType: response.headers.get("content-type"),
      contentLength: response.headers.get("content-length"),
    });
  } catch (error) {
    probes.push({
      name,
      error: error instanceof Error ? error.message.slice(0, 500) : "Unknown error",
    });
  }
}

console.log(JSON.stringify({
  blueprint: { slug: metadata.slug, version: metadata.version, id: blueprint.getId(), clientFramework: metadata.clientZkFramework },
  documentedSdkArtifactLinks: probes,
}, null, 2));
process.exit(0);

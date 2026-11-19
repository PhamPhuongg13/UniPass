import { spawn } from "node:child_process";

const messages = {
  success: "UniPass audit completed. Check final report.",
  blocked: "UniPass audit needs your attention.",
  failed: "UniPass audit failed. Check logs.",
};

const status = process.argv[2];
if (!Object.hasOwn(messages, status)) {
  console.error("Usage: NTFY_TOPIC=<private-topic> npm run notify:ntfy -- <success|blocked|failed>");
  process.exit(2);
}
const topic = process.env.NTFY_TOPIC;
if (!topic || !/^[A-Za-z0-9_-]{1,128}$/.test(topic)) {
  console.error("NTFY_TOPIC is missing or invalid; notification was not sent.");
  process.exit(2);
}

const request = spawn("curl", ["--silent", "--show-error", "--fail", "--output", "/dev/null", "--write-out", "%{http_code}", "-H", "Title: UniPass QA", "-H", "Content-Type: text/plain; charset=utf-8", "--data-binary", messages[status], `https://ntfy.sh/${topic}`], { stdio: ["ignore", "pipe", "pipe"] });
let response = "";
let errorOutput = "";
request.stdout.on("data", chunk => { response += chunk; });
request.stderr.on("data", chunk => { errorOutput += chunk; });
request.once("error", () => { console.error("curl could not be started; notification was not sent."); process.exitCode = 1; });
request.once("close", code => {
  if (code !== 0 || !/^2\d\d$/.test(response.trim())) {
    console.error(`ntfy request failed (curl exit ${code ?? "unknown"}, HTTP ${response.trim() || "none"}).`);
    if (errorOutput) console.error(errorOutput.trim().replace(/https?:\/\/ntfy\.sh\/\S+/g, "ntfy endpoint"));
    process.exitCode = 1;
    return;
  }
  console.log(`ntfy notification delivered (HTTP ${response.trim()}).`);
});

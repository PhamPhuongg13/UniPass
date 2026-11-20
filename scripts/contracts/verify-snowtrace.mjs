// Verify deployed Fuji contracts on Snowtrace (Routescan, Etherscan-compatible API).
// Usage: node scripts/contracts/verify-snowtrace.mjs <address> <sourcePath>:<ContractName> <group> [--dry-run]
//   group = v2 | zkemail | icm  (selects the same source set + settings used by the matching compile script)
import fs from "node:fs";
import path from "node:path";
import solc from "solc";

const API = "https://api.routescan.io/v2/network/testnet/evm/43113/etherscan/api";
const RPC = process.env.NEXT_PUBLIC_AVALANCHE_RPC_URL || "https://api.avax-test.network/ext/bc/C/rpc";
const GROUPS = {
  v2: ["contracts/UniPassEventManagerV2.sol", "contracts/UniPassTicketV2.sol", "contracts/UniPassPollV1.sol", "contracts/UniPassTestUSDC.sol", "contracts/UniPassProgramsV1.sol", "contracts/UniPassProgramsV2.sol"],
  icm: ["contracts/UniPassPassportBridgeV1.sol", "contracts/UniPassPassportMirrorV1.sol", "contracts/CampusQuestL1.sol", "contracts/icm/TeleporterInterfaces.sol"],
  zkemail: ["contracts/UniPassZkEmailV1.sol", "contracts/sp1/ISP1Verifier.sol", "contracts/sp1/v6.1.0/SP1VerifierGroth16.sol", "contracts/sp1/v6.1.0/Groth16Verifier.sol"],
};
const [address, target, group] = process.argv.slice(2);
if (!/^0x[0-9a-fA-F]{40}$/.test(address ?? "") || !target?.includes(":") || !GROUPS[group]) throw new Error("Usage: <address> <path>:<Name> <v2|zkemail|icm>");
const [sourcePath, contractName] = target.split(":");
const root = process.cwd();
const sources = Object.fromEntries(GROUPS[group].map(file => [file, { content: fs.readFileSync(path.join(root, file), "utf8") }]));
const resolve = name => {
  for (const candidate of [path.join(root, "node_modules", name), path.join(root, "contracts", name)]) {
    if (fs.existsSync(candidate)) { const contents = fs.readFileSync(candidate, "utf8"); sources[name] = { content: contents }; return { contents }; }
  }
  return { error: `Import not found: ${name}` };
};
const settings = { optimizer: { enabled: true, runs: 500 }, evmVersion: "cancun", outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } } };
const out = JSON.parse(solc.compile(JSON.stringify({ language: "Solidity", sources: { ...sources }, settings }), { import: resolve }));
if ((out.errors ?? []).some(e => e.severity === "error")) throw new Error("compile failed");
const bytecode = out.contracts[sourcePath]?.[contractName]?.evm.bytecode.object;
if (!bytecode) throw new Error("contract not found in output");

const json = async url => (await fetch(url)).json();
const creation = await json(`${API}?module=contract&action=getcontractcreation&contractaddresses=${address}`);
const txHash = creation.result?.[0]?.txHash;
if (!txHash) throw new Error("creation tx not found: " + JSON.stringify(creation).slice(0, 200));
const tx = await (await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getTransactionByHash", params: [txHash] }) })).json();
const input = tx.result.input.slice(2);
if (!input.startsWith(bytecode)) { console.log(`${contractName} ${address}: SOURCE MISMATCH (current source differs from deployed bytecode) — skipped`); process.exit(2); }
const constructorArgs = input.slice(bytecode.length);
const standardInput = JSON.stringify({ language: "Solidity", sources, settings: { optimizer: settings.optimizer, evmVersion: settings.evmVersion, outputSelection: { "*": { "*": ["abi", "evm.bytecode", "evm.deployedBytecode", "metadata"] } } } });
console.log(`${contractName} ${address}: bytecode matches; ${Object.keys(sources).length} source files; ctor args ${constructorArgs.length / 2} bytes`);
if (process.argv.includes("--dry-run")) process.exit(0);
const body = new URLSearchParams({ module: "contract", action: "verifysourcecode", apikey: "verifyme", contractaddress: address, sourceCode: standardInput, codeformat: "solidity-standard-json-input", contractname: `${sourcePath}:${contractName}`, compilerversion: `v${solc.version().replace(".Emscripten.clang", "")}`, constructorArguements: constructorArgs });
const submit = await (await fetch(API, { method: "POST", body })).json();
if (submit.status !== "1") { console.log("submit failed:", JSON.stringify(submit).slice(0, 300)); process.exit(1); }
for (let i = 0; i < 20; i++) {
  await new Promise(r => setTimeout(r, 4000));
  const s = await json(`${API}?module=contract&action=checkverifystatus&guid=${submit.result}&apikey=verifyme`);
  if (!/pending/i.test(s.result)) { console.log("status:", s.result); process.exit(/pass|verified/i.test(s.result) ? 0 : 1); }
}
console.log("still pending");

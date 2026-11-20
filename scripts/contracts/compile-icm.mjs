import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import solc from "solc";
export function compileIcmContracts() {
  const root = process.cwd();
  const files = ["contracts/UniPassPassportBridgeV1.sol", "contracts/UniPassPassportMirrorV1.sol", "contracts/CampusQuestL1.sol", "contracts/icm/TeleporterInterfaces.sol"];
  const sources = Object.fromEntries(files.map(file => [file, { content: fs.readFileSync(path.join(root, file), "utf8") }]));
  const output = JSON.parse(solc.compile(JSON.stringify({ language: "Solidity", sources, settings: { optimizer: { enabled: true, runs: 500 }, evmVersion: "cancun", outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } } } }), { import: name => {
    try { return { contents: fs.readFileSync(path.join(root, name.startsWith("@") ? "node_modules" : "", name), "utf8") }; }
    catch { return { error: `Import not found: ${name}` }; }
  } }));
  for (const item of output.errors ?? []) if (item.severity === "error") console.error(item.formattedMessage);
  if ((output.errors ?? []).some(item => item.severity === "error")) throw new Error("ICM Solidity compilation failed.");
  return { contracts: Object.fromEntries(files.slice(0, 3).map(file => { const name = path.basename(file, ".sol"); return [name, output.contracts[file][name]]; })), diagnostics: output.errors ?? [] };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const { contracts } = compileIcmContracts();
  for (const [name, artifact] of Object.entries(contracts)) console.log(`${name}: compiled (${artifact.evm.bytecode.object.length / 2} bytes bytecode)`);
}

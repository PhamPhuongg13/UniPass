import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import solc from "solc";

export function compileZkEmailContracts() {
  const root = process.cwd();
  const files = ["contracts/UniPassZkEmailV1.sol", "contracts/sp1/ISP1Verifier.sol", "contracts/sp1/v6.1.0/SP1VerifierGroth16.sol", "contracts/sp1/v6.1.0/Groth16Verifier.sol"];
  const sources = Object.fromEntries(files.map(file => [file, { content: fs.readFileSync(path.join(root, file), "utf8") }]));
  const input = { language: "Solidity", sources, settings: { optimizer: { enabled: true, runs: 500 }, evmVersion: "cancun", outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } } } };
  const output = JSON.parse(solc.compile(JSON.stringify(input), { import: name => {
    try { return { contents: fs.readFileSync(path.join(root, "node_modules", name), "utf8") }; }
    catch { return { error: `Import not found: ${name}` }; }
  } }));
  for (const diagnostic of output.errors ?? []) {
    if (diagnostic.severity === "error") console.error(diagnostic.formattedMessage);
  }
  if ((output.errors ?? []).some(item => item.severity === "error")) throw new Error("zkEmail Solidity compilation failed.");
  const contracts = {
    UniPassZkEmailV1: output.contracts[files[0]].UniPassZkEmailV1,
    SP1Verifier: output.contracts[files[2]].SP1Verifier,
  };
  return { contracts, diagnostics: output.errors ?? [] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const { contracts } = compileZkEmailContracts();
  for (const [name, artifact] of Object.entries(contracts)) console.log(`${name}: compiled (${artifact.evm.bytecode.object.length / 2} bytes bytecode)`);
}

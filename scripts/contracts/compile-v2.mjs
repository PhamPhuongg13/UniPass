import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import solc from "solc";

export function compileV2Contracts() {
  const root = process.cwd();
  const sources = {};
  for (const name of ["UniPassEventManagerV2.sol", "UniPassTicketV2.sol"]) {
    sources[`contracts/${name}`] = { content: fs.readFileSync(path.join(root, "contracts", name), "utf8") };
  }
  function findImport(importPath) {
    const localPath = path.join(root, "contracts", importPath);
    const packagePath = path.join(root, "node_modules", importPath);
    const file = importPath.startsWith("@openzeppelin/") ? packagePath : localPath;
    try { return { contents: fs.readFileSync(file, "utf8") }; }
    catch { return { error: `Import not found: ${importPath}` }; }
  }
  const input = {
    language: "Solidity", sources,
    settings: { optimizer: { enabled: true, runs: 500 }, evmVersion: "cancun", outputSelection: { "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"] } } },
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImport }));
  const diagnostics = output.errors ?? [];
  for (const diagnostic of diagnostics) {
    if (diagnostic.severity === "error") console.error(diagnostic.formattedMessage);
    else if (diagnostic.severity === "warning") console.warn(diagnostic.formattedMessage);
  }
  if (diagnostics.some(diagnostic => diagnostic.severity === "error")) throw new Error("Solidity V2 compilation failed.");
  const contracts = {};
  for (const name of ["UniPassEventManagerV2", "UniPassTicketV2"]) {
    const source = name === "UniPassEventManagerV2" ? "contracts/UniPassEventManagerV2.sol" : "contracts/UniPassTicketV2.sol";
    const artifact = output.contracts[source]?.[name];
    if (!artifact?.evm.bytecode.object) throw new Error(`No bytecode for ${name}`);
    contracts[name] = artifact;
  }
  return { contracts, diagnostics };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const { contracts } = compileV2Contracts();
  for (const [name, artifact] of Object.entries(contracts)) console.log(`${name}: compiled (${artifact.evm.bytecode.object.length / 2} bytes bytecode)`);
}

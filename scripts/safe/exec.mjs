import { getAddress } from "ethers";
import { execSafeTx, safeOwnerWallets, safeProvider } from "./lib.mjs";
import fs from "node:fs";
const [to, data] = process.argv.slice(2);
if (!to || !/^0x([0-9a-fA-F]{2})*$/.test(data ?? "")) throw new Error("Usage: node --env-file=.env scripts/safe/exec.mjs <to> <calldata>");
const deployment = JSON.parse(fs.readFileSync("deployments/safe.json", "utf8"));
const provider = safeProvider();
try { const owners = safeOwnerWallets(provider); console.log(await execSafeTx(deployment.safe.address, { to: getAddress(to), data }, owners.slice(0, 2), owners[0])); }
finally { provider.destroy(); }

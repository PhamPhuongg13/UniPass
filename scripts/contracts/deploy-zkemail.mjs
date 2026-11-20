import fs from "node:fs";
import path from "node:path";
import { ContractFactory, JsonRpcProvider, Wallet } from "ethers";
import { compileZkEmailContracts } from "./compile-zkemail.mjs";

const outputFile = path.join(process.cwd(), "deployments/fuji-zkemail.json");
const programVKey = "0x0084f70cf44dfbe813c34e00c2f9316f5bb751f3bc98bdd65a76c7ebbe8e49d3";
if (fs.existsSync(outputFile) && !process.argv.includes("--force")) throw new Error("deployments/fuji-zkemail.json already exists. Review before using --force.");
if (!process.env.DEPLOYER_PRIVATE_KEY || !process.env.NEXT_PUBLIC_AVALANCHE_RPC_URL) throw new Error("Set DEPLOYER_PRIVATE_KEY and NEXT_PUBLIC_AVALANCHE_RPC_URL.");
const provider = new JsonRpcProvider(process.env.NEXT_PUBLIC_AVALANCHE_RPC_URL);
try {
  if (Number((await provider.getNetwork()).chainId) !== 43113) throw new Error("Refusing deployment: chain is not Avalanche Fuji (43113).");
  const owner = new Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);
  const { contracts } = compileZkEmailContracts();
  const verifier = await new ContractFactory(contracts.SP1Verifier.abi, `0x${contracts.SP1Verifier.evm.bytecode.object}`, owner).deploy();
  const verifierReceipt = await verifier.deploymentTransaction().wait(1);
  if (verifierReceipt?.status !== 1) throw new Error("SP1 verifier deployment failed.");
  const zkEmail = await new ContractFactory(contracts.UniPassZkEmailV1.abi, `0x${contracts.UniPassZkEmailV1.evm.bytecode.object}`, owner).deploy(owner.address, await verifier.getAddress(), programVKey);
  const zkEmailReceipt = await zkEmail.deploymentTransaction().wait(1);
  if (zkEmailReceipt?.status !== 1) throw new Error("UniPassZkEmailV1 deployment failed.");
  const deployment = { chainId: 43113, sp1Verifier: await verifier.getAddress(), zkEmail: await zkEmail.getAddress(), programVKey, owner: owner.address, txs: { sp1Verifier: verifierReceipt.hash, zkEmail: zkEmailReceipt.hash }, deployBlock: zkEmailReceipt.blockNumber };
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, `${JSON.stringify(deployment, null, 2)}\n`, { flag: process.argv.includes("--force") ? "w" : "wx" });
  console.log(JSON.stringify(deployment, null, 2));
} finally { provider.destroy(); }

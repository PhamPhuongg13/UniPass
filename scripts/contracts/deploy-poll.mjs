import fs from "node:fs";
import path from "node:path";
import { ContractFactory, JsonRpcProvider, Wallet, getAddress } from "ethers";
import { compileV2Contracts } from "./compile-v2.mjs";
const outputFile = path.join(process.cwd(), "deployments", "fuji-poll.json");
if (fs.existsSync(outputFile) && !process.argv.includes("--force")) throw new Error("deployments/fuji-poll.json already exists. Review before using --force.");
const { POLL_RELAYER_PRIVATE_KEY, REGISTRATION_ISSUER_ADDRESS, NEXT_PUBLIC_AVALANCHE_RPC_URL } = process.env;
if (!POLL_RELAYER_PRIVATE_KEY || !REGISTRATION_ISSUER_ADDRESS || !NEXT_PUBLIC_AVALANCHE_RPC_URL) throw new Error("Set POLL_RELAYER_PRIVATE_KEY, REGISTRATION_ISSUER_ADDRESS and NEXT_PUBLIC_AVALANCHE_RPC_URL.");
const provider = new JsonRpcProvider(NEXT_PUBLIC_AVALANCHE_RPC_URL);
try {
  if (Number((await provider.getNetwork()).chainId) !== 43113) throw new Error("Refusing deployment: chain is not Avalanche Fuji (43113).");
  const owner = new Wallet(POLL_RELAYER_PRIVATE_KEY, provider);
  const issuer = getAddress(REGISTRATION_ISSUER_ADDRESS);
  const artifact = compileV2Contracts().contracts.UniPassPollV1;
  const poll = await new ContractFactory(artifact.abi, `0x${artifact.evm.bytecode.object}`, owner).deploy(owner.address, issuer);
  const receipt = await poll.deploymentTransaction().wait(1);
  if (!receipt || receipt.status !== 1 || (await poll.issuer()).toLowerCase() !== issuer.toLowerCase()) throw new Error("Poll deployment verification failed.");
  const deployment = { chainId: 43113, poll: await poll.getAddress(), owner: owner.address, issuer, deployBlock: receipt.blockNumber, txHash: receipt.hash };
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, `${JSON.stringify(deployment, null, 2)}\n`, { flag: process.argv.includes("--force") ? "w" : "wx" });
  console.log(JSON.stringify(deployment, null, 2));
} finally { provider.destroy(); }

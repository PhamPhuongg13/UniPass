import fs from "node:fs";
import path from "node:path";
import { ContractFactory, JsonRpcProvider, Wallet, getAddress, parseUnits } from "ethers";
import { compileV2Contracts } from "./compile-v2.mjs";
const outputFile = path.join(process.cwd(), "deployments", "fuji-programs.json");
if (fs.existsSync(outputFile) && !process.argv.includes("--force")) throw new Error("deployments/fuji-programs.json already exists. Review before using --force.");
const { POLL_RELAYER_PRIVATE_KEY, REGISTRATION_ISSUER_ADDRESS, NEXT_PUBLIC_AVALANCHE_RPC_URL } = process.env;
if (!POLL_RELAYER_PRIVATE_KEY || !REGISTRATION_ISSUER_ADDRESS || !NEXT_PUBLIC_AVALANCHE_RPC_URL) throw new Error("Set POLL_RELAYER_PRIVATE_KEY, REGISTRATION_ISSUER_ADDRESS and NEXT_PUBLIC_AVALANCHE_RPC_URL.");
const provider = new JsonRpcProvider(NEXT_PUBLIC_AVALANCHE_RPC_URL);
try {
  if (Number((await provider.getNetwork()).chainId) !== 43113) throw new Error("Refusing deployment: chain is not Avalanche Fuji (43113).");
  const owner = new Wallet(POLL_RELAYER_PRIVATE_KEY, provider);
  const issuer = getAddress(REGISTRATION_ISSUER_ADDRESS);
  const { contracts } = compileV2Contracts();
  const token = await new ContractFactory(contracts.UniPassTestUSDC.abi, `0x${contracts.UniPassTestUSDC.evm.bytecode.object}`, owner).deploy(owner.address);
  const tokenReceipt = await token.deploymentTransaction().wait(1);
  if (!tokenReceipt || tokenReceipt.status !== 1) throw new Error("Token deployment failed.");
  const programs = await new ContractFactory(contracts.UniPassProgramsV1.abi, `0x${contracts.UniPassProgramsV1.evm.bytecode.object}`, owner).deploy(owner.address, issuer, await token.getAddress());
  const programReceipt = await programs.deploymentTransaction().wait(1);
  if (!programReceipt || programReceipt.status !== 1) throw new Error("Programs deployment failed.");
  const mintTx = await token.mint(await programs.getAddress(), parseUnits("1000000", 6));
  const mintReceipt = await mintTx.wait(1);
  if (!mintReceipt || mintReceipt.status !== 1 || (await token.balanceOf(await programs.getAddress())) !== parseUnits("1000000", 6) || String(await programs.issuer()).toLowerCase() !== issuer.toLowerCase()) throw new Error("Funding or issuer verification failed.");
  const deployment = { chainId: 43113, tUSDC: await token.getAddress(), programs: await programs.getAddress(), owner: owner.address, issuer, tokenTx: tokenReceipt.hash, programTx: programReceipt.hash, mintTx: mintReceipt.hash, deployBlock: programReceipt.blockNumber };
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, `${JSON.stringify(deployment, null, 2)}\n`, { flag: process.argv.includes("--force") ? "w" : "wx" });
  console.log(JSON.stringify(deployment, null, 2));
} finally { provider.destroy(); }

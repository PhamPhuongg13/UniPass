import fs from "node:fs";
import path from "node:path";
import { ContractFactory, JsonRpcProvider, Wallet, getAddress } from "ethers";
import { compileV2Contracts } from "./compile-v2.mjs";

const outputFile = path.join(process.cwd(), "deployments", "fuji-v2.json");
if (fs.existsSync(outputFile) && !process.argv.includes("--force")) throw new Error("deployments/fuji-v2.json already exists. Review it before using --force.");
const { DEPLOYER_PRIVATE_KEY, REGISTRATION_ISSUER_ADDRESS, NEXT_PUBLIC_AVALANCHE_RPC_URL } = process.env;
if (!DEPLOYER_PRIVATE_KEY || !REGISTRATION_ISSUER_ADDRESS || !NEXT_PUBLIC_AVALANCHE_RPC_URL) throw new Error("Set DEPLOYER_PRIVATE_KEY, REGISTRATION_ISSUER_ADDRESS and NEXT_PUBLIC_AVALANCHE_RPC_URL.");
const issuer = getAddress(REGISTRATION_ISSUER_ADDRESS);
const provider = new JsonRpcProvider(NEXT_PUBLIC_AVALANCHE_RPC_URL);
try {
  const network = await provider.getNetwork();
  if (Number(network.chainId) !== 43113) throw new Error("Refusing deployment: connected chain is not Avalanche Fuji (43113).");
  const deployer = new Wallet(DEPLOYER_PRIVATE_KEY, provider);
  const { contracts } = compileV2Contracts();
  const managerFactory = new ContractFactory(contracts.UniPassEventManagerV2.abi, `0x${contracts.UniPassEventManagerV2.evm.bytecode.object}`, deployer);
  const manager = await managerFactory.deploy(deployer.address, issuer);
  const managerReceipt = await manager.deploymentTransaction().wait(1);
  if (!managerReceipt || managerReceipt.status !== 1) throw new Error("Manager deployment failed.");
  const managerAddress = await manager.getAddress();
  const ticketFactory = new ContractFactory(contracts.UniPassTicketV2.abi, `0x${contracts.UniPassTicketV2.evm.bytecode.object}`, deployer);
  const ticket = await ticketFactory.deploy(managerAddress);
  const ticketReceipt = await ticket.deploymentTransaction().wait(1);
  if (!ticketReceipt || ticketReceipt.status !== 1) throw new Error("Ticket deployment failed.");
  const ticketAddress = await ticket.getAddress();
  const configure = await manager.setTicketContract(ticketAddress);
  const configureReceipt = await configure.wait(1);
  if (!configureReceipt || configureReceipt.status !== 1) throw new Error("Ticket configuration failed.");
  if ((await manager.ticketContract()).toLowerCase() !== ticketAddress.toLowerCase() || (await manager.registrationIssuer()).toLowerCase() !== issuer.toLowerCase()) throw new Error("Deployment verification failed.");
  const deployment = { chainId: 43113, manager: managerAddress, ticket: ticketAddress, deployBlock: managerReceipt.blockNumber, txs: { manager: managerReceipt.hash, ticket: ticketReceipt.hash, setTicketContract: configureReceipt.hash } };
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, `${JSON.stringify(deployment, null, 2)}\n`, { flag: process.argv.includes("--force") ? "w" : "wx" });
  console.log(JSON.stringify(deployment, null, 2));
} finally { provider.destroy(); }

import fs from "node:fs";
import path from "node:path";
import { Contract, ContractFactory, JsonRpcProvider, Wallet, getAddress, isHexString, ZeroAddress } from "ethers";
import { compileIcmContracts } from "./compile-icm.mjs";
const TELEPORTER = "0x253b2784c75e510dD0fF1da844684a1aC0aa5fcf";
const FUJI_ID = "0x7fc93d85c6d62c5b2ac0b519c87010ea5294012d1e407030d6acd0021cac10d5";
const outputFile = path.join(process.cwd(), "deployments", "icm.json");
if (fs.existsSync(outputFile) && !process.argv.includes("--force")) throw new Error("deployments/icm.json exists. Review it before using --force.");
const { DEPLOYER_PRIVATE_KEY, NEXT_PUBLIC_AVALANCHE_RPC_URL, L1_RPC_URL, L1_BLOCKCHAIN_ID, POLL_RELAYER_ADDRESS, REGISTRATION_ISSUER_ADDRESS, NEXT_PUBLIC_ZKEMAIL_ADDRESS } = process.env;
if (!DEPLOYER_PRIVATE_KEY || !NEXT_PUBLIC_AVALANCHE_RPC_URL || !L1_RPC_URL || !isHexString(L1_BLOCKCHAIN_ID ?? "", 32) || !POLL_RELAYER_ADDRESS || !REGISTRATION_ISSUER_ADDRESS) throw new Error("Set DEPLOYER_PRIVATE_KEY, NEXT_PUBLIC_AVALANCHE_RPC_URL, L1_RPC_URL, L1_BLOCKCHAIN_ID, POLL_RELAYER_ADDRESS, REGISTRATION_ISSUER_ADDRESS.");
const fuji = new JsonRpcProvider(NEXT_PUBLIC_AVALANCHE_RPC_URL);
const l1 = new JsonRpcProvider(L1_RPC_URL);
try {
  const [fujiNetwork, l1Network, fujiCode, l1Code] = await Promise.all([fuji.getNetwork(), l1.getNetwork(), fuji.getCode(TELEPORTER), l1.getCode(TELEPORTER)]);
  if (Number(fujiNetwork.chainId) !== 43113 || fujiCode === "0x" || l1Code === "0x") throw new Error("Wrong Fuji chain or TeleporterMessenger missing on either chain.");
  const messengerAbi = ["function blockchainID() view returns (bytes32)"];
  const [fujiId, l1Id] = await Promise.all([new Contract(TELEPORTER, messengerAbi, fuji).blockchainID(), new Contract(TELEPORTER, messengerAbi, l1).blockchainID()]);
  if (String(fujiId).toLowerCase() !== FUJI_ID || String(l1Id).toLowerCase() !== L1_BLOCKCHAIN_ID.toLowerCase()) throw new Error("Teleporter blockchainID mismatch.");
  const ownerFuji = new Wallet(DEPLOYER_PRIVATE_KEY, fuji), ownerL1 = new Wallet(DEPLOYER_PRIVATE_KEY, l1);
  const { contracts } = compileIcmContracts();
  async function deploy(name, signer, args) { const c = await new ContractFactory(contracts[name].abi, `0x${contracts[name].evm.bytecode.object}`, signer).deploy(...args); const r = await c.deploymentTransaction().wait(1); if (!r || r.status !== 1) throw new Error(`${name} deployment failed`); console.log(`${name}: ${await c.getAddress()} tx ${r.hash}`); return c; }
  async function wire(label, tx) { const r = await tx.wait(1); if (!r || r.status !== 1) throw new Error(`${label} failed`); console.log(`${label}: ${r.hash}`); return r.hash; }
  const bridge = await deploy("UniPassPassportBridgeV1", ownerFuji, [ownerFuji.address, TELEPORTER, getAddress(REGISTRATION_ISSUER_ADDRESS), NEXT_PUBLIC_ZKEMAIL_ADDRESS ? getAddress(NEXT_PUBLIC_ZKEMAIL_ADDRESS) : ZeroAddress]);
  const mirror = await deploy("UniPassPassportMirrorV1", ownerL1, [ownerL1.address, TELEPORTER, FUJI_ID]);
  const quest = await deploy("CampusQuestL1", ownerL1, [ownerL1.address, TELEPORTER, await mirror.getAddress(), FUJI_ID, getAddress(POLL_RELAYER_ADDRESS)]);
  const routeTx = await wire("Bridge route", await bridge.setRoute(L1_BLOCKCHAIN_ID, await mirror.getAddress(), await quest.getAddress()));
  const mirrorTx = await wire("Mirror bridge", await mirror.setBridge(await bridge.getAddress()));
  const questTx = await wire("Quest Fuji bridge", await quest.setFujiBridge(await bridge.getAddress()));
  const deployment = { fujiChainId: 43113, l1ChainId: Number(l1Network.chainId), l1BlockchainID: L1_BLOCKCHAIN_ID, fujiBlockchainID: FUJI_ID, teleporter: TELEPORTER, bridge: await bridge.getAddress(), mirror: await mirror.getAddress(), quest: await quest.getAddress(), issuer: getAddress(REGISTRATION_ISSUER_ADDRESS), relayer: getAddress(POLL_RELAYER_ADDRESS), routeTx, mirrorTx, questTx };
  fs.mkdirSync(path.dirname(outputFile), { recursive: true }); fs.writeFileSync(outputFile, `${JSON.stringify(deployment, null, 2)}\n`, { flag: process.argv.includes("--force") ? "w" : "wx" });
  console.log(`NEXT_PUBLIC_L1_CHAIN_ID=${deployment.l1ChainId}\nNEXT_PUBLIC_PASSPORT_BRIDGE_ADDRESS=${deployment.bridge}\nL1_MIRROR_ADDRESS=${deployment.mirror}\nL1_QUEST_ADDRESS=${deployment.quest}\nL1_BLOCKCHAIN_ID=${deployment.l1BlockchainID}`);
} finally { fuji.destroy(); l1.destroy(); }

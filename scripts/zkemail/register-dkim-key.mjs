import fs from "node:fs";
import { resolveTxt } from "node:dns/promises";
import { Contract, JsonRpcProvider, Wallet, getAddress } from "ethers";
import { dkimPFromTxt, dkimPublicKeyHash } from "../../src/lib/zkemail/dkim-key-hash.mjs";
import { compileZkEmailContracts } from "../contracts/compile-zkemail.mjs";
import { execSafeTx, safeOwnerWallets } from "../safe/lib.mjs";

const [domain, selector] = process.argv.slice(2).filter(arg => !arg.startsWith("--"));
if (!domain || !selector || !/^[a-z0-9.-]+\.edu\.vn$/.test(domain) || !/^[a-z0-9-]+$/.test(selector)) throw new Error("Usage: register-dkim-key.mjs <domain.edu.vn> <selector> [--dry-run]");
const records = (await resolveTxt(`${selector}._domainkey.${domain}`)).map(chunks => chunks.join(""));
const record = records.find(item => /(?:^|;)\s*p\s*=/.test(item));
if (!record) throw new Error("No DKIM key TXT record found.");
const hash = dkimPublicKeyHash(dkimPFromTxt(record));
console.log(`${selector}._domainkey.${domain}: ${hash}`);
if (!process.argv.includes("--dry-run")) {
  const rpc = process.env.NEXT_PUBLIC_AVALANCHE_RPC_URL;
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!rpc || !privateKey) throw new Error("Set NEXT_PUBLIC_AVALANCHE_RPC_URL and DEPLOYER_PRIVATE_KEY.");
  const deployment = fs.existsSync("deployments/fuji-zkemail.json") ? JSON.parse(fs.readFileSync("deployments/fuji-zkemail.json", "utf8")) : null;
  const address = process.env.NEXT_PUBLIC_ZKEMAIL_ADDRESS || deployment?.zkEmail;
  if (!address) throw new Error("Set NEXT_PUBLIC_ZKEMAIL_ADDRESS or deploy first.");
  const provider = new JsonRpcProvider(rpc);
  try {
    if (Number((await provider.getNetwork()).chainId) !== 43113) throw new Error("Refusing registration: chain is not Fuji.");
    const { contracts } = compileZkEmailContracts();
    const contract = new Contract(getAddress(address), contracts.UniPassZkEmailV1.abi, new Wallet(privateKey, provider));
    const owner = getAddress(await contract.owner());
    const safe = fs.existsSync("deployments/safe.json") ? JSON.parse(fs.readFileSync("deployments/safe.json", "utf8")).safe?.address : null;
    if (safe && owner.toLowerCase() === safe.toLowerCase()) {
      const owners = safeOwnerWallets(provider);
      const txHash = await execSafeTx(safe, { to: address, data: contract.interface.encodeFunctionData("setDkimKey", [domain, hash, true]) }, owners.slice(0, 2), owners[0]);
      console.log(`Registered through Safe: ${txHash}`);
    } else {
      if (owner.toLowerCase() !== new Wallet(privateKey).address.toLowerCase()) throw new Error("zkEmail owner is neither deployer nor configured Safe");
      const tx = await contract.setDkimKey(domain, hash, true);
      const receipt = await tx.wait(1);
      if (receipt?.status !== 1) throw new Error("DKIM registration failed.");
      console.log(`Registered: ${receipt.hash}`);
    }
  } finally { provider.destroy(); }
}

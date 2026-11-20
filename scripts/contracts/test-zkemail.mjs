import fs from "node:fs";
import { createHash } from "node:crypto";
import { Contract, JsonRpcProvider, Wallet, getAddress } from "ethers";
import { compileZkEmailContracts } from "./compile-zkemail.mjs";

const fixture = JSON.parse(fs.readFileSync("scripts/zkemail/fixtures/vnu-proof-v2.json", "utf8"));
const deployment = JSON.parse(fs.readFileSync("deployments/fuji-zkemail.json", "utf8"));
const rpc = process.env.NEXT_PUBLIC_AVALANCHE_RPC_URL;
const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
if (!rpc || !privateKey) throw new Error("Set NEXT_PUBLIC_AVALANCHE_RPC_URL and DEPLOYER_PRIVATE_KEY.");
const provider = new JsonRpcProvider(rpc);
const flipLastByte = hex => `${hex.slice(0, -2)}${(Number.parseInt(hex.slice(-2), 16) ^ 1).toString(16).padStart(2, "0")}`;
async function expectRevert(action, label) { try { await action(); throw new Error(`${label} unexpectedly succeeded.`); } catch (cause) { if (String(cause).includes("unexpectedly succeeded")) throw cause; } }
try {
  if (Number((await provider.getNetwork()).chainId) !== 43113) throw new Error("Not on Fuji.");
  const wallet = new Wallet(privateKey, provider);
  const { contracts } = compileZkEmailContracts();
  const contract = new Contract(getAddress(process.env.NEXT_PUBLIC_ZKEMAIL_ADDRESS || deployment.zkEmail), contracts.UniPassZkEmailV1.abi, wallet);
  const allowed = await contract.isDkimKeyAllowed(fixture.expected.fromDomainHash, fixture.expected.publicKeyHash);
  if (!allowed[0] || allowed[1] !== fixture.expected.fromDomain) throw new Error("Register the vnu.edu.vn DKIM key before testing.");
  const otherHash = `0x${createHash("sha256").update("hcmus.edu.vn").digest("hex")}`;
  if ((await contract.isDkimKeyAllowed(otherHash, fixture.expected.publicKeyHash))[0]) throw new Error("Unexpected hcmus.edu.vn key registration.");
  const domain = await contract.proveStudentEmail.staticCall(fixture.publicValues, fixture.proof);
  if (domain !== "vnu.edu.vn") throw new Error("Wrong school domain.");
  await expectRevert(() => contract.proveStudentEmail.staticCall(flipLastByte(fixture.publicValues), fixture.proof), "altered public values");
  await expectRevert(() => contract.proveStudentEmail.staticCall(fixture.publicValues, flipLastByte(fixture.proof)), "altered proof");
  console.log("Static checks passed: real proof accepted (vnu.edu.vn), altered public values and altered proof rejected.");
  // The fixture is the same proof zk.email returns for the demo email, so sending it would burn the live demo.
  if (!process.argv.includes("--send")) { console.log("Skipping the real transaction (pass --send to use up the fixture proof)."); process.exit(0); }
  const tx = await contract.proveStudentEmail(fixture.publicValues, fixture.proof);
  const receipt = await tx.wait(1);
  if (receipt?.status !== 1) throw new Error("Proof transaction failed.");
  const event = receipt.logs.map(log => { try { return contract.interface.parseLog(log); } catch { return null; } }).find(log => log?.name === "StudentEmailProven");
  if (!event || event.args.wallet.toLowerCase() !== wallet.address.toLowerCase() || event.args.domain !== "vnu.edu.vn") throw new Error("StudentEmailProven event missing or wrong.");
  try { await contract.proveStudentEmail.staticCall(fixture.publicValues, fixture.proof); throw new Error("Used proof unexpectedly succeeded."); }
  catch (cause) {
    if (String(cause).includes("unexpectedly succeeded")) throw cause;
    const data = cause?.data || cause?.error?.data;
    if (contract.interface.parseError(data)?.name !== "ProofAlreadyUsed") throw new Error("Second send did not revert with ProofAlreadyUsed.");
  }
  console.log(`StudentEmailProven tx: ${receipt.hash}`);
} finally { provider.destroy(); }

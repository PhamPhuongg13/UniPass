import { Contract, JsonRpcProvider, Wallet } from "ethers";
import { compileV2Contracts } from "../contracts/compile-v2.mjs";
import { deriveEmailNullifier, deriveEventNullifier, getNullifierSecret, normalizeStudentEmail } from "../../src/lib/eligibility/nullifier.mjs";
import { signRegistrationAuthorization } from "../../src/lib/contracts/registration-authorization.mjs";

const required = ["UNIPASS_REGISTRATION_ISSUER_PRIVATE_KEY", "EMAIL_NULLIFIER_SECRET", "DEMO_STUDENT_EMAIL", "DEMO_WALLET_A_PRIVATE_KEY", "DEMO_WALLET_B_PRIVATE_KEY", "DEMO_EVENT_ID", "NEXT_PUBLIC_EVENT_MANAGER_ADDRESS", "NEXT_PUBLIC_AVALANCHE_RPC_URL"];
for (const name of required) if (!process.env[name]) throw new Error(`Set ${name} before running the duplicate attempt.`);
const provider = new JsonRpcProvider(process.env.NEXT_PUBLIC_AVALANCHE_RPC_URL);
try {
  if (Number((await provider.getNetwork()).chainId) !== 43113) throw new Error("Fuji (43113) required.");
  const issuer = new Wallet(process.env.UNIPASS_REGISTRATION_ISSUER_PRIVATE_KEY);
  const walletA = new Wallet(process.env.DEMO_WALLET_A_PRIVATE_KEY, provider);
  const walletB = new Wallet(process.env.DEMO_WALLET_B_PRIVATE_KEY, provider);
  const managerAddress = process.env.NEXT_PUBLIC_EVENT_MANAGER_ADDRESS;
  const { contracts } = compileV2Contracts();
  const manager = new Contract(managerAddress, contracts.UniPassEventManagerV2.abi, provider);
  if (String(await manager.registrationIssuer()).toLowerCase() !== issuer.address.toLowerCase()) throw new Error("Issuer key does not match Fuji manager.");
  const emailNullifier = deriveEmailNullifier(getNullifierSecret(), normalizeStudentEmail(process.env.DEMO_STUDENT_EMAIL));
  const studentNullifier = deriveEventNullifier(getNullifierSecret(), emailNullifier, { chainId: 43113, manager: managerAddress, eventId: process.env.DEMO_EVENT_ID });
  async function authorization(wallet) { return signRegistrationAuthorization(issuer.privateKey, { wallet: wallet.address, eventId: process.env.DEMO_EVENT_ID, verifyingContract: managerAddress, studentNullifier }); }
  const first = await authorization(walletA);
  const firstTx = await manager.connect(walletA).registerEvent(first.authorization, first.signature);
  const firstReceipt = await firstTx.wait(1);
  if (!firstReceipt || firstReceipt.status !== 1) throw new Error("First registration failed.");
  console.log(`First registration tx: ${firstTx.hash}`);
  const second = await authorization(walletB);
  const secondTx = await manager.connect(walletB).registerEvent(second.authorization, second.signature, { gasLimit: 500_000 });
  console.log(`Second registration tx: ${secondTx.hash}`);
  try { await secondTx.wait(1); throw new Error("Unexpected success: second wallet received a ticket."); }
  catch (cause) { if (cause?.receipt?.status !== 0) throw cause; }
  console.log("Second transaction reverted on Fuji as expected: Student already registered.");
} finally { provider.destroy(); }

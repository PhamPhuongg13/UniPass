import { Contract, Interface, JsonRpcProvider, Wallet, getAddress, keccak256, toUtf8Bytes, randomBytes, hexlify, isHexString, zeroPadValue } from "ethers";
import { compileIcmContracts } from "./compile-icm.mjs";
import { claimMessage } from "../../src/lib/icm/quest-message.mjs";
const FUJI_ID = "0x7fc93d85c6d62c5b2ac0b519c87010ea5294012d1e407030d6acd0021cac10d5";
const { DEPLOYER_PRIVATE_KEY, UNIPASS_REGISTRATION_ISSUER_PRIVATE_KEY, POLL_RELAYER_PRIVATE_KEY, NEXT_PUBLIC_AVALANCHE_RPC_URL, L1_RPC_URL, L1_BLOCKCHAIN_ID, NEXT_PUBLIC_PASSPORT_BRIDGE_ADDRESS, L1_MIRROR_ADDRESS, L1_QUEST_ADDRESS } = process.env;
if ([DEPLOYER_PRIVATE_KEY, UNIPASS_REGISTRATION_ISSUER_PRIVATE_KEY, POLL_RELAYER_PRIVATE_KEY, NEXT_PUBLIC_AVALANCHE_RPC_URL, L1_RPC_URL, NEXT_PUBLIC_PASSPORT_BRIDGE_ADDRESS, L1_MIRROR_ADDRESS, L1_QUEST_ADDRESS].some(x => !x) || !isHexString(L1_BLOCKCHAIN_ID ?? "", 32)) throw new Error("Set deployment addresses, RPC URLs, L1_BLOCKCHAIN_ID, DEPLOYER_PRIVATE_KEY, UNIPASS_REGISTRATION_ISSUER_PRIVATE_KEY, POLL_RELAYER_PRIVATE_KEY.");
const fuji = new JsonRpcProvider(NEXT_PUBLIC_AVALANCHE_RPC_URL), l1 = new JsonRpcProvider(L1_RPC_URL);
const student = new Wallet(DEPLOYER_PRIVATE_KEY, fuji), issuer = new Wallet(UNIPASS_REGISTRATION_ISSUER_PRIVATE_KEY), relayer = new Wallet(POLL_RELAYER_PRIVATE_KEY, l1);
const { contracts } = compileIcmContracts();
const bridge = new Contract(NEXT_PUBLIC_PASSPORT_BRIDGE_ADDRESS, contracts.UniPassPassportBridgeV1.abi, student);
const mirror = new Contract(L1_MIRROR_ADDRESS, contracts.UniPassPassportMirrorV1.abi, l1);
const quest = new Contract(L1_QUEST_ADDRESS, contracts.CampusQuestL1.abi, relayer);
const types = { PassportAttestation: [{ name: "wallet", type: "address" }, { name: "schoolHash", type: "bytes32" }, { name: "expiresAt", type: "uint64" }, { name: "nonce", type: "uint64" }, { name: "deadline", type: "uint64" }] };
async function expectRevert(label, fn) { try { await fn(); throw new Error(`${label} unexpectedly succeeded`); } catch (e) { if (e.code !== "CALL_EXCEPTION" && !/revert/i.test(String(e.message))) throw e; console.log(`${label}: reverted as expected`); } }
async function printDelivery(label, provider, address, abi, event, wallet) {
  const topic = new Interface(abi).getEvent(event).topicHash;
  const tip = await provider.getBlockNumber();
  for (let end = tip; end >= Math.max(0, tip - 3999); end -= 2000) {
    const logs = await provider.getLogs({ address, topics: [topic, zeroPadValue(wallet, 32)], fromBlock: Math.max(0, end - 1999), toBlock: end });
    if (logs.length) { console.log(`${label}: ${logs.at(-1).transactionHash}`); return; }
  }
  console.log(`${label}: event not in recent log window`);
}
async function waitFor(label, read) { for (let elapsed = 0; elapsed <= 180; elapsed += 3) { if (await read()) { console.log(`${label}: ${elapsed}s`); return; } console.log(`${label}: waiting ${elapsed}s`); if (elapsed < 180) await new Promise(resolve => setTimeout(resolve, 3000)); } throw new Error(`${label} not delivered within 180 s`); }
try {
  if (Number((await fuji.getNetwork()).chainId) !== 43113) throw new Error("Wrong Fuji chain");
  const now = Math.floor(Date.now() / 1000), l1ChainId = Number((await l1.getNetwork()).chainId);
  const a = { wallet: student.address, schoolHash: keccak256(toUtf8Bytes("example.edu.vn")), expiresAt: now + 3600, nonce: BigInt(hexlify(randomBytes(8))), deadline: now + 600 };
  const domain = { name: "UniPassPassportBridge", version: "1", chainId: 43113, verifyingContract: getAddress(NEXT_PUBLIC_PASSPORT_BRIDGE_ADDRESS) };
  const sig = await issuer.signTypedData(domain, types, a);
  const wrongIssuerSig = await Wallet.createRandom().signTypedData(domain, types, a);
  await expectRevert("Bad signer", () => bridge.sendPassport.staticCall(L1_BLOCKCHAIN_ID, a, wrongIssuerSig));
  const send = await bridge.sendPassport(L1_BLOCKCHAIN_ID, a, sig); console.log(`Fuji passport tx: ${send.hash}`); await send.wait(1);
  await expectRevert("Replayed nonce", () => bridge.sendPassport.staticCall(L1_BLOCKCHAIN_ID, a, sig));
  await waitFor("L1 passport", async () => { const p = await mirror.passportOf(student.address); return p.schoolHash.toLowerCase() === a.schoolHash.toLowerCase() && p.expiresAt === BigInt(a.expiresAt); });
  await printDelivery("L1 passport delivery tx", l1, L1_MIRROR_ADDRESS, contracts.UniPassPassportMirrorV1.abi, "PassportMirrored", student.address);
  const deadline = Math.floor(Date.now() / 1000) + 600;
  const message = claimMessage(student.address, 1, l1ChainId, L1_QUEST_ADDRESS, deadline);
  const questSig = await student.signMessage(message);
  const outsider = Wallet.createRandom(); const outsiderSig = await outsider.signMessage(claimMessage(outsider.address, 1, l1ChainId, L1_QUEST_ADDRESS, deadline));
  await expectRevert("Non-student", () => quest.claimFor.staticCall(outsider.address, 1, deadline, outsiderSig));
  const claim = await quest.claimFor(student.address, 1, deadline, questSig); console.log(`L1 quest tx: ${claim.hash}`); await claim.wait(1);
  await waitFor("Fuji stamp", async () => (await bridge.l1StampOf(student.address, L1_BLOCKCHAIN_ID, 1)) > 0n);
  await printDelivery("Fuji stamp delivery tx", fuji, NEXT_PUBLIC_PASSPORT_BRIDGE_ADDRESS, contracts.UniPassPassportBridgeV1.abi, "L1StampReceived", student.address);
  console.log(`Fuji stamp recorded for ${student.address}; source ${L1_BLOCKCHAIN_ID}; Fuji ID ${FUJI_ID}`);
} finally { fuji.destroy(); l1.destroy(); }

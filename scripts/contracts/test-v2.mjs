import assert from "node:assert/strict";
import { AbiCoder, Interface, Wallet, id } from "ethers";
import { createCustomCommon, Hardfork, Mainnet } from "@ethereumjs/common";
import { createBlock } from "@ethereumjs/block";
import { createAccount, createAddressFromString, hexToBytes, bytesToHex } from "@ethereumjs/util";
import { createVM } from "@ethereumjs/vm";
import { compileV2Contracts } from "./compile-v2.mjs";
import { REGISTRATION_AUTH_TYPES, REGISTRATION_PURPOSE, REGISTRATION_DOMAIN_NAME, REGISTRATION_DOMAIN_VERSION } from "../../src/lib/contracts/registration-authorization.mjs";

const CHAIN_ID = 43113;
const GAS = 25_000_000n;
const { contracts } = compileV2Contracts();
const common = createCustomCommon({ chainId: CHAIN_ID, networkId: CHAIN_ID }, Mainnet, { hardfork: Hardfork.Cancun });
const vm = await createVM({ common });
let timestamp = BigInt(Math.floor(Date.now() / 1000));
let block = createBlock({ header: { number: 1n, timestamp, gasLimit: 30_000_000n, baseFeePerGas: 0n } }, { common, skipConsensusFormatValidation: true });
const coder = AbiCoder.defaultAbiCoder();
const keys = Array.from({ length: 8 }, () => Wallet.createRandom());
const [owner, issuer, organizer, student, otherStudent, staff, stranger, rotatedIssuer] = keys;
for (const wallet of keys) await vm.stateManager.putAccount(createAddressFromString(wallet.address), createAccount({ nonce: 0n, balance: 10n ** 25n }));

function assertNoRevert(result, label) {
  assert.equal(result.execResult.exceptionError, undefined, `${label}: ${result.execResult.exceptionError?.error}`);
}
async function call(contractAddress, caller, iface, functionName, args = []) {
  const result = await vm.evm.runCall({
    to: createAddressFromString(contractAddress), caller: createAddressFromString(caller), origin: createAddressFromString(caller),
    data: hexToBytes(iface.encodeFunctionData(functionName, args)), gasLimit: GAS, block,
  });
  return result;
}
async function send(contractAddress, caller, iface, functionName, args = [], label = functionName) {
  const result = await call(contractAddress, caller, iface, functionName, args);
  assertNoRevert(result, label);
  return result;
}
async function expectRevert(contractAddress, caller, iface, functionName, args = [], label = functionName, reason) {
  const result = await call(contractAddress, caller, iface, functionName, args);
  assert.ok(result.execResult.exceptionError, `${label}: expected EVM revert`);
  if (reason) assert.match(iface.parseError(bytesToHex(result.execResult.returnValue))?.args?.[0] ?? "", new RegExp(reason), label);
}
async function deploy(name, caller, constructorTypes, constructorValues) {
  const artifact = contracts[name];
  const constructorData = hexToBytes(coder.encode(constructorTypes, constructorValues));
  const initCode = Uint8Array.from([...hexToBytes(`0x${artifact.evm.bytecode.object}`), ...constructorData]);
  const result = await vm.evm.runCall({ caller: createAddressFromString(caller), origin: createAddressFromString(caller), data: initCode, gasLimit: GAS, block });
  assertNoRevert(result, `deploy ${name}`);
  const address = result.createdAddress?.toString() ?? [...(result.execResult.createdAddresses ?? [])][0];
  assert.ok(address, `${name} deployment address missing`);
  assert.ok((await vm.stateManager.getCode(createAddressFromString(address))).length > 0, `${name} deployed bytecode missing`);
  return { address, interface: new Interface(artifact.abi) };
}

const manager = await deploy("UniPassEventManagerV2", owner.address, ["address", "address"], [owner.address, issuer.address]);
const ticket = await deploy("UniPassTicketV2", owner.address, ["address"], [manager.address]);
await send(manager.address, owner.address, manager.interface, "setTicketContract", [ticket.address]);
await send(manager.address, owner.address, manager.interface, "setTicketBaseURI", ["https://tickets.example/v2/"]);

// The unsecured V1 selector does not exist on this contract.
const v1Selector = id("registerEvent(uint256)").slice(0, 10);
const direct = await vm.evm.runCall({ to: createAddressFromString(manager.address), caller: createAddressFromString(stranger.address), origin: createAddressFromString(stranger.address), data: hexToBytes(v1Selector), gasLimit: GAS, block });
assert.ok(direct.execResult.exceptionError, "direct V1-style registration must revert");

async function createEvent(capacity, organizerWallet = organizer) {
  const deadline = Number(timestamp + 3600n);
  const result = await send(manager.address, organizerWallet.address, manager.interface, "createEvent", [capacity, deadline], "createEvent");
  const log = result.execResult.logs?.find(entry => bytesToHex(entry[0]).toLowerCase() === manager.address.toLowerCase());
  const created = manager.interface.parseLog({ topics: log[1].map(bytesToHex), data: bytesToHex(log[2]) });
  return { id: BigInt(created.args.eventId), deadline };
}
async function authorization({ wallet = student, eventId, contract = manager.address, chainId = CHAIN_ID, expiresAt = Number(timestamp + 300n), purpose = REGISTRATION_PURPOSE, nonce = `0x${Buffer.from(Wallet.createRandom().privateKey.slice(2), "hex").toString("hex")}`, signer = issuer, studentNullifier = `0x${Buffer.from(Wallet.createRandom().privateKey.slice(2), "hex").toString("hex")}` } = {}) {
  const domain = { name: REGISTRATION_DOMAIN_NAME, version: REGISTRATION_DOMAIN_VERSION, chainId: CHAIN_ID, verifyingContract: contract };
  const value = { wallet: wallet.address, eventId: eventId.toString(), chainId, verifyingContract: contract, expiresAt, nonce, purpose, studentNullifier };
  return [value, await signer.signTypedData(domain, REGISTRATION_AUTH_TYPES, value)];
}
async function register(wallet, eventId, authOptions = {}) {
  const [value, signature] = await authorization({ wallet, eventId, ...authOptions });
  return { value, signature, result: await call(manager.address, wallet.address, manager.interface, "registerEvent", [value, signature]) };
}

// EIP-712 authorization; only an approved issuer can mint.
const one = await createEvent(1n);
await expectRevert(manager.address, student.address, manager.interface, "registerEvent", [{ wallet: student.address, eventId: one.id, chainId: CHAIN_ID, verifyingContract: manager.address, expiresAt: Number(timestamp + 300n), nonce: `0x${"00".repeat(32)}`, purpose: REGISTRATION_PURPOSE, studentNullifier: `0x${"11".repeat(32)}` }, "0x"], "forged/empty authorization");

for (const [label, values] of [
  ["wrong wallet", { wallet: otherStudent }],
  ["wrong chain", { chainId: 1 }],
  ["wrong contract", { contract: ticket.address }],
  ["expired authorization", { expiresAt: Number(timestamp - 1n) }],
  ["wrong purpose", { purpose: id("OTHER_PURPOSE") }],
  ["authorization lifetime too long", { expiresAt: Number(timestamp + 601n) }],
  ["wrong issuer", { signer: student }],
]) {
  const built = await register(student, one.id, values);
  assert.ok(built.result.execResult.exceptionError, `${label}: expected revert`);
}
{
  const otherEvent = await createEvent(1n);
  const [signedForOtherEvent, signature] = await authorization({ wallet: student, eventId: otherEvent.id });
  const mutatedForTargetEvent = { ...signedForOtherEvent, eventId: one.id.toString() };
  const result = await call(manager.address, student.address, manager.interface, "registerEvent", [mutatedForTargetEvent, signature]);
  assert.ok(result.execResult.exceptionError, "cross-event authorization reuse must revert");
}

const valid = await register(student, one.id);
assertNoRevert(valid.result, "valid registration");
const ticketId = BigInt(manager.interface.decodeFunctionResult("registerEvent", valid.result.execResult.returnValue)[0]);
assert.equal(String(await vm.evm.runCall({ to: createAddressFromString(ticket.address), caller: createAddressFromString(owner.address), origin: createAddressFromString(owner.address), data: hexToBytes(ticket.interface.encodeFunctionData("ownerOf", [ticketId])), gasLimit: GAS, block }).then(r => ticket.interface.decodeFunctionResult("ownerOf", r.execResult.returnValue)[0])).toLowerCase(), student.address.toLowerCase());
await expectRevert(ticket.address, student.address, ticket.interface, "transferFrom", [student.address, otherStudent.address, ticketId], "non-transferable NFT ticket");
assert.ok((await vm.evm.runCall({ to: createAddressFromString(ticket.address), caller: createAddressFromString(owner.address), origin: createAddressFromString(owner.address), data: hexToBytes(ticket.interface.encodeFunctionData("tokenURI", [ticketId])), gasLimit: GAS, block })).execResult.returnValue.length > 0, "NFT metadata URI should exist");
await expectRevert(manager.address, student.address, manager.interface, "registerEvent", [valid.value, valid.signature], "replayed authorization");
const duplicate = await register(student, one.id);
assert.ok(duplicate.result.execResult.exceptionError, "duplicate wallet/event registration must revert");
const soldOut = await register(otherStudent, one.id);
assert.ok(soldOut.result.execResult.exceptionError, "capacity must reject the next registration");

// One student identity is accepted once per event, even after switching wallets.
const duplicateEvent = await createEvent(3n);
const sharedNullifier = `0x${"ab".repeat(32)}`;
assertNoRevert((await register(student, duplicateEvent.id, { studentNullifier: sharedNullifier })).result, "first wallet with student nullifier");
const duplicateIdentity = await authorization({ wallet: otherStudent, eventId: duplicateEvent.id, studentNullifier: sharedNullifier });
await expectRevert(manager.address, otherStudent.address, manager.interface, "registerEvent", duplicateIdentity, "second wallet same student", "Student already registered");
const nextEvent = await createEvent(2n);
assertNoRevert((await register(otherStudent, nextEvent.id, { studentNullifier: sharedNullifier })).result, "same student on different event");
const zeroIdentity = await authorization({ wallet: otherStudent, eventId: duplicateEvent.id, studentNullifier: `0x${"00".repeat(32)}` });
await expectRevert(manager.address, otherStudent.address, manager.interface, "registerEvent", zeroIdentity, "zero student nullifier", "Invalid student nullifier");

// Unique authorization can be revoked; issuer rotation invalidates old signatures.
const revokeEvent = await createEvent(2n);
const [revokedAuth, revokedSig] = await authorization({ wallet: otherStudent, eventId: revokeEvent.id });
await send(manager.address, owner.address, manager.interface, "revokeAuthorization", [revokedAuth.nonce]);
await expectRevert(manager.address, otherStudent.address, manager.interface, "registerEvent", [revokedAuth, revokedSig], "revoked authorization");
const [rotatedAuth, rotatedSig] = await authorization({ wallet: otherStudent, eventId: revokeEvent.id });
await send(manager.address, owner.address, manager.interface, "setRegistrationIssuer", [rotatedIssuer.address]);
await expectRevert(manager.address, otherStudent.address, manager.interface, "registerEvent", [rotatedAuth, rotatedSig], "old issuer after rotation");
await send(manager.address, owner.address, manager.interface, "setRegistrationIssuer", [issuer.address]);

// Event-scoped staff privileges are revocable and the ticket can only check in once.
const staffEvent = await createEvent(2n);
const staffTicket = await register(otherStudent, staffEvent.id);
assertNoRevert(staffTicket.result, "staff test ticket registration");
const staffTokenId = BigInt(manager.interface.decodeFunctionResult("registerEvent", staffTicket.result.execResult.returnValue)[0]);
await expectRevert(manager.address, stranger.address, manager.interface, "checkInStudent", [staffTokenId], "unauthorized staff check-in");
await expectRevert(manager.address, staff.address, manager.interface, "checkInStudent", [staffTokenId], "unassigned staff check-in");
await send(manager.address, organizer.address, manager.interface, "setEventStaff", [staffEvent.id, staff.address, true]);
const staffCheckin = await send(manager.address, staff.address, manager.interface, "checkInStudent", [staffTokenId], "authorized staff check-in");
const checked = await call(ticket.address, owner.address, ticket.interface, "checkedIn", [staffTokenId]);
assert.equal(ticket.interface.decodeFunctionResult("checkedIn", checked.execResult.returnValue)[0], true);
await expectRevert(manager.address, staff.address, manager.interface, "checkInStudent", [staffTokenId], "duplicate check-in");
await send(manager.address, organizer.address, manager.interface, "setEventStaff", [staffEvent.id, staff.address, false]);
const secondStaffTicket = await register(student, staffEvent.id);
assertNoRevert(secondStaffTicket.result, "second ticket for revoked staff test");
const secondTokenId = BigInt(manager.interface.decodeFunctionResult("registerEvent", secondStaffTicket.result.execResult.returnValue)[0]);
await expectRevert(manager.address, staff.address, manager.interface, "checkInStudent", [secondTokenId], "revoked staff check-in");
await expectRevert(manager.address, stranger.address, manager.interface, "setEventStaff", [staffEvent.id, stranger.address, true], "non-organizer staff assignment");

console.log("Local EVM tests passed: unauthorized selector, valid registration/mint/ownership/metadata, blocked ticket transfer, forged/wrong-wallet/wrong-chain/wrong-contract/wrong-event/expired/wrong-purpose/wrong-issuer/revoked/replayed authorization, duplicate wallet/capacity, same-nullifier second-wallet rejection, cross-event nullifier reuse, zero-nullifier rejection, issuer rotation, organizer-only staff assignment, staff grant/revoke, successful and duplicate check-in.");

import assert from "node:assert/strict";
import { AbiCoder, Interface, Wallet, id } from "ethers";
import { createCustomCommon, Hardfork, Mainnet } from "@ethereumjs/common";
import { createBlock } from "@ethereumjs/block";
import { createAccount, createAddressFromString, hexToBytes, bytesToHex } from "@ethereumjs/util";
import { createVM } from "@ethereumjs/vm";
import { compileV2Contracts } from "./compile-v2.mjs";
import { POLL_PURPOSE, VOTE_AUTH_TYPES } from "../../src/lib/contracts/poll-authorization.mjs";
const chainId = 43113;
const common = createCustomCommon({ chainId, networkId: chainId }, Mainnet, { hardfork: Hardfork.Cancun });
const vm = await createVM({ common });
const timestamp = BigInt(Math.floor(Date.now() / 1000));
const block = createBlock({ header: { number: 1n, timestamp, gasLimit: 30_000_000n, baseFeePerGas: 0n } }, { common, skipConsensusFormatValidation: true });
const [owner, issuer, relayer, stranger] = Array.from({ length: 4 }, () => Wallet.createRandom());
for (const wallet of [owner, issuer, relayer, stranger]) await vm.stateManager.putAccount(createAddressFromString(wallet.address), createAccount({ nonce: 0n, balance: 10n ** 25n }));
const artifact = compileV2Contracts().contracts.UniPassPollV1;
const initCode = hexToBytes(`0x${artifact.evm.bytecode.object}${AbiCoder.defaultAbiCoder().encode(["address", "address"], [owner.address, issuer.address]).slice(2)}`);
const deployed = await vm.evm.runCall({ caller: createAddressFromString(owner.address), origin: createAddressFromString(owner.address), data: initCode, gasLimit: 25_000_000n, block });
assert.equal(deployed.execResult.exceptionError, undefined);
const address = deployed.createdAddress.toString();
const iface = new Interface(artifact.abi);
async function call(name, args = [], caller = relayer) {
  return vm.evm.runCall({ to: createAddressFromString(address), caller: createAddressFromString(caller.address), origin: createAddressFromString(caller.address), data: hexToBytes(iface.encodeFunctionData(name, args)), gasLimit: 25_000_000n, block });
}
async function ok(name, args = [], caller = relayer) { const result = await call(name, args, caller); assert.equal(result.execResult.exceptionError, undefined, name); return result; }
async function reverts(name, args = [], caller = relayer) { assert.ok((await call(name, args, caller)).execResult.exceptionError, `${name} should revert`); }
async function authorization(pollId, option = 0, voterNullifier = `0x${"11".repeat(32)}`, signer = issuer, overrides = {}) {
  const auth = { pollId, option, voterNullifier, chainId, verifyingContract: address, expiresAt: Number(timestamp + 300n), nonce: Wallet.createRandom().privateKey, purpose: POLL_PURPOSE, ...overrides };
  const signature = await signer.signTypedData({ name: "UniPass Poll", version: "1", chainId, verifyingContract: address }, VOTE_AUTH_TYPES, auth);
  return [auth, signature];
}
await reverts("createPoll", [2, Number(timestamp + 3600n)], stranger);
await reverts("createPoll", [1, Number(timestamp + 3600n)], owner);
await ok("createPoll", [2, Number(timestamp + 3600n)], owner);
await ok("createPoll", [2, Number(timestamp + 3600n)], owner);
const first = await authorization(1);
await ok("vote", first, relayer);
const results = await ok("getResults", [1]);
assert.equal(iface.decodeFunctionResult("getResults", results.execResult.returnValue)[0][0], 1n);
await reverts("vote", first);
await reverts("vote", await authorization(1, 1));
await ok("vote", await authorization(2, 1));
await reverts("vote", await authorization(1, 0, `0x${"22".repeat(32)}`, stranger));
await reverts("vote", await authorization(1, 0, `0x${"22".repeat(32)}`, issuer, { expiresAt: Number(timestamp - 1n) }));
await reverts("vote", await authorization(1, 2, `0x${"22".repeat(32)}`));
await ok("closePoll", [1], owner);
await reverts("vote", await authorization(1, 0, `0x${"33".repeat(32)}`));
console.log("Poll EVM tests passed: owner creation, valid relayed vote, tally, duplicate nullifier, cross-poll nullifier, wrong issuer, expired authorization, replayed nonce, closed poll and invalid option.");

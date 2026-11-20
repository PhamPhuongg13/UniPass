import assert from "node:assert/strict";
import { AbiCoder, Interface, Wallet } from "ethers";
import { createCustomCommon, Hardfork, Mainnet } from "@ethereumjs/common";
import { createBlock } from "@ethereumjs/block";
import { createAccount, createAddressFromString, hexToBytes } from "@ethereumjs/util";
import { createVM } from "@ethereumjs/vm";
import { compileV2Contracts } from "./compile-v2.mjs";
import { buildStampAuthorization, STAMP_AUTH_TYPES } from "../../src/lib/contracts/program-authorization.mjs";
const chainId = 43113;
const common = createCustomCommon({ chainId, networkId: chainId }, Mainnet, { hardfork: Hardfork.Cancun });
const vm = await createVM({ common });
const timestamp = BigInt(Math.floor(Date.now() / 1000));
const block = createBlock({ header: { number: 1n, timestamp, gasLimit: 30_000_000n, baseFeePerGas: 0n } }, { common, skipConsensusFormatValidation: true });
const [owner, issuer, relayer, student, stranger] = Array.from({ length: 5 }, () => Wallet.createRandom());
for (const wallet of [owner, issuer, relayer, student, stranger]) await vm.stateManager.putAccount(createAddressFromString(wallet.address), createAccount({ nonce: 0n, balance: 10n ** 25n }));
const artifacts = compileV2Contracts().contracts;
async function deploy(name, types, args) {
  const artifact = artifacts[name];
  const data = hexToBytes(`0x${artifact.evm.bytecode.object}${AbiCoder.defaultAbiCoder().encode(types, args).slice(2)}`);
  const result = await vm.evm.runCall({ caller: createAddressFromString(owner.address), origin: createAddressFromString(owner.address), data, gasLimit: 25_000_000n, block });
  assert.equal(result.execResult.exceptionError, undefined, name);
  return { address: result.createdAddress.toString(), iface: new Interface(artifact.abi) };
}
const token = await deploy("UniPassTestUSDC", ["address"], [owner.address]);
const programs = await deploy("UniPassProgramsV1", ["address", "address", "address"], [owner.address, issuer.address, token.address]);
async function call(contract, name, args = [], caller = relayer) { return vm.evm.runCall({ to: createAddressFromString(contract.address), caller: createAddressFromString(caller.address), origin: createAddressFromString(caller.address), data: hexToBytes(contract.iface.encodeFunctionData(name, args)), gasLimit: 25_000_000n, block }); }
async function ok(contract, name, args = [], caller = relayer) { const result = await call(contract, name, args, caller); assert.equal(result.execResult.exceptionError, undefined, `${name}: ${result.execResult.exceptionError?.error}`); return result; }
async function reverts(contract, name, args = [], caller = relayer) { assert.ok((await call(contract, name, args, caller)).execResult.exceptionError, `${name} should revert`); }
async function view(contract, name, args = []) { const result = await ok(contract, name, args); return contract.iface.decodeFunctionResult(name, result.execResult.returnValue)[0]; }
const close = Number(timestamp + 3600n);
await reverts(token, "mint", [student.address, 1n], stranger);
assert.equal(await view(token, "decimals"), 6n);
await reverts(programs, "createProgram", [0, 1, close, 5_000_000n], stranger);
await reverts(programs, "createProgram", [1, 1, close, 1n], owner);
await reverts(programs, "createProgram", [0, 0, close, 1n], owner);
for (const [kind, amount] of [[0, 5_000_000n], [1, 0n], [2, 0n], [3, 0n]]) await ok(programs, "createProgram", [kind, kind === 2 ? 1 : 5, close, amount], owner);
async function authorization(programId, nullifier, signer = issuer, overrides = {}) {
  const { domain, authorization } = buildStampAuthorization({ programId, nullifier, recipient: programId === 1 ? student.address : "0x0000000000000000000000000000000000000000", verifyingContract: programs.address, nowSeconds: Number(timestamp) });
  Object.assign(authorization, overrides);
  return [authorization, await signer.signTypedData(domain, STAMP_AUTH_TYPES, authorization)];
}
const n = i => `0x${i.toString(16).padStart(64, "0")}`;
await reverts(programs, "stamp", await authorization(1, n(1))); // underfunded
assert.equal(await view(programs, "stampCount", [1]), 0n);
await ok(token, "mint", [programs.address, 20_000_000n], owner);
const before = await view(token, "balanceOf", [student.address]);
const first = await authorization(1, n(1));
await ok(programs, "stamp", first, relayer);
assert.equal(await view(token, "balanceOf", [student.address]), before + 5_000_000n);
await reverts(programs, "stamp", first, relayer); // nonce replay
await reverts(programs, "stamp", await authorization(1, n(1))); // duplicate passport
await reverts(programs, "stamp", await authorization(1, n(2), stranger));
await reverts(programs, "stamp", await authorization(1, n(2), issuer, { expiresAt: Number(timestamp - 1n) }));
await reverts(programs, "stamp", await authorization(1, n(2), issuer, { expiresAt: Number(timestamp + 601n) }));
await reverts(programs, "stamp", await authorization(1, n(2), issuer, { chainId: 1 }));
await reverts(programs, "award", [2, n(10), student.address, 1n], owner);
await ok(programs, "stamp", await authorization(2, n(10)), relayer);
await reverts(programs, "award", [2, n(10), student.address, 1n], stranger);
await ok(programs, "award", [2, n(10), student.address, 1_000_000n], owner);
await reverts(programs, "award", [2, n(10), student.address, 1n], owner);
await reverts(programs, "award", [3, n(10), student.address, 1n], owner);
await ok(programs, "stamp", await authorization(3, n(10)), relayer);
await reverts(programs, "stamp", await authorization(3, n(11)), relayer); // cap
await ok(programs, "stamp", await authorization(4, n(10)), stranger); // anyone submits
await ok(programs, "closeProgram", [4], owner);
await reverts(programs, "stamp", await authorization(4, n(11)), relayer);
console.log("Programs EVM tests passed: all kinds, owner controls, cap, duplicate and nonce replay, relayer submission, issuer and TTL, giveaway funding and transfer, scholarship award once after application.");

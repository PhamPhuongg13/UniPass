import test from "node:test";
import assert from "node:assert/strict";
import { AbiCoder, Interface, getAddress } from "ethers";
import { compileIcmContracts } from "../../scripts/contracts/compile-icm.mjs";
import { claimMessage } from "../../src/lib/icm/quest-message.mjs";
const wallet = getAddress("0x1234567890abcdef1234567890abcdef12345678");
const contract = getAddress("0xabcdefabcdefabcdefabcdefabcdefabcdefabcd");
test("ICM contracts compile and expose required functions", () => {
  const { contracts } = compileIcmContracts();
  assert.ok(new Interface(contracts.UniPassPassportBridgeV1.abi).getFunction("sendPassport"));
  assert.ok(new Interface(contracts.UniPassPassportMirrorV1.abi).getFunction("passportOf"));
  assert.ok(new Interface(contracts.CampusQuestL1.abi).getFunction("claimFor"));
});
test("passport and quest stamp payloads round trip with Solidity ABI layout", () => {
  const abi = AbiCoder.defaultAbiCoder(); const school = "0x" + "12".repeat(32);
  const passport = abi.encode(["uint8", "address", "bytes32", "uint64", "bool", "uint64"], [1, wallet, school, 123456789, true, 123450000]);
  assert.deepEqual([...abi.decode(["uint8", "address", "bytes32", "uint64", "bool", "uint64"], passport)].map(String), ["1", wallet, school, "123456789", "true", "123450000"]);
  const stamp = abi.encode(["uint8", "address", "uint256", "uint64"], [2, wallet, 1, 123450001]);
  assert.deepEqual([...abi.decode(["uint8", "address", "uint256", "uint64"], stamp)].map(String), ["2", wallet, "1", "123450001"]);
});
test("claim string matches required lowercase UTF-8 format", () => {
  assert.equal(claimMessage(wallet, 1, 99999, contract, 1234567890), "UniPass L1 quest claim\nwallet: 0x1234567890abcdef1234567890abcdef12345678\nquest: 1\nchain: 99999\ncontract: 0xabcdefabcdefabcdefabcdefabcdefabcdefabcd\ndeadline: 1234567890");
});

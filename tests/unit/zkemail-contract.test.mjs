import test from "node:test";
import assert from "node:assert/strict";
import { compileZkEmailContracts } from "../../scripts/contracts/compile-zkemail.mjs";

test("UniPass zkEmail and official SP1 verifier compile with callable ABI", () => {
  const { contracts } = compileZkEmailContracts();
  assert.ok(contracts.UniPassZkEmailV1.evm.bytecode.object.length > 0);
  assert.ok(contracts.SP1Verifier.evm.bytecode.object.length > 0);
  assert.ok(contracts.UniPassZkEmailV1.abi.some(item => item.name === "proveStudentEmail"));
  assert.ok(contracts.SP1Verifier.abi.some(item => item.name === "verifyProof"));
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const source = readFileSync(new URL("../../src/lib/schools.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { schoolLabel } = await import(`data:text/javascript,${encodeURIComponent(js)}`);
test("school labels resolve subdomains and fall back", () => {
  assert.equal(schoolLabel("gm.uit.edu.vn"), "UIT");
  assert.equal(schoolLabel("hcmus.edu.vn"), "HCMUS");
  assert.equal(schoolLabel("new.edu.vn"), "new.edu.vn");
});

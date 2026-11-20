import test from "node:test";
import assert from "node:assert/strict";
import { checkEligibility } from "../../src/lib/eligibility/policy.mjs";
const student = { chainId:43113, senderDomain:"hcmus.edu.vn", emailNullifier:`0x${"aa".repeat(32)}`, blueprintId:"privy-email-v1", expiresAt:new Date(Date.now()+100000), revokedAt:null };
test("shared eligibility applies OPEN, STUDENT and SCHOOLS rules",()=>{
  assert.equal(checkEligibility("OPEN",[],null).eligible,true);
  assert.equal(checkEligibility("STUDENT",[],student).eligible,true);
  assert.equal(checkEligibility("SCHOOLS",["hcmus.edu.vn"],student).eligible,true);
  assert.equal(checkEligibility("SCHOOLS",["hcmut.edu.vn"],student).reason,"SCHOOL_NOT_ALLOWED");
  assert.equal(checkEligibility("STUDENT",[],{...student,expiresAt:new Date(0)}).eligible,false);
  assert.equal(checkEligibility("STUDENT",[],{...student,emailNullifier:null}).eligible,false);
});

import test from "node:test";
import assert from "node:assert/strict";
import { pollInput } from "../../src/lib/polls/input.mjs";
const valid = { title:"Club election", description:"Choose a lead", options:["Alex","Sam"], closesAt:new Date(Date.now()+3600_000), eligibility:"OPEN", allowedSchoolDomains:[] };
test("poll input accepts a valid poll and trims options",()=>{
  const result=pollInput.parse({...valid,options:[" Alex "," Sam "]});
  assert.deepEqual(result.options,["Alex","Sam"]);
});
test("poll input rejects invalid bounds, duplicates, schools and closing time",()=>{
  for(const bad of [
    {...valid,title:"ab"}, {...valid,description:"x".repeat(2001)}, {...valid,options:["Only"]},
    {...valid,options:["Alex","alex"]}, {...valid,options:["A","B","C","D","E","F","G","H","I","J","K"]},
    {...valid,options:["A","B".repeat(81)]}, {...valid,closesAt:new Date(0)},
    {...valid,eligibility:"SCHOOLS"}, {...valid,eligibility:"SCHOOLS",allowedSchoolDomains:["example.com"]},
  ]) assert.equal(pollInput.safeParse(bad).success,false);
});

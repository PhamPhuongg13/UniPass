import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { Contract, ContractFactory, Interface, Wallet, ZeroAddress, getAddress, parseUnits } from "ethers";
import { PrismaClient } from "@prisma/client";
import { compileV2Contracts } from "./compile-v2.mjs";
import { buildStampAuthorization, STAMP_AUTH_TYPES } from "../../src/lib/contracts/program-authorization.mjs";
import { deploySafe, execSafeTx, safeOwnerWallets, safeProvider, SAFE_ABI } from "../safe/lib.mjs";

const progressPath = path.resolve("deployments/safe.json");
const flag = name => { const i = process.argv.indexOf(name); return i < 0 ? null : process.argv[i + 1]; };
const stepOnly = flag("--step"), dbOnly = flag("--db-only");
const steps = ["safe", "tusdc-mint", "programs-v2", "retire-v1", "recreate-programs", "handover"];
if (stepOnly && !steps.includes(stepOnly)) throw new Error(`--step must be one of ${steps.join(", ")}`);
const mappingPath = dbOnly ? path.resolve(dbOnly) : progressPath;
const progress = fs.existsSync(mappingPath) ? JSON.parse(fs.readFileSync(mappingPath, "utf8")) : { chainId: 43113, programs: {} };
function save() { if (dbOnly) return; fs.mkdirSync(path.dirname(progressPath), { recursive: true }); fs.writeFileSync(progressPath, `${JSON.stringify(progress, null, 2)}\n`); }
const old = JSON.parse(fs.readFileSync("deployments/fuji-programs.json", "utf8"));
const manager = JSON.parse(fs.readFileSync("deployments/fuji-v2.json", "utf8")).manager;
const zkEmail = process.env.NEXT_PUBLIC_ZKEMAIL_ADDRESS || JSON.parse(fs.readFileSync("deployments/fuji-zkemail.json", "utf8")).zkEmail;
const ownableAbi = ["function owner() view returns (address)", "function pendingOwner() view returns (address)", "function transferOwnership(address)", "function acceptOwnership()"];
const tokenAbi = [...ownableAbi, "function mint(address,uint256)", "function balanceOf(address) view returns (uint256)", "function approve(address,uint256) returns (bool)"];
const v1Abi = [...ownableAbi, "function nextProgramId() view returns (uint256)", "function getProgram(uint256) view returns ((uint8 kind,uint32 cap,uint64 closesAt,uint256 amountPerClaim,bool closed))", "function createProgram(uint8,uint32,uint64,uint256) returns (uint256)", "function closeProgram(uint256)", "function stamp((uint256 programId,bytes32 nullifier,address recipient,uint256 chainId,address verifyingContract,uint64 expiresAt,bytes32 nonce,bytes32 purpose),bytes)", "function award(uint256,bytes32,address,uint256)", "event ProgramCreated(uint256 indexed programId,uint8 kind,uint32 cap,uint64 closesAt,uint256 amountPerClaim)"];
const v2Abi = ["function createProgram(uint8,uint32,uint64,uint256,uint256) returns (uint256)", "function fundProgram(uint256,uint256)", "function getProgram(uint256) view returns ((uint8 kind,uint32 cap,uint64 closesAt,uint256 amountPerClaim,uint256 maxAward,uint256 budget,bool closed))", "function OPERATOR_ROLE() view returns (bytes32)", "function hasRole(bytes32,address) view returns (bool)", "function issuer() view returns (address)", "function totalBudgets() view returns (uint256)", "event ProgramCreated(uint256 indexed programId,uint8 kind,uint32 cap,uint64 closesAt,uint256 amountPerClaim,uint256 maxAward)"];
async function confirmed(tx) { const receipt = await tx.wait(1); if (receipt?.status !== 1) throw new Error(`Transaction failed: ${tx.hash}`); return receipt; }
async function applyDatabase(mapping, { strict = false } = {}) {
  if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL");
  const db = new PrismaClient();
  try {
    for (const [oldId, entry] of Object.entries(mapping)) {
      const newId = typeof entry === "string" ? entry : entry.newId;
      if (!newId) throw new Error(`Missing new ID for ${oldId}`);
      const row = await db.program.findFirst({ where: { chainProgramId: oldId } });
      if (!row) { if (strict) console.log(`Already mapped or missing V1 program ${oldId}`); continue; }
      const counts = await db.$transaction(async tx => {
        const stamps = await tx.programStamp.deleteMany({ where: { programId: row.id } });
        const codes = await tx.discountCode.deleteMany({ where: { programId: row.id } });
        const applications = await tx.scholarshipApplication.deleteMany({ where: { programId: row.id } });
        await tx.program.update({ where: { id: row.id }, data: { chainProgramId: String(newId), chainTx: typeof entry === "string" ? null : entry.createTx ?? null, fundingTx: typeof entry === "string" ? null : entry.fundingTx ?? null, approvalTx: typeof entry === "string" ? null : entry.approvalTx ?? null } });
        return { stamps: stamps.count, codes: codes.count, applications: applications.count };
      });
      console.log(`DB ${oldId} -> ${newId}: removed ${counts.stamps} stamps, ${counts.codes} codes, ${counts.applications} applications`);
    }
  } finally { await db.$disconnect(); }
}
if (dbOnly) { await applyDatabase(progress.programs ?? progress.mapping ?? progress, { strict: true }); process.exit(0); }
const provider = safeProvider();
try {
  if (Number((await provider.getNetwork()).chainId) !== 43113) throw new Error("Expected Fuji 43113");
  const owners = safeOwnerWallets(provider), deployer = owners[0];
  if (!process.env.POLL_RELAYER_PRIVATE_KEY || !process.env.UNIPASS_REGISTRATION_ISSUER_PRIVATE_KEY || !process.env.REGISTRATION_ISSUER_ADDRESS) throw new Error("Set relayer and issuer configuration");
  const operator = new Wallet(process.env.POLL_RELAYER_PRIVATE_KEY, provider);
  const issuer = new Wallet(process.env.UNIPASS_REGISTRATION_ISSUER_PRIVATE_KEY, provider);
  if (issuer.address.toLowerCase() !== process.env.REGISTRATION_ISSUER_ADDRESS.toLowerCase()) throw new Error("Issuer address mismatch");
  const run = async name => {
    if (name === "safe") {
      if (!progress.safe) { progress.safe = await deploySafe(owners.map(x => x.address), 2, BigInt(process.env.SAFE_SALT_NONCE || "0"), deployer); save(); }
      const contract = new Contract(progress.safe.address, SAFE_ABI, provider);
      const chainOwners = (await contract.getOwners()).map(x => x.toLowerCase());
      if (Number(await contract.getThreshold()) !== 2 || owners.some(x => !chainOwners.includes(x.address.toLowerCase()))) throw new Error("Saved Safe owners or threshold mismatch");
      console.log(`Safe 2-of-3: ${progress.safe.address}`);
      return;
    }
    if (!progress.safe?.address) throw new Error("Run --step safe first");
    const safe = progress.safe.address;
    const safeExec = async (to, data) => execSafeTx(safe, { to, data }, owners.slice(0, 2), deployer);
    const token = new Contract(old.tUSDC, tokenAbi, operator);
    const tokenRead = token.connect(provider);
    if (name === "tusdc-mint") {
      if (!progress.tusdcMintTx) { if ((await token.owner()).toLowerCase() !== operator.address.toLowerCase()) throw new Error("tUSDC owner is not operator; mint cannot be repeated"); progress.tusdcMintTx = (await confirmed(await token.mint(operator.address, parseUnits("20000", 6)))).hash; save(); }
      if ((await token.owner()).toLowerCase() !== safe.toLowerCase()) {
        if ((await token.pendingOwner()).toLowerCase() !== safe.toLowerCase()) { progress.tusdcTransferTx = (await confirmed(await token.transferOwnership(safe))).hash; save(); }
        progress.tusdcAcceptTx = await safeExec(old.tUSDC, token.interface.encodeFunctionData("acceptOwnership")); save();
      }
      console.log(`tUSDC owner: ${await token.owner()}`);
      return;
    }
    if (name === "programs-v2") {
      if (!progress.programsV2?.address) {
        const { contracts } = compileV2Contracts();
        const artifact = contracts.UniPassProgramsV2;
        const deployed = await new ContractFactory(artifact.abi, `0x${artifact.evm.bytecode.object}`, deployer).deploy(safe, operator.address, issuer.address, old.tUSDC);
        const receipt = await confirmed(deployed.deploymentTransaction());
        progress.programsV2 = { address: await deployed.getAddress(), txHash: receipt.hash }; save();
      }
      const v2 = new Contract(progress.programsV2.address, v2Abi, provider);
      if (!await v2.hasRole(await v2.OPERATOR_ROLE(), operator.address) || (await v2.issuer()).toLowerCase() !== issuer.address.toLowerCase()) throw new Error("V2 configuration mismatch");
      console.log(`Programs V2: ${progress.programsV2.address}`);
      return;
    }
    if (name === "retire-v1") {
      const v1 = new Contract(old.programs, v1Abi, operator);
      const count = Number(await v1.nextProgramId());
      const balance = BigInt(await tokenRead.balanceOf(old.programs));
      for (let id = 1; id < count; id++) { const program = await v1.getProgram(id); if (!program.closed && !(balance > BigInt(0) && String(id) === progress.retireProgramId)) { await confirmed(await v1.closeProgram(id)); console.log(`Closed V1 program ${id}`); } }
      if (balance > BigInt(0)) {
        if (!progress.retireProgramId) {
          const tx = await v1.createProgram(1, 1, Math.floor(Date.now() / 1000) + 3600, 0);
          const receipt = await confirmed(tx);
          const log = receipt.logs.map(item => { try { return v1.interface.parseLog(item); } catch { return null; } }).find(item => item?.name === "ProgramCreated");
          if (!log) throw new Error("V1 ProgramCreated event missing");
          progress.retireProgramId = String(log.args.programId); progress.retireCreateTx = tx.hash; save();
        }
        const id = progress.retireProgramId;
        const p = await v1.getProgram(BigInt(id));
        if (p.closed && balance > BigInt(0)) throw new Error("Retirement program was closed before treasury drain");
        const nullifier = `0x${randomBytes(32).toString("hex")}`;
        const { authorization } = buildStampAuthorization({ programId: id, nullifier, recipient: safe, verifyingContract: old.programs });
        const domain = { name: "UniPass Programs", version: "1", chainId: 43113, verifyingContract: getAddress(old.programs) };
        const signature = await issuer.signTypedData(domain, STAMP_AUTH_TYPES, authorization);
        if (!progress.retireStampTx) { progress.retireStampTx = (await confirmed(await v1.stamp(authorization, signature))).hash; progress.retireNullifier = nullifier; save(); }
        const awardNullifier = progress.retireNullifier;
        if (!progress.retireAwardTx) { progress.retireAwardTx = (await confirmed(await v1.award(id, awardNullifier, safe, balance))).hash; save(); }
      }
      if (BigInt(await tokenRead.balanceOf(old.programs)) !== BigInt(0)) throw new Error("V1 balance is not zero");
      if ((await v1.owner()).toLowerCase() !== safe.toLowerCase()) {
        if ((await v1.pendingOwner()).toLowerCase() !== safe.toLowerCase()) { progress.retireTransferTx = (await confirmed(await v1.transferOwnership(safe))).hash; save(); }
        progress.retireAcceptTx = await safeExec(old.programs, v1.interface.encodeFunctionData("acceptOwnership")); save();
      }
      console.log(`V1 drained and owned by Safe; Safe tUSDC balance: ${await tokenRead.balanceOf(safe)}`);
      return;
    }
    if (name === "recreate-programs") {
      if (!progress.programsV2?.address) throw new Error("Run --step programs-v2 first");
      if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL");
      const db = new PrismaClient();
      try {
        const rows = await db.program.findMany({ where: { chainProgramId: { not: null } }, orderBy: { createdAt: "asc" } });
        const v2 = new Contract(progress.programsV2.address, v2Abi, operator);
        for (const row of rows) {
          const oldId = row.chainProgramId;
          if (Object.values(progress.programs ?? {}).some(entry => entry.newId === oldId)) continue;
          if (!progress.programs[oldId]) {
            const kind = ["GIVEAWAY", "SCHOLARSHIP", "DISCOUNT", "ECOSYSTEM"].indexOf(row.kind);
            const maxAward = kind === 1 ? BigInt(row.extra.awardAmount) : BigInt(0);
            const budget = kind === 0 ? BigInt(row.amountPerClaim) * BigInt(row.cap) : kind === 1 ? maxAward * BigInt(Math.min(row.cap, 5)) : BigInt(0);
            const tx = await v2.createProgram(kind, row.cap, Math.max(Math.floor(row.closesAt.getTime() / 1000), Math.floor(Date.now() / 1000) + 3600), BigInt(row.amountPerClaim), maxAward);
            const receipt = await confirmed(tx);
            const log = receipt.logs.map(item => { try { return v2.interface.parseLog(item); } catch { return null; } }).find(item => item?.name === "ProgramCreated");
            if (!log) throw new Error("V2 ProgramCreated event missing");
            progress.programs[oldId] = { newId: String(log.args.programId), createTx: tx.hash, budget: String(budget) }; save();
          }
          const entry = progress.programs[oldId];
          if (BigInt(entry.budget) > BigInt(0) && !entry.fundingTx) {
            if (BigInt(await token.balanceOf(operator.address)) < BigInt(entry.budget)) throw new Error(`Operator treasury lacks tUSDC for V1 program ${oldId}`);
            entry.approvalTx = (await confirmed(await token.approve(progress.programsV2.address, BigInt(entry.budget)))).hash; save();
            entry.fundingTx = (await confirmed(await v2.fundProgram(BigInt(entry.newId), BigInt(entry.budget)))).hash; save();
          }
          await applyDatabase({ [oldId]: entry });
        }
      } finally { await db.$disconnect(); }
      return;
    }
    if (name === "handover") {
      const targets = [["EventManagerV2", manager], ["ZkEmailV1", zkEmail]];
      if (fs.existsSync("deployments/icm.json")) { const icm = JSON.parse(fs.readFileSync("deployments/icm.json", "utf8")); if (icm.bridge) targets.push(["Fuji bridge", icm.bridge]); }
      for (const [label, address] of targets) {
        const contract = new Contract(address, ownableAbi, deployer);
        if ((await contract.owner()).toLowerCase() !== safe.toLowerCase()) {
          if ((await contract.pendingOwner()).toLowerCase() !== safe.toLowerCase()) { progress.handover ??= {}; progress.handover[label] = { transferTx: (await confirmed(await contract.transferOwnership(safe))).hash }; save(); }
          progress.handover ??= {}; progress.handover[label] ??= {}; progress.handover[label].acceptTx = await safeExec(address, contract.interface.encodeFunctionData("acceptOwnership")); save();
        }
        console.log(`${label}: ${await contract.owner()}`);
      }
      console.log("PollV1 remains owned by the operator; it holds no funds and creates/closes polls at runtime.");
      return;
    }
  };
  for (const name of stepOnly ? [stepOnly] : steps) await run(name);
  console.log("\nFinal ownership and roles:");
  for (const [label, address] of [["Safe", progress.safe?.address], ["tUSDC", old.tUSDC], ["ProgramsV1", old.programs], ["ProgramsV2", progress.programsV2?.address], ["EventManagerV2", manager], ["ZkEmailV1", zkEmail]]) {
    if (!address) continue;
    if (label === "Safe") { const c = new Contract(address, SAFE_ABI, provider); console.log(`${label} ${address} threshold=${await c.getThreshold()} owners=${(await c.getOwners()).join(",")}`); }
    else if (label === "ProgramsV2") { const c = new Contract(address, [...v2Abi, "function DEFAULT_ADMIN_ROLE() view returns (bytes32)"], provider); console.log(`${label} ${address} SafeAdmin=${await c.hasRole(await c.DEFAULT_ADMIN_ROLE(), progress.safe.address)} operator=${await c.hasRole(await c.OPERATOR_ROLE(), operator.address)} issuer=${await c.issuer()}`); }
    else { const c = new Contract(address, ownableAbi, provider); console.log(`${label} ${address} owner=${await c.owner()}`); }
  }
  const poll = JSON.parse(fs.readFileSync("deployments/fuji-poll.json", "utf8")).poll;
  console.log(`PollV1 ${poll} owner=${await new Contract(poll, ownableAbi, provider).owner()} (operator; no treasury)`);
} finally { provider.destroy(); }

import { SiteHeader } from "@/components/SiteHeader";
import { CopyCode } from "@/components/CopyCode";
import { REGISTRATION_AUTH_TYPES } from "@/lib/contracts/registration-authorization.mjs";
import { VOTE_AUTH_TYPES } from "@/lib/contracts/poll-authorization.mjs";
import { STAMP_AUTH_TYPES } from "@/lib/contracts/program-authorization.mjs";
import { ATTESTATION_TYPES } from "@/lib/programs/attestation.mjs";
import { icmPublicConfig } from "@/lib/icm/contracts";
export const dynamic = "force-dynamic";
const toc = [
  ["overview","What UniPass gives you"],["flow","How a stamp works"],["contracts","Contracts"],["read","Check a stamp"],["l1","Read UniPass from your L1"],["zkemail","zkEmail on Avalanche"],["signin","Sign in with UniPass"],["rules","Program rules"],["privacy","Privacy model"],["limitations","Limitations"],["law","Vietnam law notes"],
];
const readCode = `import { Contract, JsonRpcProvider } from "ethers";
const provider = new JsonRpcProvider("https://api.avax-test.network/ext/bc/C/rpc");
const events = new Contract("0xFC6289Cc8e4dA635138815d75D84172C17135817", [
  "function studentNullifierUsed(uint256 eventId,bytes32 nullifier) view returns (bool)"
], provider);
const alreadyStamped = await events.studentNullifierUsed(eventId, nullifier);
const pollAddress = process.env.NEXT_PUBLIC_POLL_ADDRESS;
const poll = new Contract(pollAddress, [
  "function getResults(uint256 pollId) view returns (uint256[])"
], provider);
const voteCounts = await poll.getResults(pollId);`;
const signInCode = `import { Contract, JsonRpcProvider, verifyTypedData } from "ethers";
const attestation = JSON.parse(Buffer.from(query.attestation, "base64url").toString());
const issuer = await fetch("/api/attestations/issuer").then(r => r.json()).then(x => x.issuer);
const types = { UniPassAttestation: [
  { name: "programId", type: "string" }, { name: "chainProgramId", type: "uint256" },
  { name: "nullifier", type: "bytes32" }, { name: "school", type: "string" },
  { name: "issuedAt", type: "uint64" }, { name: "expiresAt", type: "uint64" },
  { name: "contract", type: "address" }
] };
const domain = { name: "UniPass Attestation", version: "1", chainId: 43113,
  verifyingContract: attestation.contract };
if (verifyTypedData(domain, types, attestation, query.signature).toLowerCase() !== issuer.toLowerCase()) throw Error("Invalid signature");
if (attestation.expiresAt <= Date.now() / 1000 || query.state !== expectedState) throw Error("Expired or invalid state");
const provider = new JsonRpcProvider(FUJI_RPC_URL);
const programs = new Contract(attestation.contract,
  ["function nullifierUsed(uint256,bytes32) view returns (bool)"], provider);
if (!await programs.nullifierUsed(attestation.chainProgramId, attestation.nullifier)) throw Error("No stamp");`;
export default function Developers() {
  const icm = icmPublicConfig();
  const l1Code = `import { Contract, JsonRpcProvider } from "ethers";
const l1 = new JsonRpcProvider(process.env.L1_RPC_URL);
const mirror = new Contract("${process.env.L1_MIRROR_ADDRESS || "<L1_MIRROR_ADDRESS>"}", [
  "function isStudent(address wallet) view returns (bool)"
], l1);
const verified = await mirror.isStudent(studentWallet);`;
  const addresses = [["EventManager V2","0xFC6289Cc8e4dA635138815d75D84172C17135817"],["Ticket V2","0x0e84c98597647C73Ac64bae8cd25e0eb8F92353f"],["Poll V1",process.env.NEXT_PUBLIC_POLL_ADDRESS||""],["Programs V2",process.env.NEXT_PUBLIC_PROGRAMS_ADDRESS||""],["Treasury & admin — Safe 2-of-3",process.env.NEXT_PUBLIC_SAFE_ADDRESS||""],["zkEmail V1",process.env.NEXT_PUBLIC_ZKEMAIL_ADDRESS||""],["SP1 verifier",process.env.NEXT_PUBLIC_SP1_VERIFIER_ADDRESS||""],["Test tUSDC",process.env.NEXT_PUBLIC_TUSDC_ADDRESS||""],["Issuer",process.env.REGISTRATION_ISSUER_ADDRESS||""]];
  return <><SiteHeader/><main className="subpage page-arrive docs-layout"><aside className="docs-toc"><b>On this page</b>{toc.filter(([id])=>id!=="l1"||icm).map(([id,title])=><a key={id} href={`#${id}`}>{title}</a>)}</aside><article className="docs-content"><p className="eyebrow">DEVELOPER GUIDE</p><h1>Build with UniPass<span className="headline-period">.</span></h1><section id="overview"><h2>What UniPass gives you</h2><p>UniPass is a student passport on Avalanche. A student verifies a school email once, then each program adds one stamp. Program-specific nullifiers make duplicate participation impossible while keeping stamps across programs unlinkable.</p></section><section id="flow"><h2>How a stamp works</h2><div className="stamp-flow">{["1. Student verifies a school email","2. UniPass derives a per-program nullifier from an HMAC of the email hash and program ID","3. UniPass issuer signs an EIP-712 authorization","4. The relayer submits the authorization","5. The contract refuses a nullifier it has already seen"].map(step=><div key={step}>{step}</div>)}</div></section><section id="contracts"><h2>Contracts on Avalanche Fuji</h2><table><thead><tr><th>Contract</th><th>Address</th></tr></thead><tbody>{addresses.map(([name,address])=><tr key={name}><td>{name}</td><td>{address?<a href={`https://testnet.snowtrace.io/address/${address}`} target="_blank" rel="noopener noreferrer">{address}</a>:"Set its address after deployment"}</td></tr>)}</tbody></table></section><section id="read"><h2>Check a stamp from your app</h2><p>Use ethers v6 to read a public stamp or poll tally. Never derive a private program nullifier in a public client.</p><CopyCode code={readCode}/><h3>EIP-712 authorization types</h3><CopyCode code={JSON.stringify({ ...REGISTRATION_AUTH_TYPES, ...VOTE_AUTH_TYPES, ...STAMP_AUTH_TYPES },null,2)}/></section>{icm && <section id="l1"><h2>Read UniPass from your L1</h2><p>The mirror exposes current student status directly on the L1. {icm ? `Mirror: ${process.env.L1_MIRROR_ADDRESS}` : "Configure the L1 route after deployment."}</p><CopyCode code={l1Code}/><ol><li>The student requests an issuer-signed passport attestation.</li><li>The Fuji bridge verifies it and sends an ICM message through Teleporter.</li><li>Teleporter delivers the passport to the L1 mirror; your contract reads <code>isStudent(wallet)</code>.</li><li>Campus Quest claims send an ICM stamp back to the Fuji bridge.</li></ol></section>}<section id="zkemail"><h2>zkEmail on Avalanche</h2><p>The UniPassZkEmailV1 contract checks an SP1 proof and records the school domain for the wallet that submitted it. Call <code>attestationOf(wallet)</code> to read its attestation and school domain. The attestation includes the school domain hash; the email address is not stored on-chain.</p><p>The zkEmail contract and SP1 verifier addresses are linked in the contract table above.</p></section><section id="signin"><h2>Sign in with UniPass</h2><p>Create an ecosystem program with your exact callback URL. Redirect a student to <code>/connect?program=&lt;id&gt;&amp;redirect_uri=&lt;url&gt;&amp;state=&lt;random&gt;</code>. After approval, decode the base64url attestation, verify the issuer signature and expiry, compare state, and read the on-chain stamp. The partner receives a school and program-specific nullifier, never the email or wallet.</p><h3>UniPassAttestation</h3><CopyCode code={JSON.stringify(ATTESTATION_TYPES,null,2)}/><h3>Verify with ethers</h3><CopyCode code={signInCode}/><p>Try the <a href="/partner-demo">Avalanche Builder Quest partner page</a>.</p></section><section id="rules"><h2>Program rules</h2><p><b>OPEN:</b> Anyone with a wallet; the stamp is wallet-scoped.</p><p><b>STUDENT:</b> An active verified .edu.vn passport is required.</p><p><b>SCHOOLS:</b> A verified passport from a listed school domain is required.</p></section><section id="privacy"><h2>Privacy model</h2><p>The database stores an HMAC of the verified email, school domain, verification expiry and transaction mirrors. It does not store the email address, student ID or card photo. Program nullifiers differ across contracts and program IDs. Poll, scholarship, discount and ecosystem transactions come from the relayer; scholarship and discount stamps omit the student wallet.</p></section><section id="limitations"><h2>Limitations</h2><p>The issuer still applies eligibility rules when signing stamps. A school email does not distinguish current students from alumni. Passports expire after 180 days. Contracts are on Fuji testnet only.</p></section><section id="law"><h2>Vietnam law notes</h2><p>Crypto is not legal tender in Vietnam. UniPass does not sell tokens or collect real money from users. Programs on UniPass are free.</p></section></article></main></>;
}

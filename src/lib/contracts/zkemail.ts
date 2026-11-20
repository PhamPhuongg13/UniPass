import { Contract, Interface, getAddress, zeroPadValue, type ContractRunner } from "ethers";
import { createReadOnlyFujiProvider } from "@/lib/contracts/chain";

export const ZKEMAIL_ABI = [
  "function proveStudentEmail(bytes publicValues,bytes proofBytes) returns (string domain)",
  "function attestationOf(address wallet) view returns ((bytes32 fromDomainHash,bytes32 publicKeyHash,bytes32 proofId,uint64 at),string domain)",
  "function isDkimKeyAllowed(bytes32 fromDomainHash,bytes32 publicKeyHash) view returns (bool,string)",
  "event StudentEmailProven(address indexed wallet,string domain,bytes32 fromDomainHash,bytes32 publicKeyHash,bytes32 proofId)",
  "error UnknownDkimKey()", "error ProofAlreadyUsed()", "error InvalidPublicValues()",
] as const;
export const zkEmailInterface = new Interface(ZKEMAIL_ABI);
export function zkEmailAddress() { return process.env.NEXT_PUBLIC_ZKEMAIL_ADDRESS ? getAddress(process.env.NEXT_PUBLIC_ZKEMAIL_ADDRESS) : null; }
export function zkEmailContract(runner: ContractRunner) { const address = zkEmailAddress(); if (!address) throw new Error("zkEmail contract is not configured."); return new Contract(address, ZKEMAIL_ABI, runner); }
export async function readZkAttestation(wallet: string) {
  const address = zkEmailAddress();
  if (!address) return null;
  const provider = createReadOnlyFujiProvider();
  try {
    const [attestation, domain] = await zkEmailContract(provider).attestationOf(wallet);
    if (attestation.at <= BigInt(0) || !domain) return null;
    const at = Number(attestation.at);
    let txHash = "";
    try {
      // Fallback only: locate the block by its timestamp, then the indexed wallet event.
      let low = 0;
      const tip = await provider.getBlockNumber();
      let high = tip;
      while (low < high) {
        const middle = Math.floor((low + high) / 2);
        const block = await provider.getBlock(middle);
        if (!block) break;
        if (block.timestamp < at) low = middle + 1;
        else high = middle;
      }
      const logs = await provider.getLogs({ address, topics: [zkEmailInterface.getEvent("StudentEmailProven")!.topicHash, zeroPadValue(wallet, 32)], fromBlock: Math.max(0, low - 3), toBlock: Math.min(tip, low + 3) });
      const matching = logs.find(log => {
        try { return String(zkEmailInterface.parseLog(log)?.args.proofId).toLowerCase() === String(attestation.proofId).toLowerCase(); }
        catch { return false; }
      });
      txHash = matching?.transactionHash ?? "";
    } catch { /* The on-chain attestation remains usable if a public RPC limits log queries. */ }
    return { domain: String(domain), fromDomainHash: String(attestation.fromDomainHash), publicKeyHash: String(attestation.publicKeyHash), proofId: String(attestation.proofId), at, txHash };
  } finally { provider.destroy(); }
}

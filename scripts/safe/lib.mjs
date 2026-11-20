import { Contract, Interface, JsonRpcProvider, Wallet, ZeroAddress, getAddress } from "ethers";

export const SAFE_SINGLETON = "0x29fcB43b46531BcA003ddC8FCB67FFE91900C762";
export const SAFE_FACTORY = "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67";
export const SAFE_FALLBACK_HANDLER = "0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99";
export const SAFE_ABI = [
  "function setup(address[] owners,uint256 threshold,address to,bytes data,address fallbackHandler,address paymentToken,uint256 payment,address payable paymentReceiver)",
  "function nonce() view returns (uint256)",
  "function getTransactionHash(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,uint256 nonce) view returns (bytes32)",
  "function execTransaction(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address payable refundReceiver,bytes signatures) returns (bool)",
  "function getOwners() view returns (address[])",
  "function getThreshold() view returns (uint256)",
  "event ExecutionSuccess(bytes32 indexed txHash,uint256 payment)",
];
const FACTORY_ABI = ["function createProxyWithNonce(address singleton,bytes initializer,uint256 saltNonce) returns (address)", "event ProxyCreation(address indexed proxy,address singleton)"];
export function safeProvider() { const rpc = process.env.NEXT_PUBLIC_AVALANCHE_RPC_URL; if (!rpc) throw new Error("Set NEXT_PUBLIC_AVALANCHE_RPC_URL"); return new JsonRpcProvider(rpc); }
export function safeOwnerWallets(provider) {
  const keys = [process.env.DEPLOYER_PRIVATE_KEY, process.env.SAFE_OWNER_2_PRIVATE_KEY, process.env.SAFE_OWNER_3_PRIVATE_KEY];
  if (keys.some(key => !key)) throw new Error("Set DEPLOYER_PRIVATE_KEY, SAFE_OWNER_2_PRIVATE_KEY, SAFE_OWNER_3_PRIVATE_KEY");
  const wallets = keys.map(key => new Wallet(key, provider));
  if (new Set(wallets.map(wallet => wallet.address.toLowerCase())).size !== 3) throw new Error("Safe owners must be distinct");
  return wallets;
}
export async function deploySafe(owners, threshold, saltNonce, executor) {
  const provider = executor?.provider ?? safeProvider();
  const wallet = executor ?? new Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);
  const addresses = owners.map(owner => getAddress(typeof owner === "string" ? owner : owner.address));
  if (new Set(addresses.map(value => value.toLowerCase())).size !== addresses.length || threshold < 1 || threshold > addresses.length) throw new Error("Invalid Safe owners or threshold");
  const network = await provider.getNetwork(); if (Number(network.chainId) !== 43113) throw new Error("Expected Fuji 43113");
  const initializer = new Interface(SAFE_ABI).encodeFunctionData("setup", [addresses, threshold, ZeroAddress, "0x", SAFE_FALLBACK_HANDLER, ZeroAddress, 0, ZeroAddress]);
  const factory = new Contract(SAFE_FACTORY, FACTORY_ABI, wallet);
  const sent = await factory.createProxyWithNonce(SAFE_SINGLETON, initializer, saltNonce);
  const receipt = await sent.wait(1); if (receipt?.status !== 1) throw new Error("Safe deployment failed");
  const parsed = receipt.logs.map(log => { try { return factory.interface.parseLog(log); } catch { return null; } }).find(log => log?.name === "ProxyCreation");
  if (!parsed) throw new Error("ProxyCreation event missing");
  return { address: getAddress(parsed.args.proxy), txHash: sent.hash };
}
export async function execSafeTx(safe, transaction, signerWallets, executor) {
  const contract = new Contract(getAddress(safe), SAFE_ABI, executor);
  const network = await executor.provider.getNetwork(); if (Number(network.chainId) !== 43113) throw new Error("Expected Fuji 43113");
  const nonce = await contract.nonce();
  const to = getAddress(transaction.to), value = BigInt(transaction.value ?? 0), data = transaction.data ?? "0x";
  const hash = await contract.getTransactionHash(to, value, data, 0, 0, 0, 0, ZeroAddress, ZeroAddress, nonce);
  const domain = { chainId: network.chainId, verifyingContract: getAddress(safe) };
  const types = { SafeTx: [
    { name: "to", type: "address" }, { name: "value", type: "uint256" }, { name: "data", type: "bytes" },
    { name: "operation", type: "uint8" }, { name: "safeTxGas", type: "uint256" }, { name: "baseGas", type: "uint256" },
    { name: "gasPrice", type: "uint256" }, { name: "gasToken", type: "address" }, { name: "refundReceiver", type: "address" }, { name: "nonce", type: "uint256" },
  ] };
  const valueToSign = { to, value, data, operation: 0, safeTxGas: 0, baseGas: 0, gasPrice: 0, gasToken: ZeroAddress, refundReceiver: ZeroAddress, nonce };
  const signatures = await Promise.all(signerWallets.map(async wallet => ({ owner: wallet.address.toLowerCase(), signature: await wallet.signTypedData(domain, types, valueToSign) })));
  if (new Set(signatures.map(item => item.owner)).size !== signatures.length) throw new Error("Duplicate signer");
  signatures.sort((a, b) => a.owner.localeCompare(b.owner));
  const packed = `0x${signatures.map(item => item.signature.slice(2)).join("")}`;
  const sent = await contract.execTransaction(to, value, data, 0, 0, 0, 0, ZeroAddress, ZeroAddress, packed);
  const receipt = await sent.wait(1);
  if (receipt?.status !== 1 || !receipt.logs.some(log => { try { return contract.interface.parseLog(log)?.name === "ExecutionSuccess"; } catch { return false; } })) throw new Error(`Safe execution failed: ${sent.hash}`);
  // Catch a mismatch between the local typed-data encoder and the Safe implementation before returning.
  if (!receipt.logs.some(log => { try { return contract.interface.parseLog(log)?.args.txHash === hash; } catch { return false; } })) throw new Error("Safe transaction hash mismatch");
  return sent.hash;
}

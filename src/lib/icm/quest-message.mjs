import { getAddress } from "ethers";
export function claimMessage(wallet, questId, chainId, contract, deadline) {
  return `UniPass L1 quest claim\nwallet: ${getAddress(wallet).toLowerCase()}\nquest: ${BigInt(questId)}\nchain: ${BigInt(chainId)}\ncontract: ${getAddress(contract).toLowerCase()}\ndeadline: ${BigInt(deadline)}`;
}

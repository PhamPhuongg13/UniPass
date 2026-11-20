// SPDX-License-Identifier: LicenseRef-Ecosystem
pragma solidity ^0.8.20;
// Minimal ABI-identical definitions from contracts/icm/ITeleporterMessenger.sol
// and contracts/icm/ITeleporterReceiver.sol (Ava Labs, Inc.).
struct TeleporterFeeInfo { address feeTokenAddress; uint256 amount; }
struct TeleporterMessageInput {
    bytes32 destinationBlockchainID;
    address destinationAddress;
    TeleporterFeeInfo feeInfo;
    uint256 requiredGasLimit;
    address[] allowedRelayerAddresses;
    bytes message;
}
interface ITeleporterMessenger {
    function sendCrossChainMessage(TeleporterMessageInput calldata messageInput) external returns (bytes32);
}
interface ITeleporterReceiver {
    function receiveTeleporterMessage(bytes32 sourceBlockchainID, address originSenderAddress, bytes calldata message) external;
}

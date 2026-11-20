// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "./icm/TeleporterInterfaces.sol";
contract UniPassPassportMirrorV1 is Ownable2Step, ITeleporterReceiver {
    struct Passport { bytes32 schoolHash; uint64 expiresAt; bool zkVerified; uint64 sentAt; uint64 receivedAt; }
    address public immutable teleporter;
    bytes32 public immutable fujiBlockchainID;
    address public bridge;
    mapping(address => Passport) private passports;
    event PassportMirrored(address indexed wallet, bytes32 schoolHash, uint64 expiresAt, bool zkVerified);
    constructor(address owner_, address teleporter_, bytes32 fujiBlockchainID_) Ownable(owner_) {
        require(teleporter_ != address(0) && fujiBlockchainID_ != bytes32(0), "Invalid configuration");
        teleporter = teleporter_; fujiBlockchainID = fujiBlockchainID_;
    }
    function setBridge(address value) external onlyOwner { require(value != address(0), "Invalid bridge"); bridge = value; }
    function receiveTeleporterMessage(bytes32 source, address origin, bytes calldata message) external {
        require(msg.sender == teleporter && source == fujiBlockchainID && bridge != address(0) && origin == bridge, "Wrong route");
        (uint8 kind, address wallet, bytes32 schoolHash, uint64 expiresAt, bool zkVerified, uint64 sentAt) = abi.decode(message, (uint8, address, bytes32, uint64, bool, uint64));
        require(kind == 1 && wallet != address(0), "Invalid passport");
        passports[wallet] = Passport(schoolHash, expiresAt, zkVerified, sentAt, uint64(block.timestamp));
        emit PassportMirrored(wallet, schoolHash, expiresAt, zkVerified);
    }
    function isStudent(address wallet) external view returns (bool) { return passports[wallet].expiresAt > block.timestamp; }
    function passportOf(address wallet) external view returns (Passport memory) { return passports[wallet]; }
}

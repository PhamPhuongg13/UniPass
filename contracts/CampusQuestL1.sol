// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "./icm/TeleporterInterfaces.sol";
interface IStudentMirror { function isStudent(address wallet) external view returns (bool); }
contract CampusQuestL1 is Ownable2Step {
    using Strings for uint256;
    address public immutable teleporter;
    IStudentMirror public immutable mirror;
    bytes32 public immutable fujiBlockchainID;
    address public fujiBridge;
    address public relayer;
    mapping(address => mapping(uint256 => bool)) public claimed;
    event QuestClaimed(address indexed wallet, uint256 indexed questId);
    event StampSentToFuji(address indexed wallet, uint256 indexed questId, bytes32 messageID);
    constructor(address owner_, address teleporter_, address mirror_, bytes32 fujiBlockchainID_, address relayer_) Ownable(owner_) {
        require(teleporter_ != address(0) && mirror_ != address(0) && fujiBlockchainID_ != bytes32(0) && relayer_ != address(0), "Invalid configuration");
        teleporter = teleporter_; mirror = IStudentMirror(mirror_); fujiBlockchainID = fujiBlockchainID_; relayer = relayer_;
    }
    function setFujiBridge(address value) external onlyOwner { require(value != address(0), "Invalid bridge"); fujiBridge = value; }
    function setRelayer(address value) external onlyOwner { require(value != address(0), "Invalid relayer"); relayer = value; }
    // The chain ID and this contract's address are runtime values, so this is view.
    function claimMessage(address wallet, uint256 questId, uint64 deadline) public view returns (string memory) {
        return string.concat("UniPass L1 quest claim\nwallet: ", Strings.toHexString(uint160(wallet), 20), "\nquest: ", questId.toString(), "\nchain: ", block.chainid.toString(), "\ncontract: ", Strings.toHexString(uint160(address(this)), 20), "\ndeadline: ", uint256(deadline).toString());
    }
    function claimFor(address wallet, uint256 questId, uint64 deadline, bytes calldata sig) external {
        require(msg.sender == relayer, "Only relayer");
        require(block.timestamp <= deadline && wallet != address(0), "Expired claim");
        require(mirror.isStudent(wallet), "Not student");
        require(!claimed[wallet][questId], "Already claimed");
        // Strings.toHexString emits lowercase hex digits as required by the signed message.
        require(ECDSA.recover(MessageHashUtils.toEthSignedMessageHash(bytes(claimMessage(wallet, questId, deadline))), sig) == wallet, "Invalid signature");
        require(fujiBridge != address(0), "Bridge missing");
        claimed[wallet][questId] = true;
        emit QuestClaimed(wallet, questId);
        address[] memory relayers = new address[](0);
        bytes32 messageID = ITeleporterMessenger(teleporter).sendCrossChainMessage(TeleporterMessageInput(fujiBlockchainID, fujiBridge, TeleporterFeeInfo(address(0), 0), 300_000, relayers, abi.encode(uint8(2), wallet, questId, uint64(block.timestamp))));
        emit StampSentToFuji(wallet, questId, messageID);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "./icm/TeleporterInterfaces.sol";
interface IZkEmailPassport {
    struct Attestation { bytes32 fromDomainHash; bytes32 publicKeyHash; bytes32 proofId; uint64 at; }
    function attestationOf(address wallet) external view returns (Attestation memory, string memory);
}
contract UniPassPassportBridgeV1 is Ownable2Step, EIP712, ITeleporterReceiver {
    struct PassportAttestation { address wallet; bytes32 schoolHash; uint64 expiresAt; uint64 nonce; uint64 deadline; }
    struct Route { address mirror; address quest; }
    bytes32 private constant PASSPORT_TYPEHASH = keccak256("PassportAttestation(address wallet,bytes32 schoolHash,uint64 expiresAt,uint64 nonce,uint64 deadline)");
    ITeleporterMessenger public immutable teleporter;
    address public immutable zkEmail;
    address public issuer;
    mapping(bytes32 => Route) public routes;
    mapping(uint64 => bool) public usedNonce;
    mapping(address => mapping(bytes32 => mapping(uint256 => uint64))) public l1Stamps;
    event PassportSent(address indexed wallet, bytes32 indexed l1BlockchainID, bytes32 messageID, bytes32 schoolHash, uint64 expiresAt, bool zkVerified);
    event L1StampReceived(address indexed wallet, bytes32 indexed source, uint256 indexed questId, uint64 claimedAt);
    constructor(address owner_, address teleporter_, address issuer_, address zkEmail_) Ownable(owner_) EIP712("UniPassPassportBridge", "1") {
        require(teleporter_ != address(0) && issuer_ != address(0), "Invalid address");
        teleporter = ITeleporterMessenger(teleporter_); issuer = issuer_; zkEmail = zkEmail_;
    }
    function setRoute(bytes32 id, address mirror, address quest) external onlyOwner {
        require(id != bytes32(0) && mirror != address(0) && quest != address(0), "Invalid route");
        routes[id] = Route(mirror, quest);
    }
    function setIssuer(address value) external onlyOwner { require(value != address(0), "Invalid issuer"); issuer = value; }
    function sendPassport(bytes32 id, PassportAttestation calldata a, bytes calldata sig) external returns (bytes32 messageID) {
        require(msg.sender == a.wallet && a.wallet != address(0), "Wrong wallet");
        require(block.timestamp <= a.deadline && a.expiresAt > block.timestamp, "Expired passport");
        require(!usedNonce[a.nonce], "Nonce used");
        Route memory route = routes[id]; require(route.mirror != address(0), "Route missing");
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(PASSPORT_TYPEHASH, a.wallet, a.schoolHash, a.expiresAt, a.nonce, a.deadline)));
        require(ECDSA.recover(digest, sig) == issuer, "Invalid issuer signature");
        usedNonce[a.nonce] = true;
        bool verified;
        if (zkEmail != address(0)) {
            try IZkEmailPassport(zkEmail).attestationOf(a.wallet) returns (IZkEmailPassport.Attestation memory proof, string memory) { verified = proof.proofId != bytes32(0); }
            catch { verified = false; }
        }
        address[] memory relayers = new address[](0);
        messageID = teleporter.sendCrossChainMessage(TeleporterMessageInput(id, route.mirror, TeleporterFeeInfo(address(0), 0), 300_000, relayers, abi.encode(uint8(1), a.wallet, a.schoolHash, a.expiresAt, verified, uint64(block.timestamp))));
        emit PassportSent(a.wallet, id, messageID, a.schoolHash, a.expiresAt, verified);
    }
    function receiveTeleporterMessage(bytes32 source, address origin, bytes calldata message) external {
        require(msg.sender == address(teleporter), "Only Teleporter");
        Route memory route = routes[source]; require(route.quest != address(0) && origin == route.quest, "Wrong route");
        (uint8 kind, address wallet, uint256 questId, uint64 claimedAt) = abi.decode(message, (uint8, address, uint256, uint64));
        require(kind == 2 && wallet != address(0), "Invalid stamp");
        if (l1Stamps[wallet][source][questId] != 0) return;
        l1Stamps[wallet][source][questId] = claimedAt;
        emit L1StampReceived(wallet, source, questId, claimedAt);
    }
    function l1StampOf(address wallet, bytes32 source, uint256 questId) external view returns (uint64) { return l1Stamps[wallet][source][questId]; }
}

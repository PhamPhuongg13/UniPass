// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "forge-std/Test.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "../../contracts/UniPassPassportBridgeV1.sol";
import "../../contracts/UniPassPassportMirrorV1.sol";
import "../../contracts/CampusQuestL1.sol";
import "../../contracts/icm/TeleporterInterfaces.sol";
contract MockTeleporter is ITeleporterMessenger {
    struct Message { bytes32 source; address origin; address destination; bytes data; }
    Message[] public messages;
    address public bridge;
    bytes32 public fujiID;
    bytes32 public l1ID;
    constructor(bytes32 fuji_, bytes32 l1_) { fujiID = fuji_; l1ID = l1_; }
    function setBridge(address value) external { bridge = value; }
    function sendCrossChainMessage(TeleporterMessageInput calldata input) external returns (bytes32) {
        messages.push(Message(msg.sender == bridge ? fujiID : l1ID, msg.sender, input.destinationAddress, input.message));
        return keccak256(abi.encode(messages.length, msg.sender, input.destinationAddress));
    }
    function deliver(uint256 index) external { Message storage m = messages[index]; ITeleporterReceiver(m.destination).receiveTeleporterMessage(m.source, m.origin, m.data); }
    function deliverAs(uint256 index, bytes32 source, address origin) external { Message storage m = messages[index]; ITeleporterReceiver(m.destination).receiveTeleporterMessage(source, origin, m.data); }
    function count() external view returns (uint256) { return messages.length; }
}
contract IcmPassportTest is Test {
    bytes32 internal constant FUJI = keccak256("fuji");
    bytes32 internal constant L1 = keccak256("l1");
    bytes32 internal constant TYPEHASH = keccak256("PassportAttestation(address wallet,bytes32 schoolHash,uint64 expiresAt,uint64 nonce,uint64 deadline)");
    uint256 internal issuerKey = 0xA11CE;
    uint256 internal studentKey = 0xB0B;
    address internal student;
    MockTeleporter internal teleporter;
    UniPassPassportBridgeV1 internal bridge;
    UniPassPassportMirrorV1 internal mirror;
    CampusQuestL1 internal quest;
    function setUp() public {
        student = vm.addr(studentKey);
        teleporter = new MockTeleporter(FUJI, L1);
        bridge = new UniPassPassportBridgeV1(address(this), address(teleporter), vm.addr(issuerKey), address(0));
        mirror = new UniPassPassportMirrorV1(address(this), address(teleporter), FUJI);
        quest = new CampusQuestL1(address(this), address(teleporter), address(mirror), FUJI, address(this));
        teleporter.setBridge(address(bridge));
        bridge.setRoute(L1, address(mirror), address(quest)); mirror.setBridge(address(bridge)); quest.setFujiBridge(address(bridge));
    }
    function passport(uint64 nonce) internal view returns (UniPassPassportBridgeV1.PassportAttestation memory a) {
        a = UniPassPassportBridgeV1.PassportAttestation(student, keccak256("vnu.edu.vn"), uint64(block.timestamp + 1 days), nonce, uint64(block.timestamp + 1 hours));
    }
    function passportSignature(UniPassPassportBridgeV1.PassportAttestation memory a) internal returns (bytes memory) {
        bytes32 domain = keccak256(abi.encode(keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"), keccak256("UniPassPassportBridge"), keccak256("1"), block.chainid, address(bridge)));
        bytes32 structHash = keccak256(abi.encode(TYPEHASH, a.wallet, a.schoolHash, a.expiresAt, a.nonce, a.deadline));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(issuerKey, keccak256(abi.encodePacked("\x19\x01", domain, structHash)));
        return abi.encodePacked(r, s, v);
    }
    function sendPassport(uint64 nonce) internal {
        UniPassPassportBridgeV1.PassportAttestation memory a = passport(nonce);
        bytes memory sig = passportSignature(a);
        vm.prank(student); bridge.sendPassport(L1, a, sig);
    }
    function claimSignature(uint256 questId, uint64 deadline) internal returns (bytes memory) {
        bytes32 digest = MessageHashUtils.toEthSignedMessageHash(bytes(quest.claimMessage(student, questId, deadline)));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(studentKey, digest);
        return abi.encodePacked(r, s, v);
    }
    function testRoundTripAndDoubleClaim() public {
        sendPassport(1); teleporter.deliver(0); assertTrue(mirror.isStudent(student));
        uint64 deadline = uint64(block.timestamp + 1 hours);
        bytes memory sig = claimSignature(7, deadline);
        quest.claimFor(student, 7, deadline, sig);
        assertTrue(quest.claimed(student, 7));
        teleporter.deliver(1);
        assertEq(bridge.l1StampOf(student, L1, 7), uint64(block.timestamp));
        vm.expectRevert("Already claimed"); quest.claimFor(student, 7, deadline, sig);
    }
    function testWrongSenderSourceAndOrigin() public {
        sendPassport(1);
        MockTeleporter.Message memory m;
        m; // Keep the message in the mock; only it may deliver.
        vm.expectRevert("Wrong route"); mirror.receiveTeleporterMessage(FUJI, address(bridge), hex"");
        vm.expectRevert("Wrong route"); teleporter.deliverAs(0, bytes32(uint256(999)), address(bridge));
        vm.expectRevert("Wrong route"); teleporter.deliverAs(0, FUJI, address(0xBAD));
        teleporter.deliver(0);
        uint64 deadline = uint64(block.timestamp + 1 hours);
        quest.claimFor(student, 1, deadline, claimSignature(1, deadline));
        vm.expectRevert("Only Teleporter"); bridge.receiveTeleporterMessage(L1, address(quest), hex"");
        vm.expectRevert("Wrong route"); teleporter.deliverAs(1, bytes32(uint256(999)), address(quest));
        vm.expectRevert("Wrong route"); teleporter.deliverAs(1, L1, address(0xBAD));
    }
    function testReplayNonceAndNonStudentClaim() public {
        sendPassport(1);
        UniPassPassportBridgeV1.PassportAttestation memory a = passport(1);
        bytes memory sig = passportSignature(a);
        vm.expectRevert("Nonce used"); vm.prank(student); bridge.sendPassport(L1, a, sig);
        uint64 deadline = uint64(block.timestamp + 1 hours);
        bytes memory claimSig = claimSignature(2, deadline);
        vm.expectRevert("Not student"); quest.claimFor(student, 2, deadline, claimSig);
    }
}

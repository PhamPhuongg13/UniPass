// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "forge-std/Test.sol";
import "forge-std/StdInvariant.sol";
import "../../contracts/UniPassEventManagerV2.sol";
import "../../contracts/UniPassTicketV2.sol";
contract EventHandler is Test {
    UniPassEventManagerV2 public manager;
    UniPassTicketV2 public ticket;
    uint256 internal issuerKey = 0xCAFE;
    uint256 public sequence;
    uint256[] internal ids;
    mapping(uint256 => mapping(bytes32 => uint256)) public ghostRegistrations;
    mapping(uint256 => uint256) public ghostMinted;
    bytes32 internal constant TYPEHASH = keccak256("RegistrationAuthorization(address wallet,uint256 eventId,uint256 chainId,address verifyingContract,uint64 expiresAt,bytes32 nonce,bytes32 purpose,bytes32 studentNullifier)");
    constructor() {
        manager = new UniPassEventManagerV2(address(this), vm.addr(issuerKey));
        ticket = new UniPassTicketV2(address(manager)); manager.setTicketContract(address(ticket));
    }
    function create(uint256 capSeed) external { ids.push(manager.createEvent(1 + capSeed % 5, uint64(block.timestamp + 1 days))); }
    function register(uint256 idSeed, uint256 nullifierSeed, uint256 walletSeed) external {
        if (ids.length == 0) return;
        uint256 id = ids[idSeed % ids.length]; bytes32 nullifier = bytes32(1 + nullifierSeed % 8); address wallet = vm.addr(100 + walletSeed % 8);
        UniPassEventManagerV2.RegistrationAuthorization memory a = UniPassEventManagerV2.RegistrationAuthorization(wallet, id, block.chainid, address(manager), uint64(block.timestamp + 300), bytes32(++sequence), manager.REGISTRATION_PURPOSE(), nullifier);
        bytes32 domain = keccak256(abi.encode(keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"), keccak256("UniPass Event Manager"), keccak256("2"), block.chainid, address(manager)));
        bytes32 structHash = keccak256(abi.encode(TYPEHASH, a.wallet, a.eventId, a.chainId, a.verifyingContract, a.expiresAt, a.nonce, a.purpose, a.studentNullifier));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(issuerKey, keccak256(abi.encodePacked("\x19\x01", domain, structHash)));
        vm.prank(wallet);
        try manager.registerEvent(a, abi.encodePacked(r, s, v)) { ghostRegistrations[id][nullifier]++; ghostMinted[id]++; } catch {}
    }
    function count() external view returns (uint256) { return ids.length; }
    function at(uint256 i) external view returns (uint256) { return ids[i]; }
}
contract EventManagerV2Invariant is StdInvariant, Test {
    EventHandler internal handler;
    function setUp() public { handler = new EventHandler(); targetContract(address(handler)); bytes4[] memory selectors = new bytes4[](2); selectors[0] = handler.create.selector; selectors[1] = handler.register.selector; targetSelector(FuzzSelector({addr: address(handler), selectors: selectors})); }
    function invariantUniqueNullifierAndCapacity() public view {
        for (uint256 i; i < handler.count(); i++) {
            uint256 id = handler.at(i); UniPassEventManagerV2.EventInfo memory eventInfo = handler.manager().getEvent(id);
            assertLe(eventInfo.minted, eventInfo.capacity); assertEq(eventInfo.minted, handler.ghostMinted(id));
            for (uint256 n = 1; n <= 8; n++) assertLe(handler.ghostRegistrations(id, bytes32(n)), 1);
        }
    }
    function testDifferentWalletCannotReuseNullifier() public {
        handler.create(2); handler.register(0, 1, 1); handler.register(0, 1, 2);
        assertEq(handler.manager().getEvent(handler.at(0)).minted, 1);
    }
    function testTicketNonTransferable() public {
        handler.create(2); handler.register(0, 1, 1);
        UniPassTicketV2 ticket = handler.ticket();
        address owner = ticket.ownerOf(1);
        vm.expectRevert("Non-transferable ticket"); vm.prank(owner); ticket.transferFrom(owner, address(0x1234), 1);
    }
}

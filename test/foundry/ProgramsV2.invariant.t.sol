// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "forge-std/Test.sol";
import "forge-std/StdInvariant.sol";
import "../../contracts/UniPassProgramsV2.sol";
import "../../contracts/UniPassTestUSDC.sol";

contract ProgramsFixture is Test {
    UniPassProgramsV2 internal programs;
    UniPassTestUSDC internal token;
    uint256 internal issuerKey = 0xA11CE;
    address internal issuer;
    address internal admin = address(0xAA);
    address internal operator = address(0xBB);
    bytes32 internal constant TYPEHASH = keccak256("StampAuthorization(uint256 programId,bytes32 nullifier,address recipient,uint256 chainId,address verifyingContract,uint64 expiresAt,bytes32 nonce,bytes32 purpose)");
    function setUp() public virtual {
        issuer = vm.addr(issuerKey);
        token = new UniPassTestUSDC(address(this));
        programs = new UniPassProgramsV2(admin, operator, issuer, address(token));
    }
    function authorization(uint256 id, bytes32 nullifier, address recipient, bytes32 nonce) internal view returns (UniPassProgramsV2.StampAuthorization memory a) {
        a = UniPassProgramsV2.StampAuthorization(id, nullifier, recipient, block.chainid, address(programs), uint64(block.timestamp + 300), nonce, programs.STAMP_PURPOSE());
    }
    function sign(UniPassProgramsV2.StampAuthorization memory a, uint256 key, uint256 chainId, address verifyingContract, string memory version) internal returns (bytes memory) {
        bytes32 domain = keccak256(abi.encode(keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"), keccak256(bytes("UniPass Programs")), keccak256(bytes(version)), chainId, verifyingContract));
        bytes32 structHash = keccak256(abi.encode(TYPEHASH, a.programId, a.nullifier, a.recipient, a.chainId, a.verifyingContract, a.expiresAt, a.nonce, a.purpose));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, keccak256(abi.encodePacked("\x19\x01", domain, structHash)));
        return abi.encodePacked(r, s, v);
    }
    function create(UniPassProgramsV2.Kind kind, uint32 cap, uint256 perClaim, uint256 maxAward) internal returns (uint256 id) {
        vm.prank(operator); id = programs.createProgram(kind, cap, uint64(block.timestamp + 1 days), perClaim, maxAward);
    }
    function fund(uint256 id, uint256 amount) internal {
        token.mint(address(this), amount); token.approve(address(programs), amount); programs.fundProgram(id, amount);
    }
    function stamp(uint256 id, bytes32 nullifier, address recipient, bytes32 nonce) internal {
        UniPassProgramsV2.StampAuthorization memory a = authorization(id, nullifier, recipient, nonce);
        programs.stamp(a, sign(a, issuerKey, block.chainid, address(programs), "2"));
    }
}
contract ProgramsV2Unit is ProgramsFixture {
    function testFundingAndPayoutIsolation() public {
        uint256 first = create(UniPassProgramsV2.Kind.Giveaway, 2, 10, 0);
        uint256 second = create(UniPassProgramsV2.Kind.Giveaway, 2, 20, 0);
        fund(second, 20);
        UniPassProgramsV2.StampAuthorization memory a = authorization(first, bytes32(uint256(1)), address(0xCAFE), bytes32(uint256(1)));
        bytes memory sig = sign(a, issuerKey, block.chainid, address(programs), "2");
        vm.expectRevert("Program budget exhausted"); programs.stamp(a, sig);
        fund(first, 10); stamp(first, bytes32(uint256(1)), address(0xCAFE), bytes32(uint256(1)));
        assertEq(token.balanceOf(address(0xCAFE)), 10);
        assertEq(programs.totalBudgets(), 20);
        assertEq(token.balanceOf(address(programs)), 20);
    }
    function testBadSignatureWrongDomainExpiredAndNonceReuse() public {
        uint256 id = create(UniPassProgramsV2.Kind.Discount, 3, 0, 0);
        UniPassProgramsV2.StampAuthorization memory a = authorization(id, bytes32(uint256(1)), address(0), bytes32(uint256(1)));
        vm.expectRevert("Invalid issuer signature"); programs.stamp(a, sign(a, 0xBAD, block.chainid, address(programs), "2"));
        vm.expectRevert("Invalid issuer signature"); programs.stamp(a, sign(a, issuerKey, block.chainid, address(programs), "1"));
        a.chainId++;
        vm.expectRevert("Wrong authorization domain"); programs.stamp(a, sign(a, issuerKey, block.chainid, address(programs), "2"));
        a.chainId--;
        a.expiresAt = uint64(block.timestamp);
        vm.expectRevert("Invalid authorization TTL"); programs.stamp(a, sign(a, issuerKey, block.chainid, address(programs), "2"));
        a.expiresAt = uint64(block.timestamp + 300);
        programs.stamp(a, sign(a, issuerKey, block.chainid, address(programs), "2"));
        a.nullifier = bytes32(uint256(2));
        vm.expectRevert("Nonce used or invalid"); programs.stamp(a, sign(a, issuerKey, block.chainid, address(programs), "2"));
    }
    function testAwardLimits() public {
        uint256 id = create(UniPassProgramsV2.Kind.Scholarship, 2, 0, 50);
        fund(id, 20);
        stamp(id, bytes32(uint256(1)), address(0), bytes32(uint256(1)));
        vm.prank(operator); vm.expectRevert("Invalid award"); programs.award(id, bytes32(uint256(1)), address(0xCAFE), 51);
        vm.prank(operator); vm.expectRevert("Program budget exhausted"); programs.award(id, bytes32(uint256(1)), address(0xCAFE), 21);
        vm.prank(operator); programs.award(id, bytes32(uint256(1)), address(0xCAFE), 20);
        assertEq(programs.totalBudgets(), 0);
    }
    function testRoleChecksAndWithdrawBeforeClose() public {
        uint256 id = create(UniPassProgramsV2.Kind.Giveaway, 1, 10, 0); fund(id, 10);
        vm.expectRevert(); programs.createProgram(UniPassProgramsV2.Kind.Discount, 1, uint64(block.timestamp + 1 days), 0, 0);
        vm.prank(operator); vm.expectRevert(); programs.withdrawUnused(id, operator);
        vm.prank(address(0xBAD)); vm.expectRevert(); programs.withdrawUnused(id, address(0xBAD));
        vm.prank(admin); vm.expectRevert("Program still open"); programs.withdrawUnused(id, admin);
        vm.prank(admin); programs.closeProgram(id);
        vm.prank(admin); programs.withdrawUnused(id, admin);
        assertEq(token.balanceOf(admin), 10);
        vm.prank(operator); vm.expectRevert(); programs.setIssuer(address(0xBEEF));
    }
}
contract ProgramsHandler is ProgramsFixture {
    uint256 public funded;
    uint256 public paid;
    uint256 public withdrawn;
    uint256 public nonceCounter;
    mapping(uint256 => mapping(bytes32 => uint256)) public successfulStamps;
    uint256[] public created;
    function setUp() public override {
        super.setUp();
        token.mint(address(this), 1_000_000_000);
        token.approve(address(programs), type(uint256).max);
    }
    function createProgram(uint8 kindSeed, uint32 capSeed, uint256 amountSeed) external {
        UniPassProgramsV2.Kind kind = UniPassProgramsV2.Kind(kindSeed % 4);
        uint32 cap = uint32(1 + capSeed % 5);
        uint256 amount = 1 + amountSeed % 100;
        vm.prank(operator);
        uint256 id = programs.createProgram(kind, cap, uint64(block.timestamp + 1 days), kind == UniPassProgramsV2.Kind.Giveaway ? amount : 0, kind == UniPassProgramsV2.Kind.Scholarship ? amount : 0);
        created.push(id);
    }
    function fundProgram(uint256 idSeed, uint256 amountSeed) external {
        if (created.length == 0) return;
        uint256 id = created[idSeed % created.length]; uint256 amount = 1 + amountSeed % 1000;
        if (token.balanceOf(address(this)) < amount) return;
        try programs.fundProgram(id, amount) { funded += amount; } catch {}
    }
    function stampProgram(uint256 idSeed, uint256 nullifierSeed, uint256 recipientSeed) external {
        if (created.length == 0) return;
        uint256 id = created[idSeed % created.length];
        bytes32 nullifier = bytes32(1 + nullifierSeed % 8);
        address recipient = vm.addr(100 + recipientSeed % 8);
        UniPassProgramsV2.StampAuthorization memory a = authorization(id, nullifier, recipient, bytes32(++nonceCounter));
        uint256 amount = programs.getProgram(id).amountPerClaim;
        try programs.stamp(a, sign(a, issuerKey, block.chainid, address(programs), "2")) {
            successfulStamps[id][nullifier]++;
            if (amount > 0) paid += amount;
        } catch {}
    }
    function awardProgram(uint256 idSeed, uint256 nullifierSeed, uint256 amountSeed) external {
        if (created.length == 0) return;
        uint256 id = created[idSeed % created.length]; bytes32 nullifier = bytes32(1 + nullifierSeed % 8);
        uint256 amount = 1 + amountSeed % 100;
        vm.prank(operator);
        try programs.award(id, nullifier, vm.addr(200 + nullifierSeed % 8), amount) { paid += amount; } catch {}
    }
    function closeProgram(uint256 idSeed) external {
        if (created.length == 0) return;
        vm.prank(operator); try programs.closeProgram(created[idSeed % created.length]) {} catch {}
    }
    function withdraw(uint256 idSeed) external {
        if (created.length == 0) return;
        uint256 id = created[idSeed % created.length]; uint256 amount = programs.getProgram(id).budget;
        vm.prank(admin); try programs.withdrawUnused(id, admin) { withdrawn += amount; } catch {}
    }
    function programsContract() external view returns (UniPassProgramsV2) { return programs; }
    function tokenContract() external view returns (UniPassTestUSDC) { return token; }
    function count() external view returns (uint256) { return created.length; }
    function at(uint256 i) external view returns (uint256) { return created[i]; }
}
contract ProgramsV2Invariant is StdInvariant, Test {
    ProgramsHandler internal handler;
    function setUp() public {
        handler = new ProgramsHandler(); handler.setUp(); targetContract(address(handler));
        bytes4[] memory selectors = new bytes4[](6);
        selectors[0] = handler.createProgram.selector; selectors[1] = handler.fundProgram.selector;
        selectors[2] = handler.stampProgram.selector; selectors[3] = handler.awardProgram.selector;
        selectors[4] = handler.closeProgram.selector; selectors[5] = handler.withdraw.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
    }
    function invariantNullifierAndCap() public view {
        for (uint256 i; i < handler.count(); i++) {
            uint256 id = handler.at(i);
            assertLe(handler.programsContract().stamps(id), handler.programsContract().getProgram(id).cap);
            for (uint256 n = 1; n <= 8; n++) assertLe(handler.successfulStamps(id, bytes32(n)), 1);
        }
    }
    function invariantBudgetConservation() public view {
        UniPassProgramsV2 p = handler.programsContract();
        UniPassTestUSDC t = handler.tokenContract();
        uint256 sum;
        for (uint256 i; i < handler.count(); i++) sum += p.getProgram(handler.at(i)).budget;
        assertEq(sum, p.totalBudgets());
        assertEq(t.balanceOf(address(p)), p.totalBudgets());
        assertEq(handler.paid() + handler.withdrawn() + sum, handler.funded());
    }
}

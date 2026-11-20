// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "forge-std/Test.sol";
import "../../contracts/UniPassZkEmailV1.sol";
import "../../contracts/sp1/ISP1Verifier.sol";
contract MockSP1Verifier is ISP1Verifier {
    bool public reject;
    function setReject(bool value) external { reject = value; }
    function verifyProof(bytes32, bytes calldata, bytes calldata) external view { require(!reject, "Mock rejected"); }
}
contract ZkEmailV1Test is Test {
    MockSP1Verifier internal verifier;
    UniPassZkEmailV1 internal zk;
    bytes32 internal key = bytes32(uint256(0x1234));
    function setUp() public { verifier = new MockSP1Verifier(); zk = new UniPassZkEmailV1(address(this), address(verifier), bytes32(uint256(1))); }
    function values(bytes32 domainHash, bytes32 keyHash) internal pure returns (bytes memory) {
        return abi.encode(uint256(0x20), uint256(0x40), bytes32(0), domainHash, keyHash);
    }
    function testKnownKeyAndReplay() public {
        zk.setDkimKey("vnu.edu.vn", key, true);
        bytes memory proof = hex"1234";
        bytes memory publicValues = values(sha256("vnu.edu.vn"), key);
        vm.prank(address(0xCAFE)); zk.proveStudentEmail(publicValues, proof);
        (UniPassZkEmailV1.Attestation memory attestation, string memory domain) = zk.attestationOf(address(0xCAFE));
        assertEq(attestation.fromDomainHash, sha256("vnu.edu.vn")); assertEq(attestation.publicKeyHash, key); assertEq(domain, "vnu.edu.vn");
        vm.expectRevert(UniPassZkEmailV1.ProofAlreadyUsed.selector); zk.proveStudentEmail(publicValues, proof);
    }
    function testUnknownMalformedAndVerifierReject() public {
        bytes memory publicValues = values(sha256("vnu.edu.vn"), key);
        vm.expectRevert(UniPassZkEmailV1.UnknownDkimKey.selector); zk.proveStudentEmail(publicValues, hex"11");
        vm.expectRevert(UniPassZkEmailV1.InvalidPublicValues.selector); zk.proveStudentEmail(hex"1234", hex"12");
        zk.setDkimKey("vnu.edu.vn", key, true); verifier.setReject(true);
        vm.expectRevert("Mock rejected"); zk.proveStudentEmail(publicValues, hex"34");
    }
    function testDomainAndOwnerRestrictions() public {
        vm.expectRevert(UniPassZkEmailV1.InvalidDomain.selector); zk.setDkimKey("example.com", key, true);
        vm.expectRevert(); vm.prank(address(0xBAD)); zk.setDkimKey("vnu.edu.vn", key, true);
    }
    function testRealFixturePublicValues() public {
        string memory json = vm.readFile("scripts/zkemail/fixtures/vnu-proof-v2.json");
        bytes memory publicValues = vm.parseJsonBytes(json, ".publicValues");
        bytes32 domainHash = vm.parseJsonBytes32(json, ".expected.fromDomainHash");
        bytes32 publicKeyHash = vm.parseJsonBytes32(json, ".expected.publicKeyHash");
        bytes memory proof = vm.parseJsonBytes(json, ".proof");
        zk.setDkimKey("vnu.edu.vn", publicKeyHash, true);
        vm.prank(address(0xCAFE)); zk.proveStudentEmail(publicValues, proof);
        (UniPassZkEmailV1.Attestation memory a,) = zk.attestationOf(address(0xCAFE));
        assertEq(a.fromDomainHash, domainHash); assertEq(a.publicKeyHash, publicKeyHash);
    }
}

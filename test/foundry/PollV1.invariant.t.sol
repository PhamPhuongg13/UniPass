// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "forge-std/Test.sol";
import "forge-std/StdInvariant.sol";
import "../../contracts/UniPassPollV1.sol";
contract PollHandler is Test {
    UniPassPollV1 public poll;
    uint256 internal issuerKey = 0xBEEF;
    uint256 public sequence;
    uint256[] internal ids;
    mapping(uint256 => mapping(bytes32 => uint256)) public ghostVotes;
    mapping(uint256 => uint256) public ghostCount;
    bytes32 internal constant TYPEHASH = keccak256("VoteAuthorization(uint256 pollId,uint8 option,bytes32 voterNullifier,uint256 chainId,address verifyingContract,uint64 expiresAt,bytes32 nonce,bytes32 purpose)");
    constructor() { poll = new UniPassPollV1(address(this), vm.addr(issuerKey)); }
    function create(uint8 optionsSeed) external { ids.push(poll.createPoll(uint8(2 + optionsSeed % 9), uint64(block.timestamp + 1 days))); }
    function vote(uint256 idSeed, uint8 optionSeed, uint256 nullifierSeed) external {
        if (ids.length == 0) return;
        uint256 id = ids[idSeed % ids.length]; UniPassPollV1.Poll memory p = poll.getPoll(id);
        bytes32 nullifier = bytes32(1 + nullifierSeed % 8);
        UniPassPollV1.VoteAuthorization memory a = UniPassPollV1.VoteAuthorization(id, uint8(optionSeed % p.optionCount), nullifier, block.chainid, address(poll), uint64(block.timestamp + 300), bytes32(++sequence), poll.VOTE_PURPOSE());
        bytes32 domain = keccak256(abi.encode(keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"), keccak256("UniPass Poll"), keccak256("1"), block.chainid, address(poll)));
        bytes32 structHash = keccak256(abi.encode(TYPEHASH, a.pollId, a.option, a.voterNullifier, a.chainId, a.verifyingContract, a.expiresAt, a.nonce, a.purpose));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(issuerKey, keccak256(abi.encodePacked("\x19\x01", domain, structHash)));
        try poll.vote(a, abi.encodePacked(r, s, v)) { ghostVotes[id][nullifier]++; ghostCount[id]++; } catch {}
    }
    function close(uint256 seed) external { if (ids.length == 0) return; try poll.closePoll(ids[seed % ids.length]) {} catch {} }
    function count() external view returns (uint256) { return ids.length; }
    function at(uint256 i) external view returns (uint256) { return ids[i]; }
}
contract PollV1Invariant is StdInvariant, Test {
    PollHandler internal handler;
    function setUp() public { handler = new PollHandler(); targetContract(address(handler)); bytes4[] memory selectors = new bytes4[](3); selectors[0] = handler.create.selector; selectors[1] = handler.vote.selector; selectors[2] = handler.close.selector; targetSelector(FuzzSelector({addr: address(handler), selectors: selectors})); }
    function invariantOneVoteAndTallies() public view {
        for (uint256 i; i < handler.count(); i++) {
            uint256 id = handler.at(i);
            for (uint256 n = 1; n <= 8; n++) assertLe(handler.ghostVotes(id, bytes32(n)), 1);
            uint256[] memory results = handler.poll().getResults(id); uint256 sum;
            for (uint256 j; j < results.length; j++) sum += results[j];
            assertEq(sum, handler.ghostCount(id));
        }
    }
    function testVotesAfterCloseRevert() public {
        handler.create(2); handler.close(0); uint256 id = handler.at(0);
        assertTrue(handler.poll().getPoll(id).closed);
        handler.vote(0, 0, 1);
        assertEq(handler.ghostCount(id), 0);
    }
}

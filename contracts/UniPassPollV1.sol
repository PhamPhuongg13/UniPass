// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

contract UniPassPollV1 is Ownable2Step, EIP712 {
    bytes32 public constant VOTE_PURPOSE = keccak256("UNIPASS_POLL_VOTE_V1");
    uint64 public constant MAX_AUTHORIZATION_TTL = 10 minutes;
    bytes32 private constant VOTE_TYPEHASH = keccak256("VoteAuthorization(uint256 pollId,uint8 option,bytes32 voterNullifier,uint256 chainId,address verifyingContract,uint64 expiresAt,bytes32 nonce,bytes32 purpose)");

    struct Poll { uint8 optionCount; uint64 closesAt; bool closed; }
    struct VoteAuthorization {
        uint256 pollId;
        uint8 option;
        bytes32 voterNullifier;
        uint256 chainId;
        address verifyingContract;
        uint64 expiresAt;
        bytes32 nonce;
        bytes32 purpose;
    }

    address public issuer;
    uint256 public nextPollId = 1;
    mapping(uint256 => Poll) private polls;
    mapping(uint256 => mapping(uint8 => uint256)) public votes;
    mapping(uint256 => mapping(bytes32 => bool)) public voterNullifierUsed;
    mapping(bytes32 => bool) public usedAuthorization;

    event PollCreated(uint256 indexed pollId, uint8 optionCount, uint64 closesAt);
    event VoteCast(uint256 indexed pollId, uint8 option, bytes32 indexed voterNullifier);
    event PollClosed(uint256 indexed pollId);
    event IssuerUpdated(address indexed previousIssuer, address indexed newIssuer);

    constructor(address initialOwner, address initialIssuer) Ownable(initialOwner) EIP712("UniPass Poll", "1") {
        require(initialOwner != address(0), "Invalid owner");
        require(initialIssuer != address(0), "Invalid issuer");
        issuer = initialIssuer;
    }

    function createPoll(uint8 optionCount, uint64 closesAt) external onlyOwner returns (uint256 pollId) {
        require(optionCount >= 2 && optionCount <= 10, "Invalid option count");
        require(closesAt > block.timestamp, "Invalid closing time");
        pollId = nextPollId++;
        polls[pollId] = Poll(optionCount, closesAt, false);
        emit PollCreated(pollId, optionCount, closesAt);
    }

    function setIssuer(address newIssuer) external onlyOwner {
        address oldIssuer = issuer;
        issuer = newIssuer;
        emit IssuerUpdated(oldIssuer, newIssuer);
    }

    function closePoll(uint256 pollId) external onlyOwner {
        require(pollId > 0 && pollId < nextPollId, "Poll does not exist");
        require(!polls[pollId].closed, "Poll already closed");
        polls[pollId].closed = true;
        emit PollClosed(pollId);
    }

    function getPoll(uint256 pollId) external view returns (Poll memory) {
        require(pollId > 0 && pollId < nextPollId, "Poll does not exist");
        return polls[pollId];
    }

    function getResults(uint256 pollId) external view returns (uint256[] memory results) {
        require(pollId > 0 && pollId < nextPollId, "Poll does not exist");
        results = new uint256[](polls[pollId].optionCount);
        for (uint8 i = 0; i < results.length; ++i) results[i] = votes[pollId][i];
    }

    function vote(VoteAuthorization calldata auth, bytes calldata signature) external {
        require(issuer != address(0), "Issuer paused");
        require(auth.chainId == block.chainid, "Wrong chain");
        require(auth.verifyingContract == address(this), "Wrong contract");
        require(auth.purpose == VOTE_PURPOSE, "Wrong purpose");
        require(auth.nonce != bytes32(0) && !usedAuthorization[auth.nonce], "Nonce used or invalid");
        require(auth.expiresAt > block.timestamp, "Authorization expired");
        require(auth.expiresAt <= block.timestamp + MAX_AUTHORIZATION_TTL, "Authorization TTL too long");
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(VOTE_TYPEHASH, auth.pollId, auth.option, auth.voterNullifier, auth.chainId, auth.verifyingContract, auth.expiresAt, auth.nonce, auth.purpose)));
        require(ECDSA.recover(digest, signature) == issuer, "Invalid issuer signature");
        require(auth.pollId > 0 && auth.pollId < nextPollId, "Poll does not exist");
        Poll storage poll = polls[auth.pollId];
        require(!poll.closed && poll.closesAt > block.timestamp, "Poll closed");
        require(auth.option < poll.optionCount, "Invalid option");
        require(auth.voterNullifier != bytes32(0), "Invalid voter nullifier");
        require(!voterNullifierUsed[auth.pollId][auth.voterNullifier], "Passport already voted");
        usedAuthorization[auth.nonce] = true;
        voterNullifierUsed[auth.pollId][auth.voterNullifier] = true;
        votes[auth.pollId][auth.option]++;
        emit VoteCast(auth.pollId, auth.option, auth.voterNullifier);
    }
}

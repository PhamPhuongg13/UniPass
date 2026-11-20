// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract UniPassProgramsV1 is Ownable2Step, EIP712 {
    using SafeERC20 for IERC20;
    bytes32 public constant STAMP_PURPOSE = keccak256("UNIPASS_PROGRAM_STAMP_V1");
    uint64 public constant MAX_AUTHORIZATION_TTL = 10 minutes;
    bytes32 private constant STAMP_TYPEHASH = keccak256("StampAuthorization(uint256 programId,bytes32 nullifier,address recipient,uint256 chainId,address verifyingContract,uint64 expiresAt,bytes32 nonce,bytes32 purpose)");
    enum Kind { Giveaway, Scholarship, Discount, Ecosystem }
    struct Program { Kind kind; uint32 cap; uint64 closesAt; uint256 amountPerClaim; bool closed; }
    struct StampAuthorization { uint256 programId; bytes32 nullifier; address recipient; uint256 chainId; address verifyingContract; uint64 expiresAt; bytes32 nonce; bytes32 purpose; }
    IERC20 public immutable token;
    address public issuer;
    uint256 public nextProgramId = 1;
    mapping(uint256 => Program) private programs;
    mapping(uint256 => uint256) public stamps;
    mapping(uint256 => mapping(bytes32 => bool)) private usedNullifiers;
    mapping(uint256 => mapping(bytes32 => bool)) private awardedNullifiers;
    mapping(bytes32 => bool) public usedAuthorization;
    event ProgramCreated(uint256 indexed programId, Kind kind, uint32 cap, uint64 closesAt, uint256 amountPerClaim);
    event Stamped(uint256 indexed programId, bytes32 indexed nullifier, address recipient);
    event Awarded(uint256 indexed programId, bytes32 indexed nullifier, address recipient, uint256 amount);
    event ProgramClosed(uint256 indexed programId);

    constructor(address initialOwner, address initialIssuer, address initialToken) Ownable(initialOwner) EIP712("UniPass Programs", "1") {
        require(initialOwner != address(0) && initialIssuer != address(0) && initialToken != address(0), "Invalid address");
        issuer = initialIssuer;
        token = IERC20(initialToken);
    }
    function createProgram(Kind kind, uint32 cap, uint64 closesAt, uint256 amountPerClaim) external onlyOwner returns (uint256 id) {
        require(cap > 0 && closesAt > block.timestamp, "Invalid program");
        require(kind == Kind.Giveaway || amountPerClaim == 0, "Invalid amount");
        if (kind == Kind.Giveaway) require(amountPerClaim > 0, "Invalid amount");
        id = nextProgramId++;
        programs[id] = Program(kind, cap, closesAt, amountPerClaim, false);
        emit ProgramCreated(id, kind, cap, closesAt, amountPerClaim);
    }
    function stamp(StampAuthorization calldata a, bytes calldata sig) external {
        require(a.chainId == block.chainid && a.verifyingContract == address(this) && a.purpose == STAMP_PURPOSE, "Wrong authorization domain");
        require(a.expiresAt > block.timestamp && a.expiresAt <= block.timestamp + MAX_AUTHORIZATION_TTL, "Invalid authorization TTL");
        require(a.nonce != bytes32(0) && !usedAuthorization[a.nonce], "Nonce used or invalid");
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(STAMP_TYPEHASH, a.programId, a.nullifier, a.recipient, a.chainId, a.verifyingContract, a.expiresAt, a.nonce, a.purpose)));
        require(ECDSA.recover(digest, sig) == issuer, "Invalid issuer signature");
        require(a.programId > 0 && a.programId < nextProgramId, "Program does not exist");
        Program storage p = programs[a.programId];
        require(!p.closed && p.closesAt > block.timestamp && stamps[a.programId] < p.cap, "Program closed or full");
        require(a.nullifier != bytes32(0) && !usedNullifiers[a.programId][a.nullifier], "Passport already stamped");
        if (p.kind == Kind.Giveaway) {
            require(a.recipient != address(0), "Invalid recipient");
            require(token.balanceOf(address(this)) >= p.amountPerClaim, "Insufficient program balance");
        }
        usedAuthorization[a.nonce] = true;
        usedNullifiers[a.programId][a.nullifier] = true;
        stamps[a.programId]++;
        if (p.kind == Kind.Giveaway) token.safeTransfer(a.recipient, p.amountPerClaim);
        emit Stamped(a.programId, a.nullifier, a.recipient);
    }
    function award(uint256 programId, bytes32 nullifier, address recipient, uint256 amount) external onlyOwner {
        require(programId > 0 && programId < nextProgramId && programs[programId].kind == Kind.Scholarship, "Not a scholarship");
        require(usedNullifiers[programId][nullifier] && !awardedNullifiers[programId][nullifier], "Applicant not eligible");
        require(recipient != address(0) && amount > 0 && token.balanceOf(address(this)) >= amount, "Invalid award");
        awardedNullifiers[programId][nullifier] = true;
        token.safeTransfer(recipient, amount);
        emit Awarded(programId, nullifier, recipient, amount);
    }
    function closeProgram(uint256 id) external onlyOwner { require(id > 0 && id < nextProgramId, "Program does not exist"); programs[id].closed = true; emit ProgramClosed(id); }
    function getProgram(uint256 id) external view returns (Program memory) { require(id > 0 && id < nextProgramId, "Program does not exist"); return programs[id]; }
    function stampCount(uint256 id) external view returns (uint256) { return stamps[id]; }
    function nullifierUsed(uint256 id, bytes32 n) external view returns (bool) { return usedNullifiers[id][n]; }
    function awarded(uint256 id, bytes32 n) external view returns (bool) { return awardedNullifiers[id][n]; }
}

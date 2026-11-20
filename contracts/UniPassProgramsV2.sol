// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract UniPassProgramsV2 is AccessControl, EIP712 {
    using SafeERC20 for IERC20;
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant STAMP_PURPOSE = keccak256("UNIPASS_PROGRAM_STAMP_V1");
    uint64 public constant MAX_AUTHORIZATION_TTL = 10 minutes;
    bytes32 private constant STAMP_TYPEHASH = keccak256("StampAuthorization(uint256 programId,bytes32 nullifier,address recipient,uint256 chainId,address verifyingContract,uint64 expiresAt,bytes32 nonce,bytes32 purpose)");
    enum Kind { Giveaway, Scholarship, Discount, Ecosystem }
    struct Program { Kind kind; uint32 cap; uint64 closesAt; uint256 amountPerClaim; uint256 maxAward; uint256 budget; bool closed; }
    struct StampAuthorization { uint256 programId; bytes32 nullifier; address recipient; uint256 chainId; address verifyingContract; uint64 expiresAt; bytes32 nonce; bytes32 purpose; }
    IERC20 public immutable token;
    address public issuer;
    uint256 public nextProgramId = 1;
    uint256 public totalBudgets;
    mapping(uint256 => Program) private programs;
    mapping(uint256 => uint256) public stamps;
    mapping(uint256 => mapping(bytes32 => bool)) private usedNullifiers;
    mapping(uint256 => mapping(bytes32 => bool)) private awardedNullifiers;
    mapping(bytes32 => bool) public usedAuthorization;
    event ProgramCreated(uint256 indexed programId, Kind kind, uint32 cap, uint64 closesAt, uint256 amountPerClaim, uint256 maxAward);
    event ProgramFunded(uint256 indexed programId, address indexed funder, uint256 amount);
    event Stamped(uint256 indexed programId, bytes32 indexed nullifier, address recipient);
    event Awarded(uint256 indexed programId, bytes32 indexed nullifier, address recipient, uint256 amount);
    event ProgramClosed(uint256 indexed programId);
    event UnusedWithdrawn(uint256 indexed programId, address indexed to, uint256 amount);
    event IssuerUpdated(address indexed previousIssuer, address indexed newIssuer);

    constructor(address admin, address operator, address initialIssuer, address initialToken) EIP712("UniPass Programs", "2") {
        require(admin != address(0) && operator != address(0) && initialIssuer != address(0) && initialToken != address(0), "Invalid address");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(OPERATOR_ROLE, operator);
        issuer = initialIssuer;
        token = IERC20(initialToken);
    }
    function createProgram(Kind kind, uint32 cap, uint64 closesAt, uint256 amountPerClaim, uint256 maxAward) external onlyRole(OPERATOR_ROLE) returns (uint256 id) {
        require(cap > 0 && closesAt > block.timestamp, "Invalid program");
        if (kind == Kind.Giveaway) require(amountPerClaim > 0 && maxAward == 0, "Invalid amount");
        else if (kind == Kind.Scholarship) require(amountPerClaim == 0 && maxAward > 0, "Invalid amount");
        else require(amountPerClaim == 0 && maxAward == 0, "Invalid amount");
        id = nextProgramId++;
        programs[id] = Program(kind, cap, closesAt, amountPerClaim, maxAward, 0, false);
        emit ProgramCreated(id, kind, cap, closesAt, amountPerClaim, maxAward);
    }
    function fundProgram(uint256 id, uint256 amount) external {
        require(id > 0 && id < nextProgramId, "Program does not exist");
        require(!programs[id].closed, "Program closed");
        require(amount > 0, "Invalid amount");
        uint256 beforeBalance = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), amount);
        require(token.balanceOf(address(this)) - beforeBalance == amount, "Unsupported token");
        programs[id].budget += amount;
        totalBudgets += amount;
        emit ProgramFunded(id, msg.sender, amount);
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
            require(p.budget >= p.amountPerClaim, "Program budget exhausted");
            p.budget -= p.amountPerClaim;
            totalBudgets -= p.amountPerClaim;
        }
        usedAuthorization[a.nonce] = true;
        usedNullifiers[a.programId][a.nullifier] = true;
        stamps[a.programId]++;
        if (p.kind == Kind.Giveaway) token.safeTransfer(a.recipient, p.amountPerClaim);
        emit Stamped(a.programId, a.nullifier, a.recipient);
    }
    function award(uint256 id, bytes32 nullifier, address recipient, uint256 amount) external onlyRole(OPERATOR_ROLE) {
        require(id > 0 && id < nextProgramId && programs[id].kind == Kind.Scholarship, "Not a scholarship");
        require(usedNullifiers[id][nullifier] && !awardedNullifiers[id][nullifier], "Applicant not eligible");
        Program storage p = programs[id];
        require(recipient != address(0) && amount > 0 && amount <= p.maxAward, "Invalid award");
        require(amount <= p.budget, "Program budget exhausted");
        awardedNullifiers[id][nullifier] = true;
        p.budget -= amount;
        totalBudgets -= amount;
        token.safeTransfer(recipient, amount);
        emit Awarded(id, nullifier, recipient, amount);
    }
    function closeProgram(uint256 id) external {
        require(hasRole(OPERATOR_ROLE, msg.sender) || hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Unauthorized");
        require(id > 0 && id < nextProgramId, "Program does not exist");
        programs[id].closed = true;
        emit ProgramClosed(id);
    }
    function withdrawUnused(uint256 id, address to) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(id > 0 && id < nextProgramId, "Program does not exist");
        require(to != address(0), "Invalid recipient");
        Program storage p = programs[id];
        require(p.closed || p.closesAt <= block.timestamp, "Program still open");
        uint256 amount = p.budget;
        p.budget = 0;
        totalBudgets -= amount;
        token.safeTransfer(to, amount);
        emit UnusedWithdrawn(id, to, amount);
    }
    function setIssuer(address value) external onlyRole(DEFAULT_ADMIN_ROLE) { require(value != address(0), "Invalid issuer"); emit IssuerUpdated(issuer, value); issuer = value; }
    function getProgram(uint256 id) external view returns (Program memory) { require(id > 0 && id < nextProgramId, "Program does not exist"); return programs[id]; }
    function stampCount(uint256 id) external view returns (uint256) { return stamps[id]; }
    function nullifierUsed(uint256 id, bytes32 n) external view returns (bool) { return usedNullifiers[id][n]; }
    function awarded(uint256 id, bytes32 n) external view returns (bool) { return awardedNullifiers[id][n]; }
}

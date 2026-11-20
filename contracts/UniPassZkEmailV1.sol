// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "./sp1/ISP1Verifier.sol";

contract UniPassZkEmailV1 is Ownable2Step {
    error InvalidDomain();
    error InvalidPublicValues();
    error UnknownDkimKey();
    error ProofAlreadyUsed();

    struct Attestation {
        bytes32 fromDomainHash;
        bytes32 publicKeyHash;
        bytes32 proofId;
        uint64 at;
    }

    ISP1Verifier public immutable verifier;
    bytes32 public immutable programVKey;
    mapping(bytes32 => string) public dkimDomain;
    mapping(bytes32 => bool) public proofUsed;
    mapping(address => Attestation) private attestations;

    event DkimKeySet(string domain, bytes32 fromDomainHash, bytes32 publicKeyHash, bool allowed);
    event StudentEmailProven(address indexed wallet, string domain, bytes32 fromDomainHash, bytes32 publicKeyHash, bytes32 proofId);

    constructor(address initialOwner, address verifier_, bytes32 programVKey_) Ownable(initialOwner) {
        require(verifier_ != address(0) && programVKey_ != bytes32(0), "Invalid verifier");
        verifier = ISP1Verifier(verifier_);
        programVKey = programVKey_;
    }

    function setDkimKey(string calldata domain, bytes32 publicKeyHash, bool allowed) external onlyOwner {
        bytes memory name = bytes(domain);
        bytes memory suffix = bytes(".edu.vn");
        if (name.length <= suffix.length) revert InvalidDomain();
        for (uint256 i; i < name.length; ++i) {
            bytes1 c = name[i];
            if (!((c >= 0x61 && c <= 0x7a) || (c >= 0x30 && c <= 0x39) || c == 0x2d || c == 0x2e)) revert InvalidDomain();
            if (c == 0x2e && (i == 0 || name[i - 1] == 0x2e)) revert InvalidDomain();
        }
        for (uint256 i; i < suffix.length; ++i) if (name[name.length - suffix.length + i] != suffix[i]) revert InvalidDomain();
        bytes32 fromDomainHash = sha256(name);
        bytes32 key = keccak256(abi.encode(fromDomainHash, publicKeyHash));
        if (allowed) dkimDomain[key] = domain;
        else delete dkimDomain[key];
        emit DkimKeySet(domain, fromDomainHash, publicKeyHash, allowed);
    }

    function isDkimKeyAllowed(bytes32 fromDomainHash, bytes32 publicKeyHash) external view returns (bool, string memory) {
        string memory domain = dkimDomain[keccak256(abi.encode(fromDomainHash, publicKeyHash))];
        return (bytes(domain).length != 0, domain);
    }

    function proveStudentEmail(bytes calldata publicValues, bytes calldata proofBytes) external returns (string memory domain) {
        verifier.verifyProof(programVKey, publicValues, proofBytes);
        if (publicValues.length < 160) revert InvalidPublicValues();
        bytes32 word0;
        bytes32 word1;
        bytes32 fromDomainHash;
        bytes32 publicKeyHash;
        assembly {
            word0 := calldataload(publicValues.offset)
            word1 := calldataload(add(publicValues.offset, 32))
            fromDomainHash := calldataload(add(publicValues.offset, 96))
            publicKeyHash := calldataload(add(publicValues.offset, 128))
        }
        if (word0 != bytes32(uint256(0x20)) || word1 != bytes32(uint256(0x40))) revert InvalidPublicValues();
        domain = dkimDomain[keccak256(abi.encode(fromDomainHash, publicKeyHash))];
        if (bytes(domain).length == 0) revert UnknownDkimKey();
        bytes32 proofId = keccak256(proofBytes);
        if (proofUsed[proofId]) revert ProofAlreadyUsed();
        proofUsed[proofId] = true;
        attestations[msg.sender] = Attestation(fromDomainHash, publicKeyHash, proofId, uint64(block.timestamp));
        emit StudentEmailProven(msg.sender, domain, fromDomainHash, publicKeyHash, proofId);
    }

    function attestationOf(address wallet) external view returns (Attestation memory, string memory domain) {
        Attestation memory a = attestations[wallet];
        domain = dkimDomain[keccak256(abi.encode(a.fromDomainHash, a.publicKeyHash))];
        return (a, domain);
    }
}

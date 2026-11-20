// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "./UniPassTicketV2.sol";

/// @notice Event manager for student-verified Fuji registrations.
/// @dev EIP-712 signatures carry server-verified eligibility; the contract enforces event-scoped nullifiers.
contract UniPassEventManagerV2 is Ownable2Step, EIP712, ReentrancyGuard {
    bytes32 public constant REGISTRATION_PURPOSE = keccak256("UNIPASS_STUDENT_EVENT_REGISTRATION_V2");
    bytes32 private constant AUTHORIZATION_TYPEHASH = keccak256(
        "RegistrationAuthorization(address wallet,uint256 eventId,uint256 chainId,address verifyingContract,uint64 expiresAt,bytes32 nonce,bytes32 purpose,bytes32 studentNullifier)"
    );
    uint64 public constant MAX_AUTHORIZATION_TTL = 10 minutes;

    struct EventInfo {
        uint256 id;
        address organizer;
        uint256 capacity;
        uint256 minted;
        uint256 registrationDeadline;
        bool active;
    }

    struct RegistrationAuthorization {
        address wallet;
        uint256 eventId;
        uint256 chainId;
        address verifyingContract;
        uint64 expiresAt;
        bytes32 nonce;
        bytes32 purpose;
        bytes32 studentNullifier;
    }

    uint256 public nextEventId = 1;
    UniPassTicketV2 public ticketContract;
    address public registrationIssuer;
    mapping(uint256 => EventInfo) private events;
    mapping(uint256 => mapping(address => bool)) public registered;
    mapping(uint256 => mapping(bytes32 => bool)) public studentNullifierUsed;
    mapping(bytes32 => bool) public usedAuthorization;
    mapping(uint256 => mapping(address => bool)) public eventStaff;

    event EventCreated(uint256 indexed eventId, address indexed organizer, uint256 capacity, uint64 registrationDeadline);
    event EventCancelled(uint256 indexed eventId);
    event RegistrationIssuerUpdated(address indexed oldIssuer, address indexed newIssuer);
    event RegistrationAuthorizationRevoked(bytes32 indexed nonce);
    event StudentRegistered(uint256 indexed eventId, address indexed student, uint256 indexed tokenId, bytes32 nonce, bytes32 studentNullifier);
    event EventStaffUpdated(uint256 indexed eventId, address indexed staff, bool authorized);

    modifier existingEvent(uint256 eventId) {
        require(eventId > 0 && eventId < nextEventId, "Event does not exist");
        _;
    }

    constructor(address initialOwner, address initialIssuer)
        Ownable(initialOwner)
        EIP712("UniPass Event Manager", "2")
    {
        require(initialOwner != address(0), "Invalid owner");
        require(initialIssuer != address(0), "Invalid issuer");
        registrationIssuer = initialIssuer;
    }

    function setRegistrationIssuer(address newIssuer) external onlyOwner {
        address oldIssuer = registrationIssuer;
        registrationIssuer = newIssuer; // zero address intentionally pauses all new registrations
        emit RegistrationIssuerUpdated(oldIssuer, newIssuer);
    }

    function revokeAuthorization(bytes32 nonce) external onlyOwner {
        require(nonce != bytes32(0), "Invalid nonce");
        usedAuthorization[nonce] = true;
        emit RegistrationAuthorizationRevoked(nonce);
    }

    function setTicketContract(address ticketAddress) external onlyOwner {
        require(address(ticketContract) == address(0), "Ticket already configured");
        require(ticketAddress.code.length > 0, "Ticket has no code");
        UniPassTicketV2 candidate = UniPassTicketV2(ticketAddress);
        require(candidate.registrationContract() == address(this), "Ticket manager mismatch");
        ticketContract = candidate;
    }

    function setTicketBaseURI(string calldata baseURI) external onlyOwner {
        require(address(ticketContract) != address(0), "Ticket not configured");
        ticketContract.setBaseURI(baseURI);
    }

    function createEvent(uint256 capacity, uint64 registrationDeadline) external returns (uint256 eventId) {
        require(capacity > 0, "Invalid capacity");
        require(registrationDeadline > block.timestamp, "Invalid deadline");
        eventId = nextEventId++;
        events[eventId] = EventInfo(eventId, msg.sender, capacity, 0, registrationDeadline, true);
        emit EventCreated(eventId, msg.sender, capacity, registrationDeadline);
    }

    function getEvent(uint256 eventId) external view existingEvent(eventId) returns (EventInfo memory) {
        return events[eventId];
    }

    function cancelEvent(uint256 eventId) external existingEvent(eventId) {
        EventInfo storage eventInfo = events[eventId];
        require(msg.sender == eventInfo.organizer, "Not organizer");
        require(eventInfo.active, "Event already cancelled");
        eventInfo.active = false;
        emit EventCancelled(eventId);
    }

    function setEventStaff(uint256 eventId, address staff, bool authorized) external existingEvent(eventId) {
        require(msg.sender == events[eventId].organizer, "Not organizer");
        require(staff != address(0) && staff != events[eventId].organizer, "Invalid staff");
        eventStaff[eventId][staff] = authorized;
        emit EventStaffUpdated(eventId, staff, authorized);
    }

    function canRegister(uint256 eventId) external view returns (bool) {
        if (eventId == 0 || eventId >= nextEventId) return false;
        EventInfo storage eventInfo = events[eventId];
        return eventInfo.active && eventInfo.registrationDeadline > block.timestamp && eventInfo.minted < eventInfo.capacity;
    }

    function authorizationDigest(RegistrationAuthorization calldata authorization) external view returns (bytes32) {
        return _hashTypedDataV4(_authorizationStructHash(authorization));
    }

    function registerEvent(RegistrationAuthorization calldata authorization, bytes calldata signature)
        external
        nonReentrant
        existingEvent(authorization.eventId)
        returns (uint256 tokenId)
    {
        require(address(ticketContract) != address(0), "Ticket not configured");
        require(registrationIssuer != address(0), "Registration issuer paused");
        require(authorization.wallet == msg.sender, "Wrong wallet");
        require(authorization.chainId == block.chainid, "Wrong chain");
        require(authorization.verifyingContract == address(this), "Wrong contract");
        require(authorization.purpose == REGISTRATION_PURPOSE, "Wrong purpose");
        require(authorization.nonce != bytes32(0) && !usedAuthorization[authorization.nonce], "Nonce used or invalid");
        require(authorization.expiresAt > block.timestamp, "Authorization expired");
        require(authorization.expiresAt <= block.timestamp + MAX_AUTHORIZATION_TTL, "Authorization TTL too long");
        require(ECDSA.recover(_hashTypedDataV4(_authorizationStructHash(authorization)), signature) == registrationIssuer, "Invalid issuer signature");

        EventInfo storage eventInfo = events[authorization.eventId];
        require(eventInfo.active, "Event inactive");
        require(eventInfo.registrationDeadline > block.timestamp, "Registration closed");
        require(eventInfo.minted < eventInfo.capacity, "Event full");
        require(!registered[authorization.eventId][msg.sender], "Already registered");
        require(authorization.studentNullifier != bytes32(0), "Invalid student nullifier");
        require(!studentNullifierUsed[authorization.eventId][authorization.studentNullifier], "Student already registered");

        // Effects precede the external mint; a failed mint reverts the entire operation.
        usedAuthorization[authorization.nonce] = true;
        registered[authorization.eventId][msg.sender] = true;
        studentNullifierUsed[authorization.eventId][authorization.studentNullifier] = true;
        eventInfo.minted += 1;
        tokenId = ticketContract.mintTicket(msg.sender, authorization.eventId);
        emit StudentRegistered(authorization.eventId, msg.sender, tokenId, authorization.nonce, authorization.studentNullifier);
    }

    function checkInStudent(uint256 tokenId) external {
        require(address(ticketContract) != address(0), "Ticket not configured");
        uint256 eventId = ticketContract.eventOfTicket(tokenId);
        require(eventId > 0 && eventId < nextEventId, "Event does not exist");
        EventInfo storage eventInfo = events[eventId];
        require(msg.sender == eventInfo.organizer || eventStaff[eventId][msg.sender], "Not event staff");
        require(eventInfo.active, "Event inactive");
        ticketContract.checkIn(tokenId);
    }

    function _authorizationStructHash(RegistrationAuthorization calldata authorization) private pure returns (bytes32) {
        return keccak256(abi.encode(
            AUTHORIZATION_TYPEHASH,
            authorization.wallet,
            authorization.eventId,
            authorization.chainId,
            authorization.verifyingContract,
            authorization.expiresAt,
            authorization.nonce,
            authorization.purpose,
            authorization.studentNullifier
        ));
    }
}

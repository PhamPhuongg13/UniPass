// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/// @notice Non-transferable event ticket for UniPassEventManagerV2.
contract UniPassTicketV2 is ERC721 {
    using Strings for uint256;

    uint256 public nextTokenId = 1;
    address public immutable registrationContract;
    string private baseTokenURI;
    mapping(uint256 => uint256) public eventOfTicket;
    mapping(uint256 => bool) public checkedIn;

    event TicketMinted(uint256 indexed tokenId, uint256 indexed eventId, address indexed student);
    event TicketCheckedIn(uint256 indexed tokenId);
    event BaseURIUpdated(string baseURI);

    modifier onlyRegistrationContract() {
        require(msg.sender == registrationContract, "Unauthorized");
        _;
    }

    constructor(address manager) ERC721("UniPass Ticket", "UPT") {
        require(manager != address(0), "Invalid manager");
        registrationContract = manager;
    }

    function mintTicket(address student, uint256 eventId) external onlyRegistrationContract returns (uint256 tokenId) {
        require(student != address(0), "Invalid student");
        require(eventId != 0, "Invalid event");
        tokenId = nextTokenId++;
        eventOfTicket[tokenId] = eventId;
        _safeMint(student, tokenId);
        emit TicketMinted(tokenId, eventId, student);
    }

    function checkIn(uint256 tokenId) external onlyRegistrationContract {
        ownerOf(tokenId); // reverts for a nonexistent token
        require(!checkedIn[tokenId], "Already checked in");
        checkedIn[tokenId] = true;
        emit TicketCheckedIn(tokenId);
    }

    function setBaseURI(string calldata value) external onlyRegistrationContract {
        baseTokenURI = value;
        emit BaseURIUpdated(value);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        ownerOf(tokenId);
        return bytes(baseTokenURI).length == 0 ? "" : string.concat(baseTokenURI, tokenId.toString());
    }

    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        require(from == address(0), "Non-transferable ticket");
        return super._update(to, tokenId, auth);
    }
}

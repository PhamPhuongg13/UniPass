# Remix handoff

No Solidity change is part of the index repair. Confirm the exact Fuji Ticket deployment block in Remix transaction details or a trusted explorer; configure only private runtime `TICKET_DEPLOYMENT_BLOCK=<verified integer>`. Then run `npm run db:migrate`, `npm run db:generate`, and `npm run index:fuji:tickets`.

Before acceptance, verify chain 43113, EventManager and Ticket addresses, `EventManager.ticketContract() == Ticket`, `Ticket.registrationContract() == EventManager`, bytecode at both addresses, and the deployed ABI event `TicketMinted(uint256 indexed tokenId,uint256 indexed eventId,address indexed student)` plus `ownerOf`, `eventOfTicket`, `checkedIn`, registration and check-in methods. Do not send real writes during QA without explicit approval.

Student gating needs a reviewed proof/commitment verifier and replay protection in an owner-designed contract. Share its exact deployed ABI only after compilation/testing/deployment. No Solidity/verifier code is supplied here. QR/staff roles need their own authorization design.

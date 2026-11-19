# Blockchain contract matrix

Network: Avalanche Fuji, chain ID 43113. Addresses from `.env.example`: EventManager `0xE68758a23ce897ea9961808f7aCeAc6E60a863e9`; Ticket `0xB2c64E5aF70bAA9DFb66E77e02DDfe8757877631`. Confirm these against the selected Remix deployment before running.

| Contract | Method/event | Caller | Args | Read/write | Frontend call site | Test |
|---|---|---|---|---|---|---|
| EventManager | `getEvent`, `canRegister`, `registered`, `ticketContract`, `owner`, `nextEventId` | Public | event ID/wallet | Read | `src/lib/contracts/chain.ts` and UI | Implemented; live smoke blocked |
| EventManager | `createEvent` | Organizer | capacity, uint64 deadline | Write | EventDraftForm | Requires user wallet approval; not sent |
| EventManager | `registerEvent` | Student | event ID | Write | EventRegisterButton | No zkEmail gate; live test blocked |
| EventManager | `cancelEvent` | Owner | event ID | Write | ABI only | No UI path |
| EventManager | `checkInStudent` | Organizer | token ID | Write | CheckInMVP | No audit write |
| Ticket | `ownerOf`, `eventOfTicket`, `checkedIn`, `balanceOf`, `nextTokenId`, `registrationContract`, `tokenURI` | Public | ID/address | Read | ticket component | Implemented; Fuji smoke blocked |
| Ticket | `TicketMinted` | Worker | indexed tokenId/eventId/student | Log read | ticket indexer | batches <=90; deployment block required |
| Ticket | `TicketCheckedIn` | Public | token ID | Log/read | ABI | Not included in new historical index |

No ERC-721 owner enumeration is assumed. No Solidity source, verifier, deployment, or transaction was changed or sent.

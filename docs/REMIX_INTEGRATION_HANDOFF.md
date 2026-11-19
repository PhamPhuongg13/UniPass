# Remix integration handoff

Solidity authoring and deployment belong to the project owner in Remix. The original user-supplied V1 files remain outside this repository and were not modified. This repo now includes separate V2 candidate sources (`contracts/UniPassEventManagerV2.sol` and `contracts/UniPassTicketV2.sol`) for owner review; neither source is deployed or active.

## Candidate secured V2 — not deployed

The standalone V2 manager accepts only EIP-712 `RegistrationAuthorization` and has no unsecured `registerEvent(uint256)` selector. It binds wallet, event, chain ID, verifying contract, expiry, unique nonce and fixed purpose. It verifies a configurable issuer, supports issuer rotation/pause and nonce revocation, enforces short expiry, duplicate and capacity checks, then mints a non-transferable V2 ticket atomically. Event-scoped staff can be assigned/revoked only by that event's organizer and can check in once. The backend's issuer endpoint remains disabled until the exact pinned zkEmail proof has passed security verification; V2 signatures themselves do not establish student status.

### Owner deployment sequence (only after source review/authorization)

1. In Remix select compiler 0.8.38 (source pragma `^0.8.24`) with OpenZeppelin Contracts 5.x imports. Compile both V2 files and review warnings/bytecode.
2. Select MetaMask Injected Provider and Fuji C-Chain (43113). Use an explicitly funded test wallet only after owner authorizes the deployment.
3. Deploy `UniPassEventManagerV2(initialOwner, initialIssuer)`. Record address and constructor transaction. Choose a dedicated issuer address; it can be paused on chain with `setRegistrationIssuer(address(0))`.
4. Deploy `UniPassTicketV2(managerAddress)` and record address/hash.
5. As manager owner call `setTicketContract(ticketAddress)`. Confirm `ticketContract()` and TicketV2 `registrationContract()` both match.
6. Exercise `createEvent(capacity, deadline)` as organizer; record the `EventCreated` event ID. Link that numeric ID to the corresponding metadata `fujiV2EventId` only after verifying transaction receipt and organizer.
7. Before any student registration, restore and verify the exact zkEmail v2 artifact, review circuit policy, set issuer to the approved server signer and configure the server environment. Until that occurs, keep issuer endpoint feature flag false and registration UI disabled.

Do not point current production event metadata at V2 addresses before both contracts and flows are reviewed and tested. No V2 addresses or transaction hashes currently exist.

### Local verification

`npm run contracts:compile` and `npm run test:contracts` compile and execute the candidate manager/ticket against an in-memory EthereumJS VM. This test evidence is not a Fuji deployment or transaction receipt. The test matrix covers forged/misbound/expired/replayed authorization, issuer rotation, duplicate/capacity and staff authorization/revocation/check-in.

## Reviewed owner-supplied contracts (2026-11-19)

The owner shared `UniPassEventManager.sol` and `UniPassTicket.sol` from Downloads for review. They were read in place and were not copied into this repository.

Deploy on Avalanche Fuji in this order:

1. Compile with Solidity 0.8.24-compatible compiler and OpenZeppelin Contracts 5.x (the ticket overrides ERC721 `_update`). Ensure Remix resolves the `./UniPassTicket.sol` import and `@openzeppelin/contracts/token/ERC721/ERC721.sol` dependency.
2. Connect Remix to MetaMask through Injected Provider, select Fuji C-Chain (chain ID 43113), and use a wallet funded with Fuji test AVAX.
3. Deploy `UniPassEventManager` with no constructor arguments. Save its deployed address.
4. Deploy `UniPassTicket` with the EventManager address as `_registrationContract`. Save its deployed address.
5. From the EventManager deployer/owner wallet, call `setTicketContract(ticketAddress)` once. Confirm the transaction and that `ticketContract()` returns the Ticket address.

Important contract behavior: `createEvent` is permissionless; `registerEvent` currently checks event availability/capacity and one registration per wallet, then mints a non-transferable ticket. It does **not** verify zkEmail or student status. Do not present registration as student-verified or enable proof-gated flows on this contract. `checkInStudent` is organizer-only through the EventManager.

Owner has supplied these addresses and EventManager ABI:

- EventManager: `0xE68758a23ce897ea9961808f7aCeAc6E60a863e9`
- Ticket: `0xB2c64E5aF70bAA9DFb66E77e02DDfe8757877631`
- EventManager ABI: received in chat; contains the expected event registration, organizer check-in, event reads and setup functions.
- Ticket ABI: received in the attached text file; includes ERC-721 reads, ticket event mappings and check-in state.
- Owner supplied Remix receipt for `0xf25869402b7c13303fbaf7cda922f219c8a6b6de8588a669d9c5a70493f214e8`: mined successfully at block `61293854`, from `0x1A9dD48864E481d15E960A4C2c712CE946067A83`, calling `setTicketContract` on EventManager with the Ticket address above. Public RPC checks then confirmed Fuji chain ID `43113`, bytecode at both addresses, `ticketContract()` matches the Ticket address, `nextEventId()` is `1`, and `owner()` is the receipt's sender.

The app is configured to use these verified Fuji deployments. Compiler version, OpenZeppelin version, optimizer/EVM settings and deployment hashes are still useful provenance. Public addresses and ABIs are sufficient; never send a seed phrase or private key.

Set `NEXT_PUBLIC_EVENT_MANAGER_ADDRESS`, `NEXT_PUBLIC_TICKET_ADDRESS`, `NEXT_PUBLIC_CHAIN_ID=43113` and `NEXT_PUBLIC_AVALANCHE_RPC_URL` in local environment. Never commit secrets. Before enabling calls, verify bytecode exists at both addresses on Fuji and test read-only calls against the supplied ABI. Chain transactions must clearly expose pending, confirmed and reverted states. A backend index is a cache; the chain is authoritative.

For zkEmail, the owner must deploy a verifier and update EventManager to accept and validate a proof. The proof must bind the VNU domain assertion to the event and registering wallet and consume a circuit-constrained nullifier. A domain string or app-side check alone is not student verification. Keep verified-registration claims disabled until a real proof is generated, verified by the deployed contract and tested end-to-end.

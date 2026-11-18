# Remix integration handoff

Solidity authoring, compilation and deployment belong to the project owner in Remix. This repo contains no Solidity source and must not deploy or modify the owner's contracts.

When ready, provide the exact deployed EventManager and Ticket addresses plus their ABI JSON exports from Remix (contract → Compilation Details → ABI → copy). Confirm the network and exact function signatures/events, access control and check-in semantics. The shape mentioned in the project brief is provisional only.

Set `NEXT_PUBLIC_EVENT_MANAGER_ADDRESS`, `NEXT_PUBLIC_TICKET_ADDRESS`, `NEXT_PUBLIC_CHAIN_ID=43113` and `NEXT_PUBLIC_AVALANCHE_RPC_URL` in local environment. Never commit secrets. Before enabling calls, verify bytecode exists at both addresses on Fuji and test read-only calls against the supplied ABI. Chain transactions must clearly expose pending, confirmed and reverted states. A backend index is a cache; the chain is authoritative.

For zkEmail, also provide the approved verifier interface and public-signal schema. Registration must bind the proof to the event and registering wallet and enforce a circuit-constrained nullifier. A domain match alone is insufficient evidence of student status. Do not enable verified registration until a genuine proof is locally generated and verified, then tested against the deployed verifier. The present contract interface is intentionally unavailable while ABI is unknown.

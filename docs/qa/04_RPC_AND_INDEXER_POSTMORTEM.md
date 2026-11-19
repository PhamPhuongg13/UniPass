# Fuji RPC and ticket index postmortem

## Incident and cause

My Tickets used ethers `queryFilter` across roughly 200,000 historical blocks. Fuji rejected `eth_getLogs` because its maximum inclusive range is 100. Raw provider details were rendered to the student. Repeated attempts could also trigger 429/1015 limits.

## Repair

`GET /api/tickets` reads `TicketChainLog` and local mirrors, binds results to the signed-in wallet, and performs no log scan. If that index is unavailable or empty, the client asks `balanceOf` and `nextTokenId`, then checks recent token IDs with `ownerOf`, newest first, in groups of eight. This fallback is capped at 512 IDs and does not use `eth_getLogs`; a larger/older collection still requires the persistent index. Direct ownership/status calls run only after explicit user action. The client contains no `queryFilter`.

`scripts/index-fuji-tickets.mjs` requires trusted `TICKET_DEPLOYMENT_BLOCK`; checks chain and bytecode; uses 90-block inclusive batches (hard cap 100), a 9,000-block execution budget, 3 confirmations, bounded transient retries with jitter, and a checkpoint after every batch. It replays a 12-block tail for short reorgs. Unique key: chain + contract + tx hash + log index. Rerunning resumes the checkpoint.

## Operator steps / limits

1. Apply additive migration and generate Prisma client.
2. Verify chain, address and deployment block from Remix/trusted explorer; never guess.
3. Set deployment block only in private runtime environment.
4. Run `npm run index:fuji:tickets`; repeat until caught up and then schedule conservatively.
5. Review safe progress counts/checkpoint. No wallet/email or raw RPC payload is logged.

Live indexing was not run: no trusted deployment block was available and PostgreSQL did not respond. RPC quotas, actual event signature, reorg depth and worker operation need an owner-side smoke test.

# Bug register

| ID | Severity | Reproduction | Expected / actual | Cause | Fix / retest | Evidence |
|---|---|---|---|---|---|---|
| RPC-001 | P1 | Load My Tickets | Expected bounded logs; actual >100 inclusive blocks rejected and raw RPC visible | Client queryFilter over 200k history | Removed client log scan; incremental DB index, bounded direct owner scan fallback, max 90-block index requests, friendly states; unit regression passes | User screenshot retained only as source evidence (wallet identifier not copied) |
| OPS-001 | P1 operational | Fresh DB/index worker | Need migration and verified block; DB did not respond, deploy block unknown | Operational prerequisites unavailable | Added additive schema/migration, checkpointed worker; remains blocked until configured | command output summarized in final report |
| ZK-001 | P0 | Attempt student verification/register | Expected proven eligibility; wallet registration has no proof gate | No deployed verifier/proof flow | Documented; owner-side Solidity + audited proof required | security review |
| QR-001 | P2 | View ticket/check-in | Aspirational QR flow absent | No QR scanner/verification component | Documented accurately as unavailable | feature inventory |

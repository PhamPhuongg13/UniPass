# UniPass feature inventory (2026-11-19)

Based on repository routes, components, API handlers, Prisma schema and imported ABI. LIVE means implementation exists; it does not mean Fuji was independently exercised in this audit.

| Feature | Route | Role | UI | API | DB | Blockchain | Expected result | Status | Source |
|---|---|---|---|---|---|---|---|---|---|
| Browse events | `/`, `/discover`, `/events/[slug]` | Public | Cards, filters, detail | `GET /api/events` | EventMetadata | Read linked event | Public pages load | AVAILABLE; Fuji not smoke-tested | app routes, event API |
| Wallet sign-in | Header, `/profile` | Student/organizer | Challenge, session, signature | auth challenge/session/verify | AuthNonce/AuthSession | Wallet signature | Session binds signer | AVAILABLE; live wallet test blocked | auth lib/routes |
| Student eligibility | `/verify-student` | Student | Informational state | None | None | No verifier | Clearly say unverified | NOT IMPLEMENTED; no proof or mailbox control | `zkemail-local/README.md` |
| Create/publish event | `/organizer/events/new` | Organizer | Event form | `POST /api/events` | EventMetadata/Profile | `createEvent` | Metadata links after confirmed tx | PARTIAL; actual wallet write required | form/publish component |
| Register/mint ticket | `/events/[slug]` | Student | Explicitly disabled until on-chain eligibility gate exists | register mirror | RegistrationMirror/TicketMirror | Current `registerEvent` has no zkEmail gate | No student-gated registration | BLOCKED; direct contract call remains possible | register component/API |
| My Tickets | `/my-events` | Signed-in wallet | Explicit load, cached list | `GET /api/tickets` | TicketChainLog/checkpoint/mirrors | ownerOf/eventOfTicket/checkedIn/getEvent | Show cached and direct verified states | PARTIAL; migration + trusted deploy block required | WalletTickets/indexer |
| Ticket detail | `/tickets/[id]` | Signed-in wallet | Explicit ownership check plus expiring QR pass issuance | QR issuance API | Hash-only credential record | Direct ownership reads | Only current holder may issue a short-lived pass | PARTIAL; live Fuji QR flow not exercised | WalletTickets, TicketCheckInPass |
| Organizer dashboard | `/organizer` | Organizer | Own event list | events | Event metadata | Partial reads | Only own records | AVAILABLE/PARTIAL counters | catch-all route |
| Check-in | `/organizer/events/[id]/check-in` | Organizer | Camera QR scanner, manual fallback, explicit transaction/retry state | prepare + receipt-verified check-in | Atomic credential consumption and CheckInAudit | `checkInStudent` + confirmed receipt | Check correct event once | IMPLEMENTED IN CODE; live Fuji permission/write not tested; no staff role | CheckInMVP/API |
| QR issuance/scanning | `/tickets/[id]`, organizer check-in | Current ticket holder / organizer | Two-minute QR and camera/manual scanner | Issuance and preparation APIs | Random bearer token hash only | Live NFT ownership/event reads | Expiring one-time check-in credential | IMPLEMENTED IN CODE; bearer relay and real-device scan not tested | routes/components |
| ntfy notification | Operator | Operator | Fixed status command | `scripts/notify-ntfy.mjs` | None | None | Send without persisting topic | AVAILABLE; delivery noted in final report | script |

Pages include `/`, `/discover`, `/events/[slug]`, `/my-events`, `/tickets/[id]`, `/verify-student`, `/profile`, `/organizer`, `/organizer/events/new`, organizer event details and check-in. APIs include auth, event list/detail/create, register, check-in and ticket list.

Fuji chain ID 43113. Addresses are in `.env.example`. `TICKET_DEPLOYMENT_BLOCK` intentionally remains unset: do not infer it from a later transaction. No Solidity or chain write was changed by this audit.

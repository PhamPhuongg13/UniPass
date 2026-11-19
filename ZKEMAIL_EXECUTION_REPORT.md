# zkEmail execution report

Updated: 2026-11-19

## Final continuation status

No successful real proof has been produced. The implementation keeps the exact pinned Blueprint `PhamPhuongg13/UniPass_Student_Verification@v2`, compiled ID `73537fac-12da-4aa8-9338-2858780e0caf`, and SDK `@zk-email/sdk@2.0.11`. The Noir circuit artifact remains unavailable at its expected storage URL (HTTP 404). There is no cryptographically verified proof/public signal to authorize any student state.

The registration-authorization route and V2 EIP-712 contract are prepared but fail closed: `STUDENT_REGISTRATION_ISSUER_ENABLED=false` by default, no approved `StudentEligibility` rows are produced, and no V2 manager is deployed. The backend EIP-712 signature is not itself a proof of student status.

Independent application regression passed: 16/16 unit, 6/6 Playwright, typecheck, production build, Prisma validation and seven-migration status. V2 contract compile and adversarial local EVM suite passed. None of these results imply zkEmail proof success. Resume exact v2 validation/generation/verification only after the missing artifact is restored; do not change Blueprint version or decode placeholder outputs into success.

**Status: BLOCKED — no real proof verified.** The application retains the exact pinned Blueprint `PhamPhuongg13/UniPass_Student_Verification@v2` and SDK `@zk-email/sdk@2.0.11`. The artifact with compiled ID `73537fac-12da-4aa8-9338-2858780e0caf` is linked by Conductor, but the expected public Noir circuit JSON returns HTTP 404 from Google Cloud Storage. `validateEmail` has passed previously; that only checks email/Blueprint inputs. No real `generateProof`, cryptographic `verifyProof`, or public output comparison passed.

No mock proof is used to set student status. Student registration UI remains disabled. Continue at [`docs/zkemail/EXECUTION_REPORT.md`](docs/zkemail/EXECUTION_REPORT.md) when the exact artifact is restored.

Required next steps: restore that artifact without changing Blueprint versions; run the existing `scripts/zkemail/run-v2-proof.ts` on the local signed fixture; independently verify outputs `sender_domain=vnu.edu.vn` and exact expected challenge; verify circuit enforces the challenge over DKIM-authenticated body; add wallet/session/event/expiry/replay binding and a reviewed verifier path before asserting eligibility.

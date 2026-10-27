# RYT-001 / RYT-002 validation

Date: 2026-10-27. Scope: Google identity and session lifecycle; campaign hub,
creation, in-app invitations, multiple DMs and membership management.

## Ownership and decisions

Implementation owns `src/features/auth/`, `src/features/campaigns/`, auth/campaign pages,
app composition/styles, SQL membership migration, SQL/browser/unit tests, public database
typing and the related documentation. Initial working tree was clean. No unrelated gameplay
module, legacy sibling, hosted service, production migration, commit or deployment was changed.
See ADR 003. Registration is open with Google; no email allowlist. Invitations do not send email.

## Baseline

- `npm run check`: PASS, 18 tests across 3 files, before changes.
- `npm run test:e2e -- --output=test-results/baseline-identity`: 34 passed,
  2 intentional non-mobile drawer skips, before changes.
- Existing `.env` contained demo mode and no Supabase URL/key. Supabase CLI and Docker
  were not available on PATH. No hosted Supabase or Google configuration was available.

## Local verification

- `npm run check`: final PASS; 34 tests in 5 files, including 19 SQL tests.
  Covers compilation, lint, architecture/docs/agent contracts, unit tests and production build.
- Focused identity browser pass: 13/13 on 390px phone. Google PKCE URL construction,
  single callback consumption, expired/denied callbacks, create/accept/sign-out, DM invite/
  cancel/promote/handover/leave, scoped routes, Player denial, revoked membership, account
  switching, session expiry, self-demotion, offline rejection and failed refresh.
- ES/EN × dark/light: phone browser axe audits and screenshots at 150% text, reduced motion.
  Phone and tablet final captures at 100%/150% were also visually inspected.
- `npm run db:types`: FAILED because the Supabase CLI/local stack is unavailable.
  Existing typing was preserved by the generator. The new SQL contract is hand-maintained
  and typechecked. Subsequent MCP generation from the actual hosted schema resolves that
  typing gap; see the follow-up connection report below. The local CLI is still unavailable.

## Initial failures and corrections

Failures were retained; corrected runs use separate `test-results/` directories.

1. Initial typecheck rejected TypeScript constructor parameter properties (`erasableSyntaxOnly`)
   and an optional translated name. Replaced with explicit fields and an empty-name fallback.
2. Initial lint found mixed component/hook exports. Moved contexts/hooks into separate modules.
3. First identity browser command could not start its build because the test fixture import
   lacked the NodeNext `.ts` extension. Corrected the import.
4. First mobile identity browser run: 8 passed / 3 failed. A delayed SDK initial-session event
   erased an invalid-callback message: fixed the controller and added a regression assertion.
   The other failures were test locators: duplicate Create campaign buttons during modal exit
   and a navigation link incorrectly queried as a button. Corrected locators and awaited closure.
5. Second mobile run: 10 passed / 1 failed. The navigation assertion queried a desktop-only
   sidebar on mobile. The test now opens the actual mobile drawer and verifies campaign links.
6. Expanded mobile run: 13 passed / 0 failed, including offline, self-demotion and refresh errors.
7. One Prettier write received a transient Windows file-open error for `styles.css`; a focused
   retry succeeded. Early builds warned about a >500kB entry chunk; lazy-loading the live Auth
   provider restored a separate Supabase chunk and eliminated that warning.

## Unverified layers and acceptance boundary

PGlite uses actual PostgreSQL grants, SQL functions and RLS with an `auth.uid()` shim.
It does not issue JWTs, run hosted Auth/PostgREST, or exercise locks across independent
database connections. Browser tests intercept SDK HTTP responses; they are not live accounts.

At the time of the initial implementation, provisioning, migrations and hosted verification
were pending. The [2026-10-28 connection report](supabase-connection.md) records the subsequent
MCP setup, hosted SQL tests, generated schema types and real public API probes.
Still pending: completed sign-in and authenticated API tests with two real Google accounts,
simultaneous last-DM attempts on separate connections, actual deployment callbacks and real
iOS Safari. Tickets stay in review until their required integration evidence exists.

The user can follow [setup instructions](../../setup-google-supabase.md). Only the Supabase
URL and Publishable key belong in `.env.local`; Google Client Secret belongs in Supabase.
No secret, SMTP account or additional email-service key is required by this frontend.

## Final checks and independent review

- Full `npm run test:e2e -- --workers=4 --output=test-results/identity-final`: 73 passed,
  2 intentional skips (mobile drawer test on desktop/tablet), 0 failures. Demo and public
  Auth/REST contract builds both run under `/rytta-dnd-app/`; no real account is used.
- `npm run format:check`: PASS. `git diff --check`: PASS.
- Durable baseline and final mobile/tablet captures: `captures/`. All final ES/EN,
  dark/light and desktop/phone/tablet screenshots are also in `test-results/identity-final/`.
- Independent `ui-ux` verdict: **PASS** for source digest
  `6bc82848d71c005333324b9318761b2757c56815b7ce31295b970a25831af958`.
  [Reviewer report](reviewer/review.md): 24 independent browser states at 390px/820px,
  ES/EN, dark/light, 150% text and reduced motion; zero axe violations, no overflow,
  measured touch targets at least 44px, focused keyboard/dialog/member/error checks.
  Reviewer-owned screenshots are in `reviewer/`. Hosted integration remains unverified.

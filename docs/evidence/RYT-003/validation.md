# RYT-003 validation

Date: 2026-10-28. Scope: characters/resources plus explicitly requested RYT-001/002 account UX.
Initial working tree was clean. Owned paths: characters feature, campaign invitation views,
app navigation, shared catalogs/type overlay, append-only migration, tests and delivery docs.
No release, commit, push or production migration was performed.

## Acceptance evidence

- Homebrew units confirmed by the user: whole gold, food rations, water rations; manual
  nonnegative exhaustion. Spanish default and English supported. ADR 005 records the choice.
- `create_character` creates an unassigned character and initial resources atomically,
  without an auth account or member placeholder. DM-only grants/checks are SQL-tested.
- `invite_character_player` targets a campaign/character and verified recipient email.
  Acceptance activates Player membership and sets the owner in the same transaction.
  `tests/database/characters.test.ts` covers a recipient account created after invitation.
- Composite FKs and unique campaign/user ownership reject cross-campaign/duplicate links.
  Terminal invitation states and already-assigned targets reject replay. The real PostgreSQL
  concurrency probe holds transaction A open: B blocks, then rejects duplicate acceptance.
- Explicit DM unlink checks expected owner, preserves resources/membership and cancels
  pending character invites. Removal of membership retains assignment/resources; SQL tests
  prove subsequent Player reads are denied. The Player cannot create/select a character.
- Player resources are read-only. Client insert/update/delete grants on characters/resources
  are revoked, and actor tests cover anon, outsider, Player and a DM from another campaign.
- Resource RPC validates whole nonnegative values, safe gold/revision bounds and expected
  revision. A second concurrent SQL connection blocks then rejects a stale revision. Exact
  retry UUID/payload returns the original revision, without an extra audit event.
- Character/resource triggers preserve actor and before/after values. Audit rows have
  DM-only RLS and no client mutation privileges. No private DM notes are returned to Players.
- Home and post-OAuth callback land on account/campaign selection. Logout is on that home.
  Header has one hamburger; user account links home, preferences precede navigation.
  Returning home keeps membership; leaving membership is separately confirmed and protects
  the last DM. Browser tests cover session expiry, identity changes, cache/role separation,
  preference persistence, invalid callback recovery and offline action rejection.

## Observed checks

- Baseline before implementation: identity-mobile 13/13 passed; captures in `baseline/`.
- `npm run check`: 39/39 unit/SQL tests passed, typecheck/lint/contracts/build passed before
  independent review. Full-chain new database tests are separate from the legacy migration
  policy tests, which deliberately continue to cover the historical schema.
- `npm run test:e2e`: 93/93 passed before review, zero skipped. 390px mobile, 820px tablet,
  1440px desktop; ES/EN, dark/light, 150% text, reduced motion, axe, Escape and focus return.
  Final post-review counts are recorded below after the resource-boundary fix.
- `npm run format:check`: passed before review; repeated after documentation completion.
- PostgreSQL 18.4 localhost, two separate clients: duplicate invitation acceptance blocks
  then rejects; stale resource update blocks then rejects; one assignment/audited update.
- PostgreSQL-backed browser probe: DM creates a character and invitation through the UI
  before recipient account creation; new Player accepts and sees their own character;
  two separate DM browser contexts edit the same revision, stale save rejected; Player
  refresh shows committed gold. Captures: `integration/phone-dm.png`, `phone-player.png`,
  `tablet-stale.png`. No page errors in this probe. This is a SQL-backed HTTP test bridge,
  not real Supabase PostgREST or OAuth.

## Initial failures and corrections

Preserved relevant browser failure snapshots under `initial-failures/`.

1. Eager characters import loaded a Supabase SDK asset in demo mode (24/25 browser tests
   passed). Lazy-loaded the feature; demo again avoids backend SDK loading/requests.
2. Character modal unmounted before Mantine restored opener focus. Added explicit opener
   restoration on close; keyboard regression now passes.
3. Initial new test omitted the `.ts` fixture import extension, preventing build startup.
   Corrected the test import; no application behavior was implicated.
4. Exact `getByLabel('Oro')` did not match the required label's asterisk. Real accessible
   textbox name was correct. Changed browser probes to role/name selectors; SQL-backed
   integration then passed without a UI change.
5. One tablet drawer Escape race lost focus (92/93). Added explicit post-transition focus
   restoration for dismissal, while navigation keeps content focus. Subsequent 93/93 passed.
6. Independent reviewer found P2 numeric overlap at maximum valid values, 390px/150% text.
   Preserve its CHANGES_REQUIRED report. Fix gives long quantities a full row and wraps
   values safely; an explicit maximum-value browser regression is included.
7. Local CLI was absent from PATH; used isolated `npx supabase` 2.122.0 to create the migration.
   `npm run db:types` failed without a local stack; generated file was preserved.
   `supabase status` confirmed Docker/Podman unavailable. A manually reviewed pending-migration
   type overlay is labelled accordingly. No hosted operation was substituted.
8. During review, lint found an unused variable in the reviewer's probe artifact; recorded
   and returned to the reviewer to fix before the final gate.

## Reproduce optional integration

Install an isolated PostgreSQL runtime and the `pg` package outside tracked dependencies,
initialize a disposable localhost cluster at port 55439, and set `RYTTA_PG_MODULE` to that
package directory. `node scripts/verify-character-concurrency.mjs` creates a uniquely named
local test database and applies all migrations. It never connects to hosted services.
For `--browser`, serve the identity test build at port 4175 with `/rytta-dnd-app/` base.
The browser helper intercepts fixture HTTP requests and executes real SQL under separate
roles/identities. These fixtures cannot be selected by production app configuration.

## Untested and deployment boundaries

No hosted Supabase migration, real new Google account registration, JWT verification,
PostgREST-generated relationship response, Realtime, production deployment or real Safari
was tested in this delivery. Existing RYT-001/002 hosted limitations remain unchanged.
The source migration requires the deployment owner to inspect legacy copper divisibility,
duplicate assignments and pending untargeted invitations. It refuses lossy conversion.
Apply migration and regenerate types only in a separately authorized deployment workflow.
Realtime belongs to RYT-013; current resources use explicit refresh and 20-second polling.

## Independent review

Initial verdict and focused re-review are recorded by `ui-ux` in `reviewer/review.md`.
Closure requires its actual PASS and the matching source fingerprint in the current manifest.

## Final verification after the UI correction

- `npm run check`: PASS, 42 tests; typecheck, lint, architecture/docs/AI contracts and build.
- `npm run test:e2e`: PASS, 96/96, no skipped tests (39.2 seconds). Includes maximum safe
  gold and PostgreSQL integer quantities at 150% text in all three viewport projects.
- Source fingerprint: `a001c30f6d1fda3cf139f5a5fbf4de98dfe94dca24cafff9bbf1e4f6d40639dd`.
- `git diff --check`: PASS. One documentation-only formatting failure after updating backlog
  evidence was corrected with scoped Prettier; final formatting is checked at closure.


## Final external-data contract check

The existing generated database contract marks the reverse resource composite FK as
`isOneToOne: false`. PostgREST therefore returns an array relation. The final adapter
requires exactly one validated resource row and normalizes it for the UI. HTTP fixtures
and the SQL browser bridge now return that actual array shape. Three new boundary tests
cover valid normalization, missing/duplicate/malformed relations, unsafe gold and
homebrew exhaustion above six. The final 42-test check, all 96 browser tests and the
PostgreSQL/browser concurrency probe passed again after this correction.


## Closure

Independent ui-ux final verdict: **PASS**, 2026-10-28, digest
`a001c30f6d1fda3cf139f5a5fbf4de98dfe94dca24cafff9bbf1e4f6d40639dd`.
See `reviewer/review.md`; initial CHANGES_REQUIRED is retained in `review-initial.md`.
Final focused review ran 12 phone/tablet cases at 150% across languages/themes and
maximum/threshold/normal values: no overflow, clipping, axe findings or browser errors.
RYT-003 is Done as a locally verified source implementation. RYT-001/002 retain their
existing review statuses and hosted integration limitations. No publication or hosted
migration was performed. The isolated PostgreSQL server was stopped after verification.

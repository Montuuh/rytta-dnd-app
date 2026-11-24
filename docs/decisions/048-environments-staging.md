# ADR 048: three environments, a staging project and the hosted migration procedure

Date: 2026-11-18. Status: accepted. Records the environment decisions taken on 2026-11-17 and
2026-11-18. Supersedes the environment part of ADR 007 (one Supabase project holding production
and PRE as the only non-local target); the PRE copier and its runbook stay as ADR 007 describes
until PRE is removed. Builds on ADR 047 for hosting.

## Context

Until 2026-11-17 there was one hosted Supabase project. Production used `public` and local
development used the `pre` / `pre_private` schemas inside the same project (ADR 007), so every
migration reached production without being applied to another hosted database first, and the
migration history had never been replayed on an empty project. The frontend had moved from
GitHub Pages to Cloudflare (ADR 047). The owner's constraint for this step is no spending.

## Decision

### Hosting

- The static site is the Cloudflare Pages project `rytta-app`, served at https://rytta.app
  (ADR 055; https://rytta.pages.dev until 2026-11-24), built from `main` on every push. Preview
  branch deployments are off.
- Response headers are generated at build time (`dist/_headers`): a Content Security Policy with
  `frame-ancestors 'none'`, `nosniff`, a referrer policy and immutable caching for hashed
  assets. They were verified on the live host.
- GitHub Pages and the first Worker deployment are retired. The repository is private.
- Cost: the domain only. A custom domain was deferred on 2026-11-18 and bought on 2026-11-24
  (`rytta.app`, about 14 USD a year, ADR 055).

### Supabase

- Production stays on the free plan.
- A separate staging project was created on the free plan, in the same organisation and region
  (eu-west-1). Every migration was applied to it from zero: the first proof that the history
  replays on an empty project. It holds no data and no users. Cost: 0.
- Staging is the gate before production. The last three migrations were each applied there byte
  for byte, verified in the catalog and exercised with an actor-level check inside a rolled-back
  statement before production.

### SQL delivery to hosted databases

Staging caught a defect in the delivery path: it decodes backslash-u escapes in transit, so the
migration stored on staging differed from the committed file. Rules adopted:

1. Migrations and seeds are plain ASCII with no backslash escapes. Non-ASCII text is built
   inside the database (for example from code points), not written as an escape in the file.
2. The committed content with LF line endings is applied, not the CRLF working copy.
3. After every apply, the stored statement's md5 and length are compared with the file.

### PRE

The `pre` / `pre_private` schemas still live inside the production project, and every migration
mirrors itself into them. They stay until staging can replace them for local development, which
needs a synthetic seed, a sign-in configuration for staging and a frontend build that points at
staging.

## Costs

| Item                                  | Plan or option             | Cost                   |
| ------------------------------------- | -------------------------- | ---------------------- |
| Cloudflare Pages project              | free                       | 0                      |
| Custom domain `rytta.app`             | bought 2026-11-24, ADR 055 | about 14 USD a year    |
| Supabase production                   | free plan                  | 0                      |
| Supabase staging                      | free plan                  | 0                      |
| CI on the private repository          | 2,000 free minutes a month | 0 within the allowance |
| Point-in-time recovery, daily backups | paid plans only, not taken | not spent              |

## Constraint without a decision: CI minutes

The private repository has 2,000 free CI minutes a month. A full pipeline run costs about 65 to
75 minutes: four browser-test shards of 14 to 20 minutes each, plus checks. Browser tests already
run on pull requests only. Options considered: fewer shards, and running only the affected
browser tests on pull requests. No decision yet.

## Done

- Cloudflare Pages hosting with verified headers; old hosts retired; repository private.
- Staging project created, full history replayed, used as the gate for three migrations.
- Delivery rules for SQL adopted (above).
- The nightly retention job is scheduled and active in production.

## Open

Each item stays open until its dependency is met; none is in place today.

- **Staging sign-in.** Staging's own OAuth client and its redirect URLs. Depends on the owner
  creating the client and entering its secret; secrets are never typed by tooling.
- **Synthetic seed on staging.** The script is added in `supabase/seed/` on the branch that
  carries this decision; it is not applied to staging yet.
- **Staging frontend.** A second Pages project, or preview deployments with staging build
  variables. Depends on staging sign-in and the seed, so a preview never serves production.
- **Automated promotion.** Migrations promoted from CI to staging on merge, and to production
  behind a manual approval with environment-scoped secrets. Today they are applied by hand
  through the reviewed, logged procedure in [deployment](../deployment.md#environments).
- **PRE removal.** Drop `pre` / `pre_private` from production and stop mirroring migrations into
  them. Depends on the three staging items above.
- **Backups and restore.** The free plan has no automated daily backups and no point-in-time
  recovery; the provider recommends regular logical exports with the CLI `db dump` command kept
  off-site. No scheduled export exists yet, and a restore rehearsal into staging is still to be
  done.
- **Sign-in screen address.** The provider's sign-in screen shows the backend's address until the
  OAuth brand is verified against the Pages address. Ownership of the Pages address was verified
  in the search console on 2026-11-18; brand verification waits on the provider's review period.
  This is the consequence of deferring the custom domain.

## Consequences

- A migration that does not replay on an empty project, or that changes in transit, is caught
  before production.
- Staging and production share the organisation and plan limits but not data, Auth, Storage or
  configuration; staging has no users, so actor checks run inside rolled-back statements.
- Until PRE is removed, local development still writes to schemas inside the production
  project, with the isolation limits ADR 007 lists.
- Without backups on the free plan, a destructive mistake in production has no provider-side
  recovery; the before/after data checksum in the apply procedure is the current safeguard,
  and scheduled exports are the next one.
- Staying on the free plan keeps cost at 0 and leaves the paid steps (domain, backups,
  point-in-time recovery, more CI minutes) as explicit owner decisions.

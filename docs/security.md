# Security and data model

## Trust

The browser is untrusted: roles, prices, balances, identifiers and hidden fields.
Auth supplies identity; RLS constrains every database operation. Only public publishable
keys reach Vite. Private helpers are not exposed by PostgREST; security-definer functions
have empty search_path and use auth.uid(), never caller-supplied identity.

## Current policy contract

- Anonymous: no application reads/writes or campaign bootstrap.
- Outsider: no rows from another campaign.
- Player: campaign metadata, own membership, own characters/resources; no direct writes.
- DM: own campaign's membership and characters/resources; may edit name/description and
  manage characters/resources, but cannot change campaign owner.
- Membership mutation: unavailable to clients. Bootstrap creates campaign and first DM atomically.
- Invites/revocation, multiple DMs and ownership transfer are future operations with last-DM protection.

Characters contain no DM notes. Other players' private resources are hidden.
Shared HP/initiative later needs a deliberate public projection, not broad access here.

## Constraints and planned operations

Characters require membership in the same campaign. Resources use a composite
campaign/character FK. Money uses integer copper; quantities/balances cannot be negative.
Exhaustion upper bound awaits the campaign ruleset. Bigint values must stay within
JavaScript safe bounds or be transported as decimal strings before economy ships.

The revision column is reserved, not an active concurrency protocol. Current DM writes
are foundation APIs without a UI. RYT-003 must revoke direct resource updates and add
revision-checked RPCs and audit history before exposing an editor.

- adjust_resources: DM permission, expected revision, bounded delta, actor and audit event.
- purchase_item: ownership, merchant visibility, server price, money/stock checks, locks,
  inventory update and event in one transaction. Idempotency key returns the original outcome.
- sell_item: resale policy, quantity, equipped/quest restrictions and atomic credit.
- use_item: ownership, quantity/revision, authorized effect and durable event.
- undo_event: authorized, once-only compensating event linked to its original; reject
  conflicting changes rather than overwriting an old state snapshot.

Test simultaneous buys, double taps, retries, stale writes and insufficient funds.

## Content, media and sessions

Future uploads use private Storage buckets, campaign-scoped policies, signed URLs and
MIME/size validation. No buckets are created now. No external rules/art assets are imported.
Render text safely; rich text needs an explicit sanitizer before HTML support.
Clear private caches on logout. Do not log tokens or private campaign payloads.
Restrict Auth redirects to exact deployed URLs. Pages cannot hold backend secrets.

## Verification boundary

PGlite executes real PostgreSQL SQL/grants/RLS with an auth.uid shim. It does not validate
Supabase Auth/JWT issuance, PostgREST, Storage or Realtime. Before real use, run the
migration on local Supabase and a two-account API test, then repeat in staging.
Configure backup/export and restore ownership before storing the only campaign copy.
No remote migration has been applied during this scaffold.

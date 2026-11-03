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
- Membership mutation: direct table writes are unavailable to clients. RPCs serialize on the
  campaign row. Bootstrap creates the campaign and first DM atomically. Active DMs may invite,
  revoke, promote, demote and remove; members may leave. At least one active DM must remain.
- Revocation sets membership inactive without deleting characters/resources, and unlinks any
  characters owned by that member in the campaign. Membership and role helpers check active
  status. Creator attribution (`owner_id`) remains immutable but gives no privileges after
  stepping down or leaving.
- Invitations use the recipient's confirmed `auth.users.email`, not caller-controlled metadata.
  Acceptance is atomic. Membership-only invites activate Player membership; character-targeted
  invites also link the character. Neither path can replay expired, declined or cancelled
  invitations. Inviting an address does not send an email.
- Google registration is open. Creating an account never grants access to existing campaigns.

Characters contain no DM notes. Other players' private resources are hidden.
Shared HP/initiative uses a deliberate projection (RYT-007, ADR 024): `get_combat_state`
returns the own character in full, teammates per `shares_live`, enemy HP only as a descriptive
status unless the DM reveals it, and never hidden combatants, NPC AC, DM notes, secret effects or
private log entries. Roster changes during a fight (`add_combatants` with an initiative total,
`remove_combatant`, RYT-041) stay DM-only, campaign-locked and idempotent; SQL tests deny anon,
outsiders, Players and DMs of another campaign. Members read only the secret-free `encounters` row directly (the realtime
signal); combatants, effects, events and templates are DM-only tables. The table display uses
the Player projection without own data, even for the DM.

## Constraints and planned operations

Assigned characters require membership in the same campaign; unassigned characters have null user_id. Resources use a composite
campaign/character FK. Money uses whole gold; water and food use whole rations. Exhaustion is a manual
homebrew counter, without edition effects or a gameplay cap. SQL integers bound rations
and exhaustion to 0..2147483647; gold/revision stay within JavaScript safe integers.

RYT-044 (ADR 026): a Player owns at most four characters per campaign and exactly one is
active. A partial unique index and a deferred constraint trigger enforce both in PostgreSQL;
unassigned characters are always active. Players still have no table writes:
`create_own_character` (active Player members, idempotent request id) and
`set_active_character` (owner only, under the campaign lock, refused during an open trade or a
running encounter) are security definer RPCs for `authenticated` only. DMs keep creation,
assignment and unlinking below the limit and do not switch a Player's active character.
Other Players never read reserve characters; SQL tests cover anon, outsider, another Player,
the campaign DM, a cross-campaign DM, a removed member and the guarded PRE mirror.
Archiving (`archive_character` / `restore_character`, owner or campaign DM, idempotent, under
the campaign lock) frees a slot without deleting data; archived characters are never active,
do not count towards the limit and can be restored only while a slot is free.

RYT-003 revokes all client character/resource writes. `create_character`,
`unassign_character`, `invite_character_player` and `set_character_resources` lock the
campaign first, then check active DM membership. Resource edits compare expected revision,
validate constraints, increment revision and append immutable audit history atomically.
Request IDs deduplicate identical resource retries; a different payload/actor is rejected.
Triggers audit character creation/assignment/unlinking and every resource insert/update.
Only active campaign DMs can read audit history; Players cannot read former-owner history.

The RYT-003 migration converts existing copper balances to gold only when exactly divisible
by 100, otherwise aborts without rounding. Existing duplicate assignments also require
explicit resolution. Old pending untargeted invitations are revoked and must be reissued.
These are deployment prerequisites, not permission to modify hosted data.

- checkout (RYT-005, implemented): character authorization, shop and listing visibility,
  server price with the per-character modifier, gold and stock checks under the campaign lock,
  `source = shop` stack update and `purchase` events in one transaction. Approval shops store a
  pending order and re-validate gold and stock when the DM approves or the Player accepts a
  counter-offer. Request ids return the original outcome; a different payload is rejected.
- sell_to_shop (RYT-005, implemented): only loose `dm`/`shop` units, resale rounded down from
  the shop's list price or the DM value, atomic credit and `sale` events.
- revert_order (RYT-005, implemented, DMs only): purchases take back the shop units still held
  (unequipping and recomputing AC) and refund them; sales return items and recover gold or
  fail. Shop events are never undoable from the inventory. Shop tables have no client grants;
  hidden shops/listings and `value_gp` never reach Players.
- use_item (RYT-004, implemented): ownership, consumable/ammo category, quantity and
  revision checks, idempotent request id and a ledger event in one transaction.
- undo_inventory_event (RYT-004, implemented): once-only compensating event linked to its
  original; Players only their own events within 10 minutes, DMs any; rejected when the
  stack revision moved after the event instead of restoring a snapshot.
- Player-created item definitions carry no price and land in `source = player` stacks so
  future resale cannot mint gold. Portrait objects are private and authorized per
  character through `private.can_access_portrait`.

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
The scaffold itself applied no remote migrations. The user later authorized direct setup
through MCP; the initially empty Rytta project now has both migrations and has passed hosted
SQL role/RLS checks and anonymous REST denial probes. See the
[connection report](evidence/RYT-001-002/supabase-connection.md) for the remaining boundaries
and reviewed SECURITY DEFINER advisories.

## Shared-project PRE isolation

Local SDK traffic uses pre, production uses public. This is schema/routing isolation within
one Supabase project, not an independent Auth/security/compute boundary. The same logged-in
user can have legitimate access to both copies. All cloned functions, policies, triggers,
constraints and defaults must target pre/pre_private; Auth references remain shared.
Maintenance in pre_admin is owner-only (not an application RPC). Refresh never writes PROD
rows, requires explicit PRE replacement and preserves the prior complete schemas as a
backup with application-role schema usage revoked. Backup restore also retains current PRE.
The API exposes public and pre; pre_private/pre_admin/backups must remain unexposed.

## Glossary homebrew (RYT-008)

`glossary_entries` holds campaign homebrew text only. Reads are RLS-gated by
`private.can_use_glossary`: the active DM, or an active member while the DM has enabled the
glossary module for Players. There are no table write grants; `save_glossary_entry` and
`delete_glossary_entry` (security definer, fixed search path, `authenticated` only) validate
every field, check the revision and never move entries between campaigns. Clients render the
text as plain React text (no HTML). Bundled SRD content is public and carries no private data.
SQL tests cover anon, outsider, inactive member, Player with the module on and off, DM and a
cross-campaign DM, plus the guarded PRE mirror.

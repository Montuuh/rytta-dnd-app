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
the Player projection without own data, even for the DM. Players see only the table view
(RYT-042), fed by their own Player projection (the only extra is their own character). Their
combat writes there are all for a character whose `user_id` is theirs: `set_initiative` while
initiative is collected, or later only while its total is missing (`Initiative closed`
otherwise); and on that character's own turn (RYT-045) `advance_turn` forward with the expected
active combatant, and `record_death_save` at 0 hit points once per round (`Not your turn`,
`Already rolled`; a stable character rolls no more). The DM still records death saves at any time
and undoes a mistaken roll. SQL tests deny anon, outsiders, other Players' characters and
creatures, hidden combatants and DMs of another campaign. Death save outcomes (`death_state`:
stable, revived) reach every projection, also for teammates who do not share live vitals; the
success and failure counts keep the `shares_live` rule.

Combat images (RYT-043, ADR 027): the private `creature-images` bucket is readable, writable and
deletable by the campaign DM under the campaign prefix; an active member reads only the image of a
template that a visible combatant of a non-draft encounter was added from, so hidden combatants'
images never reach Players (their rows are absent from the projection and the object is refused).
`set_combatant_template_image` is DM-only, campaign-locked, idempotent and revision-checked, accepts
only a path of its own environment, campaign and template, and requires the object to exist.
`character-portraits` reads additionally allow an active member the current portrait of a character
fighting visibly in a non-draft encounter; uploads and deletes stay owner or DM. SQL tests deny anon,
outsiders, other Players' writes, Players before the fight starts and DMs of another campaign, and
run the guarded PRE mirror; storage routers dispatch `pre/` objects to `pre_private` helpers.

Bestiary (ADR 028, RYT-046–049): template stat blocks, SRD origin, hit dice, CR and type live on the
DM-only `combatant_templates` (shape-checked on the server; Players raise Forbidden on list and save).
Creature aliases (`public_name`) replace the name for Players and the table in rows, log and summary
and suppress the creature image in the projection; `srd_id`, `template_id` and trackers are DM only.
Rolled hit points are rolled on the server and never logged in a visible event. `set_combatant_tracker`
is DM-only, campaign-locked and idempotent; recharge rolls at turn start are DM-only events. SQL tests
deny anon, outsiders, Players and DMs of another campaign and run the guarded PRE mirror. The bundled
SRD catalogue is public CC-BY content and is only loaded on DM screens; what the DM prepares is not.
Limitation: a creature image path stays readable by members while its combatant is visible, but the
projection no longer exposes the path while an alias is set.

Bestiary art (ADR 030, RYT-053): the bundled SRD art is public static content with its credits. The
DM's image of an SRD creature lives in `campaign_creature_images` (DM-only reads under RLS, no direct
writes) and in the private `creature-images` bucket under `{env}/{campaign}/srd-{id}/`; the storage
router lets only that campaign's DM read, upload or delete there. `set_creature_srd_image` is DM-only,
campaign-locked, idempotent and checks the path's environment, campaign and creature and that the
object exists. SQL tests deny anon, outsiders, Players and DMs of another campaign and run the PRE
mirror. Players and the table never receive `srd_id`, so SRD art never reveals which creature an NPC
is.

Campaign bestiary (ADR 039, RYT-089): `campaign_srd_bestiary` and `campaign_srd_removed` are DM-only
reads under RLS with no direct writes; `set_srd_bestiary` (download, remove one, remove all) is
DM-only, campaign-locked, idempotent, validates the action and the creature id and keeps at most 1000
removed creatures. Removing deletes only that campaign's versions (`srd_override`) of the removed
creatures, never "based on" or homebrew templates, and refreshes running fights that use them.
`save_combatant_template` creates a version only for a creature in the campaign's bestiary, once
(partial unique index). The state helper runs with its caller's rights and is not executable by
`authenticated`. SQL tests deny anon, outsiders, former members, Players and DMs of another campaign
and scan the PRE copy for production references. Known limit: a deleted version's image stays in the
private bucket (the storage router needs the template to delete it), as for deleted templates.

Content library (ADR 040, RYT-092): `content_packs` and `content_entries` have RLS on and no grants;
every read and write goes through security definer RPCs. Writers are the rows of
`private.content_editors` (RLS on, no grants), granted with owner SQL outside the repository and
separately in PRE. Signed-in users read published public packs and their own published private
packs, one kind at a time in pages of 500 (`get_content_entries`); unknown and unreadable packs
both raise `Forbidden`, and readers never receive drafts, revisions, owners or editors. Editor RPCs
check revisions or versions, serialise each pack on its row lock and each request id on an advisory
lock, and store SHA-256 digests of large payloads as idempotency keys. A pack update must send
every field; `save_content_pack` refuses to change the slug or visibility of a published pack, and
`set_content_pack_visibility` is the only (immediate) way to change who reads it. Limits: pack
payload 16 KB with known keys, entry data 128 KB, index 4 KB, 500 entries per import call, 5000 per
pack and kind. A retried request id replays the caller's earlier result before the editor check (ids
and counts only), as in RYT-089. Known limits: a PRE refresh copies the editors, the packs (private
ones too) and the replies from production, so editors are granted again after `pre:sync`; published
packs cannot be deleted through the API, so a takedown is an owner SQL operation (delete the pack
row, which cascades to its entries).

Loot distribution (RYT-144, migration `20261205120000`): `distribute_loot` locks the campaign
and checks active DM membership before replay. It checks the current item revision and campaign
for each active recipient, then records a DM grant and inventory event for each distinct
item/recipient pair. All grants and the optional named batch commit together. At most 100 pairs,
1000 units per pair and 32 KB of allocations are accepted. The request digest and receipt use
the inventory request ledger and its 30-day pruning window. A saved batch belongs to the
campaign and is readable by its DMs, 20 per page through `list_loot_batches`. It keeps item IDs,
character IDs and quantities, so removed items or recipients must be replaced before reuse.
Each receipt entry identifies its inventory event. The per-campaign batch quota defaults to 100.
A campaign DM can free a slot through the idempotent `delete_loot_batch` RPC without changing stock.
The private batch table has RLS enabled and no client grants. Campaign deletion removes its batches.

Items economy (ADR 043 and ADR 044, RYT-104–107, migrations `20261120120000` and
`20261121120000`): money is gp with two decimals (`numeric(12,2)`), validated on the server.
RPCs refuse negative amounts, values over the column limit and more decimals than the private
switch `private.money_scale()` allows (0 while only part 1 is applied, 2 after part 2); nothing
is rounded silently. Derived prices use the same scale: the per-character modifier rounds half
up and resale rounds down. The second switch, `private.items_player_authoring()`, closes Player
creation and editing of definitions in part 2. Neither switch is executable by clients.

- `item_proposals` has RLS on, no policies and no grants by design; it is read through
  `list_item_proposals` (DM: the campaign; Player: own characters; every pending one first, then
  at most 50 closed) and written by `propose_item` (assigned Player or DM; never a price, origin,
  template flag or catalogue key; 20 pending and 100 per 24 hours per character),
  `cancel_item_proposal` (proposer, own pending only) and `resolve_item_proposal` (DM; accept and
  merge need an explicit quantity 1..1000). An accepted item is created by the DM and granted
  as a `dm` stack, so the Player owns neither its price nor its edits.
- A Player's own definition is frozen for them once it has a price, a `dm`/`shop` stack or a
  live listing. A Player may grant only basic catalogue items (`basic_key` set) to their own
  character, as `source = player` stacks that never sell or mint supplies.
- `use_item` adds rations or water only from `dm` or `shop` stacks; `undo_inventory_event`
  removes exactly what was added or raises `Undo conflict` once it was spent.
- DM only: `import_basic_items` (500 per call; the idempotency payload stores the SHA-256 of the
  items), `set_item_template`, `merge_item_definitions` (refused while open orders or live trades
  reference the duplicate), `add_listings` (200 per call, atomic) and `set_shop_image`.
  `search_campaign_items` gives Players live basic items, their own creations and what their
  characters carry, with `value_gp` only for basic items.
- Every write locks the campaign row, authorizes with `auth.uid()`, checks revisions where a row
  is edited and records actor, payload and result in `private.inventory_requests`; a different
  payload under the same request id is refused. Anon executes none of the functions; outsiders,
  inactive members and DMs of another campaign get `Forbidden` or nothing.
- Item pictures: members also read the picture of live basic items and of their own creations.
  Shop pictures live in the private `shop-images` bucket at `{env}/{campaign}/{shop}/{uuid}.{ext}`
  (1 MB, WebP/PNG/JPEG, immutable). The campaign DM uploads, deletes and reads (also unattached
  uploads); a member reads only the current image of a shop one of their non-archived characters
  sees. The global router dispatches `pre/` objects to `pre_private` helpers.
- `item_definitions.value_gp` is closed to clients on the table (RYT-156): `authenticated` has
  column-level select on every other column, in `public` and `pre`. The DM reads values through
  `get_item_values` (other members get an empty object) and `get_shop_admin`; Players see
  basic-item prices through `search_campaign_items` and listing prices in the storefront. A new
  `item_definitions` column needs its own column grant in both schemas; the SQL contract test fails
  otherwise. Trade members see the picture and description of every item on the table (RYT-109).
- SQL tests on PGlite deny anon, outsider, Player and cross-campaign DM and run the PRE mirror.
  Not tested: real Storage uploads and signed URLs for shop images, PostgREST numeric
  serialisation and real concurrency.

One roll per fight and per rest (RYT-137, migration `20261204120000`): with dice in the app the
server owns the rule. `log_roll` (same signature) links a server roll of initiative to the live
encounter in which the character is a visible combatant, and a server roll of hit dice to the
open rest; the client sends no context. A second roll of that kind for the character while the
first is in force is refused with `Already rolled`; an initiative roll must be `d20` with a
modifier from -20 to 30 and hit dice N dice of the sheet's die with N up to the dice left
(`Invalid roll`). In `dice_mode = 'app'`, `set_initiative` and `vote_rest` of a non-DM must match
the character's roll in force (`Roll required`); the DM is never restricted.

- `get_roll_context(target_campaign)` returns the live encounter, the open rest, who has used
  their roll (`spent`: the DM every character, a Player their own, no roll content) and the rolls
  in force the caller may read, under exactly the `campaign_rolls_read` rule.
- `reset_initiative_roll(target_campaign, target_character, reroll_expression, request_id)` and
  `reset_hit_dice_roll(target_campaign, target_character, request_id)` are DM only, campaign
  locked and idempotent (`Request mismatch` on another payload); the second removes the vote made
  with the roll. SQL tests deny anon, outsiders, Players and a DM of another campaign.
- RYT-142 (migration `20261210120000`): a Player's app initiative roll may not declare a flat
  modifier above what the sheet allows (`private.initiative_cap`: the Dexterity modifier plus the
  proficiency bonus with the Alert feat, never below +0); a higher one is refused with
  `Initiative bonus` and nothing is written. The DM and recorded rolls are not capped. A DM
  re-roll of a hidden combatant at a campaign that shows rolls to the table is stored as
  `roller_dm`; a narrower setting is kept. No such earlier row existed in production.
- Known and accepted: the cap is a consistency guard, not an anti-cheat: a Player edits their own
  sheet's abilities and features. The Constitution modifier of hit dice is still declared by the
  client (the dice are the server's); the DM can read the expression. The frontend only offers
  the resets where `get_roll_context` shows a roll in force.

## Constraints and planned operations

Assigned characters require membership in the same campaign; unassigned characters have null user_id. Resources use a composite
campaign/character FK. Money uses gp with two decimals (whole gold until migration
`20261121120000` switches the scale, ADR 043); water and food use whole rations. Exhaustion is a manual
homebrew counter, without edition effects or a gameplay cap. SQL integers bound rations
and exhaustion to 0..2147483647; gold stays within 0..9999999999.99 and revisions within
JavaScript safe integers.

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

Free characters (RYT-096): only characters the DM created that never had a Player are offered.
`characters.ever_assigned` is set by a trigger the first time `user_id` is set (any path) and is
never cleared; a character whose Player left or was unassigned goes back to the DM, who can still
assign it by hand. The migration backfilled it from assignments and the `character_events`
history, with the audit trigger disabled for that statement only. `private.is_free_character` is
the single rule: unassigned, never assigned, no pending, unexpired character invitation (the DM chose someone;
revoking or declining it frees the character), not archived, present and not a combatant of any
encounter that has not ended, so a live fight is never handed to a Player and the DM's draft or
hidden preparation does not leak. `list_claimable_characters` (id, name, sheet status, class and
level truncated to client limits, portrait path) and `claim_character` are security definer RPCs
for active Players only; anon, outsiders, former members, DMs (they assign instead) and members of
another campaign are refused (`Forbidden`). A claim takes the campaign lock (shared with the combat
and invitation RPCs), then the character, and links it to the caller below the limit (active only
when the caller has none; a benched Player's claim stays in reserve, RYT-079). The existing
`characters:UPDATE` audit trigger records it with the Player as actor. Claiming an own character
again returns it unchanged; any other character that is not free raises `Character unavailable`,
so the later of two concurrent claims fails. Idempotency is state-based (no request id): a claimed
character keeps `ever_assigned`, so a retry that arrives after the DM unassigned it is refused.
Active Players also read the current portrait of free characters; no Player-facing RPC returns
`ever_assigned`. Party overview
(RYT-097): `get_party_overview` returns Players every active, assigned teammate; for one the DM does
not share live, HP, AC, exhaustion and conditions are null on the server (name, class, level and
sheet status remain). Unassigned characters stay DM-only there.

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
- Player-created item definitions carry no price set by the Player and land in
  `source = player` stacks so resale cannot mint gold; only the DM prices accepted proposals. Portrait objects are private and authorized per
  character through `private.can_access_portrait`.

Test simultaneous buys, double taps, retries, stale writes and insufficient funds.

## Account deletion

`prepare_account_deletion` and `delete_my_account` (RYT-115) run per environment for the caller
only. The client prepares (blockers, Storage paths, and pending invitations of the campaigns to be
deleted are revoked), removes those Storage objects until none are listed, then deletes; the
server refuses when the prepared campaign set no longer matches.

- Deleted: the profile, memberships, content editor grant, idempotency rows, invitations to the
  user's email, and every campaign where the user is the only active member and a DM. Deleting such
  a campaign also removes the rows former members authored there and its pending invitations.
- De-identified: in campaigns that survive, the user's characters return to the DM pool and
  ownership passes to the longest-standing other DM; authored or acted rows (history, orders,
  trades, combat log, proposals, glossary, content packs, rest requests) stay with the user
  reference set to null. A sole DM of a campaign with other members is blocked until they hand over.
- Auth: production then deletes the Auth user. Through the shared Auth foreign keys this also
  removes or nulls that user's rows in the current PRE copy, an accepted exception to environment
  isolation that can leave a PRE campaign without a DM; retained PRE backups are not touched. When
  the Auth row cannot be deleted the app data is still gone and the result reports `deleted: false`
  with `auth_user` `disabled` (banned, sessions removed) or `kept` (needs a server-side follow-up).
- Deletion requests keep an md5 digest of the user id and campaign ids for replay; they are pruned
  after 7 days.

Accepted residual in combat masking: an aliased character shows no name, portrait, class or
vitals, but Players can still infer it by elimination from its kind, side and death state.

## Content, media and sessions

Future uploads use private Storage buckets, campaign-scoped policies, signed URLs and
MIME/size validation. Game data from outside the app reaches it only through the content library.
Render text safely; rich text needs an explicit sanitizer before HTML support.
Clear private caches on logout. Do not log tokens or private campaign payloads.
Restrict Auth redirects to exact deployed URLs. A static host cannot hold backend secrets.

### Response headers (RYT-116)

The Cloudflare deployment sends security headers from the `_headers` file the build writes
(see [deployment](deployment.md#cloudflare-workers-static-assets) and ADR 047): a Content
Security Policy whose `script-src` allows only the site's own scripts, the SHA-256 of the inline
boot script and WebAssembly compilation for the 3D dice (never `'unsafe-inline'` or
`'unsafe-eval'` for scripts); `connect-src`, `img-src` and `media-src` limited to the site and
the configured Supabase origin; `frame-ancestors 'none'` against clickjacking; `nosniff`, a
strict referrer policy, a permissions policy that denies camera, microphone, geolocation and
payment, HSTS, and `Cross-Origin-Opener-Policy: same-origin-allow-popups`. The site has its own
origin, so session storage is no longer shared with other projects of the same account (GitHub
Pages serves every project of an account from one origin). The one inline allowance is
`style-src 'unsafe-inline'`, because Mantine injects theme styles at runtime. GitHub Pages cannot
send headers: while it still serves the app, none of this applies there. The e2e spec
`tests/e2e/security-headers.spec.ts` fails on any violation during the main journeys.

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

## Super admin (RYT-153)

- The role lives in `private.super_admins` and is granted per environment by the project owner
  with SQL; nothing in the repository or the browser grants it. A PRE refresh copies it with the
  rest of `private`, so PRE has the production super admins.
- A super admin reads the campaign directory, summaries (including DM emails), the usage report
  and the admin audit log, and looks up accounts by exact email or username. Auth is shared, so
  the PRE lookup reads the same accounts as production.
- `admin_enter_campaign` opens two hours of DM access to one campaign. While open, the access
  helpers treat the caller as that campaign's DM for play and preparation; the super admin is
  never written to `campaign_members` and the table never sees them. Expiry, `admin_exit_campaign`
  or withdrawing the role ends it; withdrawal closes open rows, so a new grant does not revive them.
- Admin access never manages membership: a trigger refuses inserts, updates and deletes of
  `campaign_members`, and new invitations, from a caller with admin access who is not an active DM
  member. A super admin who already belongs to a campaign cannot open admin access to it.
- Character history shows an admin's change as the DM's without a name; campaign events taken
  through admin access carry no actor. Dice rolls stay members' only. Table members are not
  notified of an admin's visit; the admin audit log is the record.
- Audited: enter (with expiry), exit (with seconds), favourites, account lookups (with the found
  id) and directory searches by a DM's email.

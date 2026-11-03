# ADR 026: Player character roster with one active character

Date: 2026-11-03. Status: accepted for `RYT-044`. Supersedes the "one character per Player per
campaign" rule of ADR 004, ADR 006 and ADR 010; their DM creation, assignment, invitation,
unlinking and preview contracts remain in force with the reconciliations below. If another
delivery takes number 026 first, renumber this file on merge.

## Context

Until now only the DM created characters and linked one character to each Player. The user asked
for Players to create their own characters, keep several per campaign (four for now) and choose
which one they play. Only the character in play may appear in campaign lists such as Party,
combat, trades and shop pickers. A Player without a character must be guided to create one when
entering the campaign.

## Decision

### Data model and invariants

- `characters.is_active boolean not null default true`. It marks the Player's character in play.
  Unassigned (DM) characters are always active (`characters_unassigned_active` check), so the
  DM's characters waiting for a Player keep their place in DM lists and combat.
- At most one active character per (campaign, Player): partial unique index
  `characters_one_active on (campaign_id, user_id) where is_active and user_id is not null`.
  It replaces the `unique (campaign_id, user_id)` constraint (named differently in an ETL-cloned
  PRE, so the migration drops it by definition).
- At least one active character whenever a Player owns any, and at most four per Player and
  campaign: the deferred constraint trigger `characters_roster` checks every affected
  (campaign, Player) at commit. RPCs can therefore switch in two statements, and any path that
  breaks the rule, including service-role SQL, fails.
- `private.character_requests` stores idempotency keys for Player creation.

### Operations

- `create_own_character(campaign, name, request_id)`: active Player members only. Validates the
  name, counts the roster under the campaign lock, inserts the character with resources (the
  existing trigger adds the draft sheet and play state) and makes it active only when the Player
  has no active character. A retried request returns the same id; a different payload is
  rejected.
- `set_active_character(campaign, character)`: only the owner, in one transaction under the
  campaign lock. Repeating it is a no-op. It is refused while the current active character has an
  open trade (`Trade busy`) or fights in an encounter in initiative or active status
  (`Character in combat`), so trades and combat never lose their participant mid-way.
  DMs do not switch a Player's active character in this delivery.
- The `characters_audit` trigger records every switch as `characters:UPDATE`; the DM history
  shows it as "Active character changed".

### DM capabilities, reconciled

- `create_character` still creates unassigned characters for the DM.
- `assign_character`, `invite_character_player` and `respond_campaign_invitation` link a
  character while the Player has fewer than four. The linked character becomes active only when
  the Player has none; otherwise it waits in reserve. A DM recipient is refused as before.
- `unassign_character` returns the character to the DM (active). When it was the Player's active
  character, the Player's oldest remaining character (creation order) becomes active.
- Removing or leaving membership unlinks every character of that member; all become unassigned
  and active, preserving resources (ADR 009 behavior).
- The assignment dialog offers Players below the limit instead of Players without a character.

### Where "active only" applies

- Server: `get_party_overview` (Party and teammates), `get_trade_state` (the Player's trading
  character and partners), `invite_trade` (both sides must be active) and `get_shop_admin`
  (access, price modifier and ledger pickers) list active characters only.
- Client: the characters public API `charactersQuery` returns characters in play (active Player
  characters plus unassigned ones). Party, the combat roster and Player view, the shop
  storefront character and the inventory roster read it, so combat (RYT-041) inherits the
  filter without changes in `features/combat`. `characterRosterQuery` returns whole rosters for
  the manager.
- Not filtered on the server: `add_combatants` (combat SQL is owned by RYT-041; the DM tool
  offers only characters in play) and reads by id such as sheets, inventory and order history,
  which stay available to the owner and DMs for reserve characters.
- RLS is unchanged: a Player reads all own characters (active or not) and their sheets; other
  Players never see reserve characters; DMs see every character of their campaign.

### Data migration

The column defaults to true. Before this migration a Player could own at most one character per
campaign, so every existing assigned character becomes its Player's active character and every
unassigned character stays in play. The migration verifies the invariant afterwards and aborts if
any Player ends with a number of active characters other than one. Nothing is deleted.

### Interface

- Party: a Player with no character sees "Who will you play?" with four empty slots and one
  call to action that opens a name dialog and continues into the existing creation wizard.
  Party shows the active character and active teammates only. A roster entry point (the
  roster's initials plus "My characters"; "Players' characters" for the DM with the reserve's
  initials) leads to `party/roster`.
- `party/roster` (Player): a native radio group of medallion cards; the selected card is the
  active character (accent border, check badge and the word "Active", never color alone).
  Arrow keys move the selection and switch at once; switches run one at a time in order. Free
  slots are drawn as dashed rings; the first one creates a character. The four-slot grid shows
  the limit; the count is announced to assistive technology. Each card links to its sheet.
- `party/roster` (DM): one read-only roster per Player with "Active" or "In reserve" in words.
  The DM Player preview shows the previewed Player's roster read-only.

## Consequences

- Without delete or archive, a Player who reaches four characters cannot create more. Retiring
  or deleting characters is a follow-up decision (it touches inventory, orders, trades and
  combat history).
- PRE received the change through the migration's guarded mirror block before production. The
  production migration is applied by the integrator after merge.
- Hosted Auth/PostgREST two-account flows remain covered by PGlite and fixtures only.

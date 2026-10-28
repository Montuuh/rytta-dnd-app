# ADR 005: Homebrew resources and account home

Date: 2026-10-28. Status: accepted and implemented in source; hosted migration applied 2026-10-28.

## Decisions

The user explicitly selected homebrew: gold only, food rations and water rations.
Store/display whole gold, whole food rations and whole water rations. Do not expose
copper conversions or impose litres/daily-food semantics. Exhaustion is a nonnegative
manual counter, without edition rules or automatic effects. Technical limits are
JavaScript-safe gold/revisions and PostgreSQL integer quantities. Spanish remains the
default player-facing language; English and both themes remain selectable.

DMs create unassigned characters, then invite a specific email for that character.
An existing active Player without a character can also accept. An active DM cannot
accept a Player invitation or be silently demoted. Membership removal retains the
assignment/resources; a DM must explicitly unlink the expected owner before reinviting.
An invitation replaces pending invitations for the same email or character. No emails
are sent. Multiple characters per Player, lifecycle/switchers and Realtime remain deferred.

Account home is the default signed-in landing page and owns campaigns, invitations and
logout. The hamburger menu contains the logged account link and appearance/language
preferences before campaign navigation. Guests can also change preferences. Returning
home leaves campaign membership intact; leaving membership is a separately confirmed
operation. Private campaign caches clear on route exit and identity changes.

Resource edits submit absolute values with expected revision and a request UUID. They
never perform a browser read-modify-write transaction. The database rejects stale edits;
the editor keeps entered values and explains how to reopen the refreshed record. Identical
retries return the prior revision. Every creation, assignment and resource change has
actor/before/after audit evidence. Audit history is DM-only.

## Migration and verification boundary

The third migration is append-only after the two existing deployed migrations. Whole-gold
conversion requires divisible legacy copper amounts; duplicate character assignments need
explicit resolution before migration. No automatic rounding, destructive import or live
migration is authorized. Existing untargeted pending invitations are cancelled by this
migration, and the DM must issue new invitations against characters.

Local PGlite verifies the full migration chain and actor matrix. An isolated PostgreSQL
18.4 instance verifies independent concurrent transactions and browser flows through a
small test-only SQL bridge. This is stronger than HTTP fixtures but is not hosted
Supabase Auth/PostgREST/JWT verification. Local Supabase needs Docker/Podman, unavailable
in this environment. The generated types file remains untouched; a reviewed pending-SQL
type overlay is used until regeneration against Supabase is possible.

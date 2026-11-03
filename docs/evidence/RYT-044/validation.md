# Delivery RYT-044: Player character manager with an active character

Date: 2026-11-03. Branch `worktree-agent-a3efb2b3c019f0796`, cut from `main` at `c9ed08f`.
Decision record: [ADR 026](../../decisions/026-player-character-roster.md).

## Outcome

- A Player without a character lands on Party and sees "¿Con quién vas a jugar?" with one call
  to action. A name dialog creates the character and continues into the existing creation wizard.
- `#/campaign/:id/party/roster` is the character manager. Players see a radio-card roster
  (medallion, name, class and level or "Ficha a medias", "Activo"/"En reserva" in words), pick
  the active character (click, tap or arrow keys) and fill free slots up to four. Each card links
  to its sheet; reserve characters stay editable by their owner.
- Party, teammates, combat roster, trades, shop pickers and the inventory roster show active
  characters only. The DM sees every Player's roster read-only from "Personajes de los
  jugadores"; the DM Player preview shows the previewed Player's roster read-only.
- DM tools keep working: DM-created characters, linking below the limit (a new link waits in
  reserve), unlinking (the oldest remaining character takes over) and removal.

## Scope and ownership

- Database: `supabase/migrations/20261105120000_character_roster.sql` (new; nothing applied to
  production `public`).
- Frontend: `src/features/characters` (roster domain, repository, API, `ui/roster.tsx`,
  `ui/roster.css`, Party, assignment dialog), audit wording in `src/features/campaigns`, the
  inventory roster filter, `src/app/router.tsx`, RPC types and ES/EN catalogs
  (`roster-*.ts`, updated `characters-*.ts`).
- Not changed: `src/features/combat` (it inherits the filter through `charactersQuery`), combat
  SQL (`add_combatants` stays DM-authorized for any campaign character).
- Non-goals: deleting characters (round 2 adds archiving instead) and DMs switching a Player's
  active character.

## Data migration

`characters.is_active` defaults to true. The previous unique `(campaign_id, user_id)` limited
each Player to one character, so every existing assigned character becomes active and
unassigned characters stay in play. The migration re-checks the invariant and aborts otherwise.
Hosted counts before the change: production 3 characters (2 assigned to 2 Players), PRE 2
characters (1 assigned). No rows are deleted.

## Verification

| Check | Result |
| --- | --- |
| `npx vitest run tests/database` (after the migration) | 14 files, 99 tests passed. Initial run: `pre.test.ts` expected 30 ETL tables, now 31 with `private.character_requests`; count updated |
| `npm run check` (typecheck, lint, architecture, docs, AI, unit + SQL, build) | passed: 31 files, 217 tests, build OK |
| `CI=1 npx playwright test roster characters` (identity desktop, tablet, mobile), first run | 63 failed: other agents' servers on ports 4173/4174 during the run, plus real failures below |
| same, after fixes | 78 passed, 12 skipped (language matrix limited to 390 px by design) |
| `CI=1 RYT_EVIDENCE=1 npm run test:e2e` | 330 passed, 48 skipped, 0 failed (first attempt waited on a busy port) |

Real failures found and fixed during e2e:

1. Creating the first character from Party did not navigate to the wizard: the onboarding
   unmounted when the roster refetched before the mutation callback ran. Creation now uses
   `useCreateOwnCharacter`, which does not await the refresh.
2. On phones the DM's roster link and "Crear personaje" overlapped (each PageHead action takes
   the whole second row). Both now share one wrapper.
3. The assignment dialog lost its initial focus because it read a new, uncached query; it now
   reads the cached in-play and roster queries.
4. Empty slots were as tall as cards on phones; they are now compact unless they share a row
   with a card. Teammates are hidden while a Player has no character.

SQL actor matrix (`tests/database/character-roster.test.ts`, PGlite with the PRE ETL run before
the migration):

- data migration in `public` and PRE: assigned stays active, unassigned stays in play;
- create up to four (first active, the rest in reserve), retried request id returns the same
  character, mismatched payload and empty names rejected, resources/sheet/vitals created;
- transactional switch and repeat; Party overview, shop admin and trade state list active
  characters only; trade invitations from a reserve character rejected; the owner edits a
  reserve sheet; switching refused during an open trade and during initiative/active combat;
- DM linking below the limit (reserve), unlinking the active one (oldest takes over), limit on
  link and invitation, a newcomer's first link active, removal unlinks all as active;
- invariants without RPCs: second active (`characters_one_active`), no active
  (`Active character required` at commit), fifth character (`Character limit`), inactive
  unassigned (`characters_unassigned_active`), valid two-step swap in one transaction;
- denials: anon (permission denied), outsider and cross-campaign DM (Forbidden or Character
  unavailable, no rows), other Player (cannot switch or read reserve rows and sheets), campaign
  DM (cannot create own or switch a Player's), direct table writes for Player and DM, removed
  member;
- PRE mirror: same rules in `pre`, PRE helpers authorize against PRE membership only, function
  bodies contain no `public.`/`private.` references.

Browser coverage (`tests/e2e/roster.spec.ts` and an updated `characters.spec.ts` case) at 1440,
820 and 390 px: first-character onboarding (axe, 44 px targets, focus in the dialog, inline
validation, Escape without creating, Enter submits, one idempotent call), creating up to the
limit, keyboard switch with arrow keys and the polite status, Party showing only the active
character and active shared teammates, opening a reserve character's sheet, a blocked switch
(open trade) keeping the active character with an explanation, English light theme, DM Player
preview read-only, DM rosters per Player, and a DM link of a second character that waits in
reserve.

## PRE

- `npm run pre:plan` needs `SUPABASE_ACCESS_TOKEN`, which is not set here; the token-free path
  `npm run pre:plan -- --print-sql` was executed through the trusted MCP connection: read-only
  plan, PRE exists, 30 tables.
- The migration's PRE mirror (same DDL through `pre_admin.remap`) was applied to PRE only.
  Production `public` was not touched (`public.characters` has no `is_active`; no new functions
  in `public`/`private`; hosted migration history unchanged, last `20261103155402`).
- Verified in PRE: `is_active`, `characters_unassigned_active`, `characters_one_active`,
  `characters_roster` trigger, `pre_private.character_requests`, no `public.`/`private.`
  references, `anon` without execute, `authenticated` with execute. Existing rows: assigned
  character active, unassigned active.
- Rolled-back actor probe in PRE (single transaction ended by an exception): Player created
  three characters (fourth total), fifth refused with `Character limit`, retried request
  returned the same id, switch succeeded and Party overview showed only the new active one,
  direct update denied; DM saw all four, could not switch or create own; outsider saw no rows
  and got Forbidden; as DM of a new PRE campaign got `Character unavailable`; anon got
  permission denied. Row counts afterwards unchanged (2 characters, 1 campaign, 0 requests).
  PostgREST schema cache reloaded.

## Round 2: review findings and archiving

The independent review ([ui-review.md](ui-review.md), CHANGES_REQUIRED on `d9da43a`) is
committed unedited. How each finding is addressed:

- **F1:** the onboarding dialog returns focus to "Crear mi personaje" after Escape, Cancel or ×.
  The e2e test asserts focus after both Escape and Cancel.
- **F2:**
  - Outcomes of switching, archiving and restoring now render above the grid and are scrolled
    into view (`scroll-margin` clears the header and the bottom bar).
  - Failures are alerts with a "Cerrar"/"Close" action. Progress and success are polite status
    text.
  - The e2e test taps the second-row card at 390 px and checks that the alert is inside the
    viewport and not covered at its top and bottom edges (`elementFromPoint`).
- **F3:**
  - The sheet action sits inside the card frame as a footer band: "Ficha", or "Terminar ficha"
    in the accent color for drafts. The duplicated "Ficha a medias" meta line was removed from
    draft cards.
  - The ⋯ card menu is a sibling of the radio label, pinned to the corner, so no interactive
    element is nested.
  - The new-slot tile stretches to the row height.
- **F4:** the onboarding rings are purely decorative (no glyph, no fill). The section has one
  button, which the e2e test asserts.
- **F5:**
  - The DM view is a compact list per Player, with the active character first and a four-ring
    slot meter whose count is read out.
  - It has no placeholder tiles; the e2e test asserts zero empty slots.
- **F6:** the DM entry point reads "Personajes de los jugadores" with a visible "N en reserva"
  and the accessible name "…, N en reserva". The faces were replaced by an icon.
- **F7:**
  - `characters.playerIntro` now reads "Tu personaje activo, sus recursos y tus compañeros de
    mesa." / "Your active character, its resources and your tablemates.".
  - The lede is hidden during onboarding (asserted).
- **F8:** dialog actions share one row from 36em. On phones they stack full width with the
  primary action first (create and archive dialogs).

Archiving is added in migration `20261105130000_character_archive.sql`; see ADR 026.

- **Player:** the card menu offers "Archivar personaje". It is disabled with the reason on the
  active character. A confirmation says it frees a slot.
- **Archived section:** a collapsed "Archivados" Accordion shows each character's sheet and
  "Restaurar". Restore is disabled with "Sin hueco libre" when the roster is full.
- **DM:** archives unassigned characters from the Party card menu and restores any character
  from the Archived section, which lists all archived characters with their owner or
  "Sin jugador".

Round 2 commands:

| Check | Result |
| --- | --- |
| `npx vitest run tests/database` | 105 passed (6 new archive tests, first run green) |
| `CI=1 npx playwright test roster characters` (3 identity projects), first run | 6 failed: test locators (two "Cancelar" buttons, a closing menu still in the DOM) |
| `CI=1 npx playwright test roster` after the locator fix | 3 failed: the archive success notice never appeared, because the dialog unmounted before the mutation callback ran. Fixed with `useArchiveAction`, which does not await the refresh |
| same, after the fix | 27 passed |
| `npm run check` | passed: 31 files, 223 tests, build OK |
| `CI=1 RYT_EVIDENCE=1 npm run test:e2e` | 336 passed, 48 skipped, 0 failed (earlier attempts waited on busy ports 4173/4174) |

Screenshot inspection also caught two layout problems at 390 px, both fixed before the final
runs:

- archived rows squeezed the name to one character per line;
- "Terminar ficha" wrapped next to the card menu.

PRE (only PRE; production untouched):

- **Applied:** the archive mirror (same DDL through `pre_admin.remap`) through the trusted MCP
  connection.
- **Schema checks:**
  - `pre.characters.archived_at` exists, and the PRE functions have no `public.`/`private.`
    references.
  - `anon` cannot execute the archive RPCs.
  - `public.characters` has no `archived_at`, and `public.archive_character` does not exist.
- **Rolled-back actor probe:**
  - Archiving the active character was refused with `Active character`.
  - Archiving a reserve character worked, and a second call returned the same result.
  - A freed slot allowed a fourth character; restoring at four was refused with
    `Character limit`.
  - Restoring after archiving another character worked, and Party overview showed only the
    active character.
  - The DM archived and restored an unassigned character and archived a Player's reserve
    character.
  - Outsider: `Forbidden`. Cross-campaign DM: `Character unavailable`. Anon: permission denied.
  - Counts afterwards were unchanged: 2 characters, 0 archived. The PostgREST schema cache was
    reloaded.

## Screenshots

Captured with `RYT_EVIDENCE=1` at 390 px (`-mobile`) and 820 px (`-tablet`), all inspected:

- `onboarding`, `create-dialog`, `party-entry`, `roster-en-light`
- `roster`, `roster-full`, `roster-switched`, `switch-blocked`
- `roster-archive-full`, `archive-dialog`, `roster-archived`
- `dm-rosters`, `dm-archived`

## Not verified

- Independent `ui-ux` re-review of round 2: pending (runs separately);
  `docs/evidence/ui-review-current.json` not touched.
- Production migrations (both RYT-044 files): pending, applied by the integrator after merge.
- The server does not block editing the sheet of an archived character; only the roster limits
  what it offers.
- Hosted Supabase Auth/PostgREST with two real Google accounts; Realtime (none used).
- iOS Safari; screen-reader output was checked through the accessibility tree and axe only.
- Concurrent switches from two devices are serialized by the campaign lock and covered by SQL
  invariants, not by a parallel load test.

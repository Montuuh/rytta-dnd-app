# Delivery RYT-043: combat screen art and readable enemy health

## Outcome

Every combatant now stands on a token: the character portrait or the bestiary image cropped to a
shape that names the side (round party, rounded-square ally, hexagonal enemy, square lair), or an
engraved monogram when there is no image. Tokens appear in the initiative order, the table banner
(large for "Now", small for "Up next"), the DM turn bar, the DM detail and the recap. The acting
token glows in the accent; defeated tokens go grey; hidden ones (DM only) have a broken rim.

Enemy health for Players and the table reads as five named bands (unhurt, wounded, bloodied,
near death, down/defeated) shown as a seal with its own glyph plus the band's word, never as a bar.
Exact hit points stay with the DM, the own character, sharing teammates and revealed creatures, on a
proportional bar with numbers. The DM adds or changes a creature image by tapping its bestiary token.

Also fixed from the RYT-042 review: R2-1 (the out-of-range hint is linked to the initiative field),
R2-2 (when the fight ends with the damage dialog open, focus moves to the recap heading) and R2-3
(switching views refetches the view coming into sight).

## Scope and ownership

- Migration `supabase/migrations/20261107120000_combat_media.sql`: `combatant_templates.image_path`,
  `encounter_combatants.template_id` (composite FK, `ON DELETE SET NULL (template_id)`),
  `set_combatant_template_image`, `list_combatant_templates` and `add_combatants` (template link),
  `get_combat_state` (`image_path`, `hp_band`; `hp_status` unchanged for older clients), helpers
  `private.can_view_creature_image` / `private.can_view_portrait`, global storage routers
  `private.creature_image_access` / `private.portrait_read_access`, the private bucket
  `creature-images` with read/insert/delete policies and a widened `portraits_read` policy.
- Frontend: `src/features/combat/**` (new `ui/token.tsx`, `ui/square-image.ts`), combat i18n,
  `src/shared/api/combat-functions.ts`.
- Docs: ADR 027, combat design, design system, security, architecture, README.
- Non-goals: Player actions (death saves, end turn) are unchanged pending the user's decision;
  no character portrait upload inside combat (the sheet already has it); no backfill of template
  links for existing combatants; no orphan-object cleanup.

## Acceptance

| Criterion | Evidence |
| --- | --- |
| Character and creature combatants show an image with a meaningful fallback | e2e: portrait and goblin art load in rows and banner; Bea/Cato show side-shaped monograms (`aria-hidden`); a 404 image falls back to the monogram; screenshots `player-bands-*`, `dm-*` |
| Enemy health for Players reads as named bands with a distinct non-bar visual; exact HP DM-only | e2e: four goblins show Herido / Malherido / A punto de caer / Derrotado with one distinct glyph each, no `.combat-hp-bar`, no "/8" or "PG"; the DM console shows "2/8 PG · A punto de caer" on a bar. SQL: Player and table projections carry `hp_band` and no `hp` |
| Images use private storage and signed URLs like item images; no public bucket | `creature-images` is `public = false`; signed URLs 300 s (creatures) / 3600 s (portraits); env-prefix check in the client; SQL storage-policy tests |
| Hidden combatants' images never reach Players | SQL: the hidden ogre's path is absent from Player/table projections and its object is unreadable until revealed; e2e: no `get_combat_state` response contains the ogre path and the Player never asks to sign it |
| Contrast in both themes, 390px, tablet, 150% text | axe clean in every RYT-043 e2e step (ES dark, EN light); no horizontal scroll at 150%; screenshots below |
| R2-1 / R2-2 / R2-3 | e2e: `aria-describedby` points at "Escribe un total entre −20 y 99."; the recap heading is focused after a remote end with the damage dialog open; switching back to the console issues a non-table `get_combat_state` within 1 s and shows "Terminado" |

## Verification

Commands (worktree `agent-a423959dcf42b15dc`, Node 24.13, Windows):

| Command | Result |
| --- | --- |
| `npm ci` | installed (the worktree had no `node_modules`) |
| `npx vitest run tests/database/combat-media.test.ts` | 5 passed on the first run |
| `npx vitest run tests/database` | 15 files, 114 tests passed |
| `npm run typecheck` / `npm run lint` | first lint run failed: `react(only-export-components)` for the image helper in `token.tsx`; moved to `ui/square-image.ts`, then clean |
| `npx playwright test combat.spec.ts --project=identity-tablet` (before updating tests) | 14 passed, 1 failed: the RYT-007 flow expected "Malherido" for a goblin at 1/7, which is now the fifth band "A punto de caer" (intended); assertions updated in two places |
| `npx playwright test combat.spec.ts` (identity desktop, tablet, mobile) | 59 passed, 1 skipped (long press is touch-only) |
| `npm run check` | passed: typecheck, lint, architecture, docs (45 tickets), AI contracts, 32 unit/SQL files with 234 tests, build |
| `CI=1 npm run test:e2e` | 418 passed, 49 skipped, 1 flaky: `character-sheet.spec.ts` "DM sees every sheet…" (identity-tablet) failed once with `net::ERR_NO_BUFFER_SPACE` on `page.goto` (Windows socket exhaustion under 10 workers) and passed on retry; unrelated to this change |

SQL role matrix (PGlite with real migrations, a PRE copied by the ETL before the migration, a storage
schema stub): DM attaches, replays, gets `Stale revision`, `Invalid request` (other environment or
other template prefix) and `Image unavailable` (missing object); Players, outsiders and a DM of another
campaign get `Forbidden` (and `Template unavailable` through their own campaign); anon gets
`permission denied`; direct table writes are denied to DM and Player. Storage: the DM reads every
object under the campaign; a Player reads nothing during a draft, the goblin image once the fight
starts, never the hidden ogre or an unattached upload (the ogre once revealed); Players, outsiders and
other DMs cannot upload; anon cannot read. Portraits: a teammate reads the current portrait only
while the character fights visibly in a non-draft encounter, never an older object, never when the
character is hidden; outsiders and other DMs read nothing. The PRE mirror recreates all six
functions with no `public.`/`private.` references and routes `pre/` objects to PRE helpers.

Screenshots (Playwright, captured and inspected; `RYT_EVIDENCE=1`, RYT-043 tests only):

- `player-bands-{mobile,tablet}.png` — Player table view, ES dark: own token in the banner, bands.
- `player-bands-150-{mobile,tablet}.png` — 150% text: the banner stacks token over the name.
- `player-bands-en-light-{mobile,tablet}.png` — EN light theme.
- `summary-en-light-{mobile,tablet}.png` — recap rows with tokens.
- `dm-table-{mobile,tablet}.png`, `dm-console-order-{mobile,tablet}.png`, `dm-console-{mobile,tablet}.png`
  — DM table view, console order with exact HP and the hidden ogre, and the detail with its token.
- `dm-console-creatures-{mobile,tablet}.png` and `dm-console-creatures-150-{mobile,tablet}.png` —
  the console's creature rows (bands, bars, hidden ogre, lair keep) at 100% and 150% text.
- `bestiary-empty-{mobile,tablet}.png` (monograms, keyboard focus ring on the picker) and
  `bestiary-{mobile,tablet}.png` (image added).

Inspection notes: the first captures showed the band word wrapping on phones and the banner name
breaking at 150% on 390px; phone sizes were reduced and the banner now wraps the name under the
token. The bestiary card pushed its actions to a second line on phones; the text column basis was
reduced.

## PRE rehearsal (hosted project `ekscdsmniukuxqjixapu`, PRE only)

1. Hosted migration history ends at `combat_player_initiative`; neither `public` nor `pre` had
   `template_id`, and the `creature-images` bucket did not exist.
2. `npm run pre:plan -- --print-sql` executed through the MCP connection: read-only plan, PRE exists,
   31 tables, no writes.
3. Applied only the migration's guarded PRE branch (`execute pre_admin.remap(ddl)`). The six PRE
   function bodies match the md5 of the same functions produced locally from the migration file;
   none references `public.`/`private.`; `anon` cannot execute `pre.set_combatant_template_image`,
   `authenticated` can. `public` functions are unchanged.
4. The global storage part (routers, bucket, policies, widened `portraits_read`) and a behaviour run
   were executed in one transaction rolled back by a final exception, with the real PRE DM and
   Player: attach revision 1, stale and other-environment paths refused, the Player read no image in
   the draft, the goblin image during the fight and never the hidden ogre or an unattached upload;
   the projection had the goblin path, the own portrait and `hp_band: critical` without `hp`, and no
   ogre; the Player's upload was refused by RLS and attach was `Forbidden`; an outsider read nothing
   and got `Forbidden`; anon read nothing and got `permission denied`. Afterwards PRE had 0
   encounters and 0 templates, the bucket and new policies did not exist and `portraits_read` still
   used `can_access_portrait`.

Production migration: not applied (the integrator applies it after merge; its PRE block is skipped
because PRE already has the change, and the global storage part runs then). Until then, image
uploads from a local PRE build fail at the storage step and show the monogram. Recovery for PRE:
re-run the PRE branch after a refresh, or `npm run pre:sync -- --replace-pre` after production has
the migration.

## Handoff and review

Untested layers:

- Real Supabase Storage (signed URL issuance, upload through the Storage API, MIME/size limits) and
  Auth/PostgREST with two signed-in accounts: covered by PGlite with a storage stub, the SDK fixture
  and the rolled-back hosted rehearsal (direct SQL inserts into `storage.objects`), not end to end.
- A teammate reading another Player's portrait on hosted data (PRE has one Player): PGlite only.
- Realtime delivery of the template-image bump: reasoned (it bumps `encounters.revision`), fixture
  uses polling.
- iOS Safari rendering of `clip-path` tokens; image decoding of HEIC files (the picker accepts
  PNG/JPEG/WebP only).
- The DM "Vista jugador" preview of tokens (presentation transform; images follow the DM's access).

Independent `ui-ux` review: round 1 returned CHANGES_REQUIRED
([report](ui-review.md), committed as received). Re-review pending.

## Round 1 fixes (ui-ux CHANGES_REQUIRED)

| Finding | Change | Evidence |
| --- | --- | --- |
| F1 Major: DM console at 390px wrapped "A / punto de caer" and shortened the bar | AC moved from its own column to the end of the name line (it wraps under the name when the name needs the room); console rail on phones uses a 36px token and tighter gaps; the HP value and the band phrase are `nowrap`, so a narrow row wraps before the dot, never inside the phrase | e2e (every project, 100% and 150% text): each band phrase occupies one line box and every bar is over 40% of its row. The same test run against the reviewed code fails (bar 31% of the row on 390px). `dm-console-creatures-{mobile,tablet}.png`, `dm-console-creatures-150-*.png`, `dm-console-order-*.png` |
| F2 Major: Skull meant both "enemy" and "defeated" | The side glyph is gone from rows and the DM detail (side stays in the token's shape and rim, the visually hidden row label and the detail's "Enemigo" text); `SideIcon` was removed. Skull now appears only for defeated/dead | e2e: no skull in living goblins' rows, exactly one in Goblin 4's |
| F3 Minor: "No compartido" louder than the name | The `unknown` band is always quiet: meta size, body face, muted colour, small seal | e2e: the band word's font size is smaller than the name's; `player-bands-tablet.png` |
| F4 Minor: "CA / 15" split | `combat.ac` and `combat.bestiary.stats` use non-breaking spaces inside each pair; the detail meta line is a wrapping row of nowrap pairs | e2e: detail pairs on one line each, "CA 10" and "CA 15" with NBSP; `bestiary-mobile.png`, `dm-console-mobile.png` |
| F5 Minor: picker name read twice | The file input carries `aria-label`; the label has no text of its own | e2e: `getByLabel` finds the input and no loose "Añadir una imagen de Goblin" text exists |
| F6 Note: lair showed a "G" | The lair token shows a castle glyph and has a crenellated keep shape, distinct from the ally's rounded square at 44px | e2e: lair token has the glyph and no monogram; `dm-console-creatures-mobile.png` |
| F7 Note: at 150% the "Now" token sat alone | Token, label and name share one grid; a container query in `em` moves only the name under the token and label when it needs the width, so the token stays beside its label | e2e: at 150% the token and the "Ahora" label overlap vertically; `player-bands-150-mobile.png` |

Commands after the fixes:

| Command | Result |
| --- | --- |
| `npm run typecheck` | first run failed: `rowGap` is not a Mantine `Group` prop; moved to CSS, then clean |
| combat e2e, identity desktop/tablet/mobile | first run: 3 failures in the new F1 assertion, which counted one rect per text run (two runs on one line); it now counts distinct line tops. Then 59 passed, 1 skipped |
| `npm run check` | passed (235 unit/SQL tests, build) |
| `CI=1 npm run test:e2e` | 419 passed, 49 skipped, 0 failed |

Visual note after the first fix pass: at 150% on 390px the console names were cut ("Gobl…") by the
AC on the same line; the name line now wraps and AC moves under the name instead.

# Research and source register

Reviewed 2026-10-27. Distinguish observed facts from proposed Rytta adaptations.

## Drive requirements

[Aplicación Rol](https://docs.google.com/document/d/1ZjoHNIz8smolk9mv7Yr53Pz82ZDepZnmfiVFrt9eFTo/edit)
was read through connected Google Drive; last modified 2026-10-26.

The brief asks for DM/player roles, DM-controlled resources, icon inventory with details
and use/undo, equipment slots, encumbrance, purchases/resale, merchant visibility per
player, keyword glossary, HP/initiative, routes/travel resources, memories, quests,
Mano Hundida finances and relationships, character sheets and DM crafting.
All ideas map to RYT-001–012. Reliability, legacy migration and release are separate
cross-cutting tickets. This is an intent summary, not a copy of the private document.

## D&D Sync

Source: [official public site](https://dndsync.com/) and its feature/screenshots section.
Observed: character sheets, shared initiative/HP, DM tools, combat summaries and optional
Owlbear/table hardware integration. Screenshots show inventory, spellbook and resources.

Adaptation: shared session visibility, quick information paths and separate DM controls.
Combat summaries can follow a stable event model. Signed-in workflows, accessibility and
backend behavior were not verified. An open-source IR-touch extension does not establish
the license of the entire product. No code, rules text or art was copied.

Character sheet follow-up (2026-10-30, RYT-024): the `sheet.html?id=39` page requires
sign-in, so only the public screenshots were reviewed (character sheet, class features,
spellbook, inventory, GM view). Observed patterns: large HP current/max/temp with
steppers, ability tiles with save proficiency, a two-column skill list, tappable use and
slot circles, and collapsible feature/spell rows. Rytta adapts the information
architecture with its own palette, sentence-case labels, text alternatives for status,
and no copied text or art.

Signed-in follow-up (2026-11-05, RYT-054): the user signed in to the browser pane and the GM
panel was reviewed (Overview, Encounters, Builder, Changelog, Quiz, Casino, Light Pad, Settings) and
the Tabletop page. Observed in Encounters: party levels typed per member, a 2014/2024 toggle (count
multiplier only for 2014), thresholds summed for the party, a zoned budget scale with a marker,
difficulty and stats (monsters, raw/total XP, XP per player), a roster with steppers kept in browser
storage, saved named encounters, CR/type/size/environment filters and a random fill within a budget
tier. Tabletop: a canvas VTT (scenes, maps, tokens with live HP, initiative bar, walls and doors,
lights, fog with a player-view preview, measuring, pings, spell areas, drawing, grid snap, dice,
audio, props, uploads, a cast/table window and an exploration group token). Rytta adapts the
builder idea to its draft encounters with the SRD 5.2.1 method (ADR 031); the Tabletop stays a
product non-goal unless a new ADR changes it. No code, text or art was copied.

Tabletop follow-up (2026-11-05, RYT-055–062): the user asked for a tabletop in Rytta and the D&D
Sync Tabletop was reviewed panel by panel in the browser pane with the user's account (scenes, map
generator with its 15 kinds and options, table setup and calibration, tokens, props and NPC
handouts, audio mixer with synthesized ambiences, spell areas, walls and doors, fog, the object
inspector and the map context menu). A test object placed while exploring was removed and the scene
shown before the visit was restored. The behaviour inventory and what Rytta keeps, adapts or skips
is in the [tabletop design analysis](tabletop-design.md); ADR 032 records the decision. Its static
assets show it is built on PixiJS, Howler and React with an Owlbear Rodeo extension manifest. No
code, text, art or sound was copied.

Map generator follow-up (2026-11-05, RYT-063): the user asked where D&D Sync's generated maps come
from. The loaded scripts (`vtt/dungeon.js`, "Dynamic Dungeons", and its `env-*` modules) are its own
code. Only their module headers were read, to name the techniques: a mulberry32 PRNG with string
seeds, deterministic maths so every device draws the same map, rooms placed from a size wish list,
a spanning tree of passages plus loops, A* passages with a turn penalty, caves as cellular-automata
lobes with noisy tunnels, contour tracing with smoothing and simplification for walls, furniture
by room kind, traps, notes and enterable buildings on separate seed streams, and a "parchment" look
modelled on Watabou's One Page Dungeon. These are public techniques: Nystrom's
[Rooms and Mazes](https://journal.stuffwithstuff.com/2014/12/21/rooms-and-mazes), RogueBasin's
[cellular automata caves](https://roguebasin.com/index.php/Cellular_Automata_Method_for_Generating_Random_Cave-Like_Levels),
[cyclic generation](https://www.boristhebrave.com/2021/04/10/dungeon-generation-in-unexplored/) and the
[Jaquays](https://thealexandrian.net/wordpress/13085/roleplaying-games/jaquaying-the-dungeon) loop
doctrine. Rytta's generator v2 implements them in its own code (ADR 032 addendum); the design rules
are in the [map doctrine](map-doctrine.md). No code, text or art was copied.

## Painted map references and assets (RYT-064)

Reviewed 2026-11-05: D&D Sync's painted generator output was rendered in its own page (its module's
public functions, no scene created) for dungeon, crypt, cave, tavern and forest. Observed: thick walls
of light dressed stone outside the floor, large flagstones and rings in round rooms, wooden doors
between stone jambs, wall torches with a glow, caves rimmed with loose stones, textured tree crowns,
painted furniture with colour (beds, patterned rugs, tables with mugs). Rytta adapts the look with its
own drawing code (ADR 032 addendum). No code, image or asset was copied. Downloaded sprite packs were
not used: painted packs are licensed for one's own maps rather than redistribution in an app, and the
free CC0 packs at hand are pixel or flat art.

Dungeon Alchemist exports a Universal VTT file (`.dd2vtt`: picture as base64 PNG, grid, walls,
portals, lights), as [Roll20's help](https://help.roll20.net/hc/en-us/articles/41643201127831-Universal-Virtual-Tabletop-UVTT-Support)
and the [Dungeondraft guide](https://dungeondraft-encyclopaedia.gitbook.io/guide/final-steps/exporting-your-map/universal-vtt)
describe. Rytta imports it directly (RYT-065).

## Czepeku

Reviewed 2026-11-05 at the user's request ("Czepeku as a map generator"). Sources: the
[site](https://www.czepeku.com/), [how to navigate the map pages](https://www.czepeku.com/blog/how-to-navigate-our-fantasy-map-pages),
[Architect](https://www.czepeku.com/architect) and its [guide](https://www.czepeku.com/blog/how-to-use-czepeku-architect),
[Crypts & Dungeons](https://www.czepeku.com/blog/crypts-dungeons) and the
[commercial use licence](https://www.czepeku.com/blog/commercial-use-licence); Architect's free version
was opened in the browser pane without an account.

Observed:

- **Not a procedural generator.** Czepeku is a studio of hand-painted battle maps, scenes and tokens
  (thousands of maps, each with variants for time of day, weather and season, some animated).
  Downloads come gridless or with a 5-foot grid, as images or Universal VTT files (Owlbear Rodeo,
  EncounterPlus, Roll20), and a Foundry module ("Czepeku Universe") opens the whole library.
- **Architect is a modular map maker.** About 970 hand-drawn room templates (Bastions & Guildhalls;
  Crypts & Dungeons funded on Kickstarter), each a shape on the square grid with its walls and door
  slots, a floor and its furniture placed as art pieces, tagged by kind and "ward". The DM drags
  rooms, rotates and flips them, clicks a wall to add a door or remove it, picks floors, wall styles,
  lighting and a background, and exports PNG, WebP, JPEG or UVTT (walls and doors). A shape filter
  offers rooms that fit a drawn outline. **Randomize** packs templates in the browser (no server
  call) from a size (small to huge), wards, preferred and excluded tags (stairs and corridors are
  excluded by default) and a floor choice. Windows, levels and editable props are planned.
- **Licence.** The art may not be rehosted, redistributed or sold, nor used for AI training;
  published material needs watermarked versions and explicit permission beyond that; paid games and
  streams may use it. Rytta cannot bundle Czepeku art. A DM may upload maps they obtained to their
  own private campaign, which is the use the maps are sold for.

Adaptation for Rytta (none implemented):

- **Upload:** read the grid size from Czepeku-style file names (for example `30x20`) and their
  standard export sizes, as D&D Sync's wizard does; import Universal VTT files (grid, image and
  doors as door items). Both are candidate tickets; UVTT import was a non-goal of ADR 032.
- **Map variants:** one scene with several pictures of the same map (day, night, season) that the DM
  switches without moving items.
- **Generator:** a "prefab" mode that packs Rytta's own hand-authored room templates (shape, door
  slots, furniture) with tag filters, next to the procedural rooms; Architect's size, theme and tag
  controls map onto the generator's options.

No code, text or art was copied.

## Procedural map modules for Foundry VTT

Reviewed 2026-11-05: a list the user pasted, checked against each package page.

| Module                                                                                                                                        | What the page shows                                                                                                                                                                                                                                                                                           | Corrections to the pasted list                                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| [Augur: Instant Dungeons](https://foundryvtt.com/packages/instant-dungeons) (Augur Studios, 1.5.2, Foundry 13–14)                             | Procedural dungeons (rooms, corridors) with native walls, doors at transitions, fog and vision support, terrain underlays, built-in and Dungeondraft asset packs, an editor to paint, erase, extend and reshape with walls rebuilt; controls for room count, density, branching, room size, symmetry and seed | Sold through Patreon; generates no light sources (lighting is a placeable room object); no caves; the algorithm is not described          |
| [DunGen](https://foundryvtt.com/packages/foundryvtt-dungen) (Nick S., 1.2.2, Foundry 10+)                                                     | Front end of [DunGen.app](https://dungen.app/): seed, ten looks, maximum size, tile size, multi-level, furnishing by habitat (goblinoid den, bandit hideout, monster infested, generic), a preview, then a scene                                                                                              | Module MIT, but generation goes through DunGen's API under its own licence; walls and lighting data and 140 px tiles are Patreon features |
| [Augur: Hexlands](https://foundryvtt.com/packages/hexlands) (Augur Studios, 1.5.2, Foundry 13–14)                                             | Overland hex maps: layered noise, 10 biomes, rivers, archetypes (mainland, islands, atolls…), 6 miles a hex, fog and token vision, a hex painter                                                                                                                                                              | Correct; requires Augur: Nexus; sold through Patreon; overland, not battle maps                                                           |
| [Filroden's World Map Builder](https://foundryvtt.com/packages/filrodens-world-map-builder) (4.1.0, Foundry 14; browser at fwmb.filroden.com) | Seeded worlds: temperature from latitude and height, moisture carried by wind with rain shadows, biomes from climate rules; exports a Foundry scene with a GM tile and journal pages, PNG and JSON                                                                                                            | The page does not mention Whittaker biomes; journal compendiums are storage, not an export; licence not stated                            |

None can run inside Rytta (they are Foundry modules, paid or API-bound), and none publishes its
algorithm beyond the summary above. Ideas worth adapting in Rytta's own code (none implemented):

- **Occupants** (DunGen's habitats): who lives in the dungeon decides room purposes, furniture and
  notes (bandits: bedrolls, crates, a lookout; goblinoids: bones, refuse, a chieftain's hall; a
  monster: webs, bones, a lair). It is the doctrine's "purpose before shape" as one option.
- **Branching and symmetry** (Instant Dungeons): explicit controls for loops versus dead ends and a
  mirrored layout, next to density.
- **Editable layouts:** keep the generator's squares with the scene so the DM can paint floor or
  rock and repaint the map, with walls following; today the picture is final.
- **Overland maps** (Hexlands, Filroden): layered noise for height, moisture and temperature,
  biomes from a temperature × moisture table and rivers flowing downhill belong to a future
  travel or atlas module, not to the battle-map tabletop.

## SRD 5.2

Source: [System Reference Document 5.2](https://www.dndbeyond.com/srd) by Wizards of the
Coast, licensed [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/legalcode).
RYT-024 encodes class hit dice, saves and skill choices, species speed and trait names,
background abilities/skills/feats, point-buy costs and spell slot progressions, with
attribution in code and on screen. Rules prose and spell descriptions are not bundled.

RYT-008 (2026-11-03) bundles SRD 5.2.1 rules prose and spells in English and in the official
Spanish edition (`SP_SRD_CC_v5.2.1.pdf`), plus SRD 5.1 English/Spanish conditions and combat
actions for the 2014 blocks. Provenance: PDFs downloaded from https://www.dndbeyond.com/srd on
2026-11-03 (5.2.1 English last modified 2025-05-01), extracted with `scripts/glossary`, reviewed
by content tests and spot checks. Attribution and adaptations are recorded in ADR 025.

## Owlbear Rodeo

Sources: [site](https://www.owlbear.rodeo/) and
[official getting started guide](https://docs.owlbear.rodeo/docs/getting-started/).
The homepage requires JavaScript; docs establish its map/token/scene/drawing/fog scope.
Keep it as a map/table reference. Coexist with a VTT; any future integration belongs
behind an adapter, not a new battle-map engine in the companion.

2026-11-05 (ADR 032): evaluated as the tabletop for Rytta. Owlbear is a hosted online VTT with
rooms, scenes, fog and an extension SDK that runs inside its own page. Using it would put the map,
tokens and fog outside Rytta's data and RLS, require an Owlbear room and account per table, and
leave calibration of a screen lying on the table, Spanish copy and the combat link to an iframe
extension. Rytta builds its own table-first map instead; an Owlbear bridge stays a possible later
adapter.

SRD 5.2.1 "Playing on a Grid" and "Creature Size and Space" (pages 13–14): each square is 5 feet;
entering an orthogonally or diagonally adjacent square costs one square; diagonals cannot cut the
corner of a wall; ranges count squares by the shortest route from a square adjacent to one thing to
the space of the other; Tiny creatures fit four per square, Small and Medium one, Large 2 × 2, Huge
3 × 3 and Gargantuan 4 × 4. The SRD has no rule for which squares an area of effect covers.

## Legacy Rytta

Read-only source: sibling ../rytta, including README.md, FASE2.md and targeted reads of
app.js, sync-core.js and online.js. Observed: large global browser state, direct DOM
rendering, IndexedDB/localStorage, whole-campaign serialization and custom merge logic.
Domain concepts include maps/submaps, terrain, initiative, merchants and resources.

Reuse terminology and lessons, not the monolith. Do not edit the legacy repo or copy real
campaign data. Import requires schema versioning, validation, ownership mapping, dry-run
reporting and backup/rollback. Existing JSON exports are not a trusted API.

## Technical sources

- [Vite](https://vite.dev/guide/) and [static hosting](https://vite.dev/guide/static-deploy).
- [Mantine with Vite](https://mantine.dev/guides/vite/) and [AppShell](https://mantine.dev/core/app-shell/).
- [shadcn with Vite](https://ui.shadcn.com/docs/installation/vite), evaluated alternative.
- [TanStack Query](https://tanstack.com/query/latest/docs/framework/react/overview).
- [HashRouter](https://reactrouter.com/api/declarative-routers/HashRouter).
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
  and [Auth redirects](https://supabase.com/docs/guides/auth/redirect-urls).
- [Codex customization](https://learn.chatgpt.com/docs/customization/overview),
  [skills](https://learn.chatgpt.com/docs/build-skills),
  [subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents)
  and [hooks](https://learn.chatgpt.com/docs/hooks).

Package versions were resolved from npm; package-lock.json is the exact installation record.

## Appearance and localization follow-up

Reviewed 2026-10-27 for RYT-016:
[Mantine color schemes](https://mantine.dev/theming/color-schemes/),
[react-i18next useTranslation](https://react.i18next.com/latest/usetranslation-hook) and
[i18next configuration](https://www.i18next.com/overview/configuration-options).
Use Mantine's persisted scheme manager and bundled typed catalogs with explicit Spanish
default, rather than detecting the browser language. Native Codex reviewer definitions
follow the subagent documentation linked above. Palette selection is Rytta's design choice.

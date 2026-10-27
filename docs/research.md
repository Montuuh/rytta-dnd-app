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

## Owlbear Rodeo

Sources: [site](https://www.owlbear.rodeo/) and
[official getting started guide](https://docs.owlbear.rodeo/docs/getting-started/).
The homepage requires JavaScript; docs establish its map/token/scene/drawing/fog scope.
Keep it as a map/table reference. Coexist with a VTT; any future integration belongs
behind an adapter, not a new battle-map engine in the companion.

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

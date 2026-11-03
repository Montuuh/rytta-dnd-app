# ADR 023: SRD 5.5e glossary, in-place term references and campaign homebrew

Date: 2026-11-03. Status: accepted for `RYT-008`. Supersedes the "no rules prose is bundled"
limit of ADR 013 and ADR 014 for the glossary only.

## Context

The user asked for a general D&D dictionary ("a D&D bible"): look up a term such as _Grappled_
and see what it is, which action, saving throw or check is involved, and open the same
definition from any place in Rytta where the term appears. Rules are 5.5e (2024); 2014 (5e)
rules may also be imported. DM and Players have the same permissions in this module. Decisions
confirmed by the user on 2026-11-03: import the full rules glossary and every SRD spell (no
monsters or magic items yet), show 5.5e first with a collapsible 2014 rule, store campaign
homebrew in Supabase editable by any member, and keep the DM module switch for the navigation
entry.

## Decision

### Sources and licensing

- System Reference Document 5.2.1, English (`SRD_CC_v5.2.1.pdf`) and the official Spanish
  edition (`SP_SRD_CC_v5.2.1.pdf`), and SRD 5.1 English and Spanish for the 2014 blocks, all by
  Wizards of the Coast LLC under CC-BY-4.0 (https://www.dndbeyond.com/srd).
- Imported: the 155 Rules Glossary entries (15 conditions, 12 actions, areas of effect,
  attitudes, hazards and rules terms), the 6 abilities, 18 skills and 13 damage types from the
  SRD tables, the 10 weapon properties and 8 masteries, and all 339 spells. 2014 rules are
  attached to the 15 conditions and the combat actions, plus Two-Weapon Fighting as a 2014-only
  entry. Total 550 entries per language.
- Spanish text is the official Spanish SRD, never a machine translation. Rytta adds its own
  adaptations, which CC-BY-4.0 permits and the attribution states: quick facts ("De un vistazo")
  and short condition summaries are Rytta summaries; tables split from multi-column layouts and
  normalized whitespace are mechanical edits.
- The official attribution statements (5.2.1 in the interface language; 5.1 in a short
  statement) appear on the glossary page; each entry shows its SRD page.
- Rytta's interface already used names such as "Agotamiento" and "Arcanos"; the official
  Spanish names ("Cansancio", "Conocimiento arcano") are the headwords and the earlier names
  are search aliases, so links and search keep working.

### Pipeline and format

- `scripts/glossary/` (Python, pdfplumber, run manually; PDFs are never committed) extracts
  styled lines from the two-column PDFs, rebuilds paragraphs, bold lead-ins, lists and tables,
  pairs English and Spanish entries (reviewed heading table for rules; level, school, classes,
  components, concentration, ritual and dice for spells, with 19 reviewed overrides) and writes
  `src/features/glossary/content/{index,en,es}.json`.
- Text uses a tiny inline markup (`*em*`, `**strong**`) parsed into React nodes. No HTML is
  stored or rendered; `content.test.ts` rejects markup, artefacts, schema drift, missing pairs
  and ambiguous auto-linked names.
- `index.json` (≈68 kB, ≈15 kB gzip, both languages' names, aliases and spell filters) loads with the
  campaign layer; the per-language body file (≈0.5 MB, ≈120 kB gzip) is a lazy chunk loaded
  when a definition or the glossary page is first opened. Bundled data is public and is never
  part of a private query key.

### Term references everywhere

- A `GlossaryLayer` route element wraps every campaign page (and the standalone `/glossary`
  route). It provides the catalog, a linker and a reference sheet: a bottom sheet on phones and a
  side sheet from 48em (Mantine Drawer: focus trap, Escape, focus returns to the term). Terms in
  a definition push onto a history with a back control.
- `GlossaryTerm` links typed app vocabulary by id (conditions, skills, abilities, damage types,
  weapon properties, AC, initiative, speed, proficiency, passive Perception, hit points, hit
  point dice, death saves, spell DC and attack). `GlossaryText` auto-links user text (feature,
  spell and item descriptions, notes, shop text) and bundled rules text.
- Linker rules: longest match, Unicode word boundaries, accent/case-insensitive, once per text
  block, never to itself; generic words (Action, Creature, Speed, Reach…) are excluded from
  auto-linking but stay linkable by id; spells link in prose only with their exact
  capitalization and a distinctive name; abbreviations (CON, CA, PG) only as written, so the
  Spanish word "con" never links. Homebrew names win over SRD names.
- Inline terms are `<button>` elements with a dotted underline that keep the line height and
  get a 44px invisible hit area (WCAG 2.5.8 inline exception, still meeting the 44px rule by
  hit area). Controls such as wizard checkboxes and the editable condition chips are not
  wrapped; active conditions are listed as terms beside the chips instead.

### Homebrew

- `public.glossary_entries` (migration `20261104120000_glossary_homebrew.sql`): category, name
  (unique per campaign, case-insensitive), aliases, summary, plain-text body, up to 8 custom
  facts, optional `srd_ref` (a house rule shown inside that SRD entry) and a revision.
- Actor matrix: anon none; outsider, inactive member and cross-campaign DM see nothing and every
  RPC raises Forbidden; an active Player reads and writes any entry while `glossary` is in
  `campaigns.player_modules`; the active DM always can. RLS (`private.can_use_glossary`) is
  authoritative; the UI only mirrors it.
- Writes only through `save_glossary_entry` (create with a client id, idempotent replay of the
  same create, revision-checked update) and `delete_glossary_entry` (revision-checked,
  idempotent when already gone). No economic data is involved, so no ledger or undo.
- The migration mirrors itself into an existing PRE with `pre_admin.remap`, like RYT-034.

### Visibility

- DMs always see the glossary in navigation; Players see it when the DM enables the module.
  With the module off, Players get a clear note on the page, no homebrew, and no "open in the
  glossary" link, but SRD definitions still open from terms elsewhere (public content).
- Outside a campaign (`#/glossary`, demo and signed-in) the SRD glossary works without homebrew.

## Consequences

- Rules are one tap away at the table, in the interface language, with the official texts.
- The bundle gains a lazy content chunk; the index adds ≈15 kB gzip to campaign pages.
- Monsters, magic items, equipment tables and translated homebrew are out of scope; adding them
  reuses the same pipeline and schema (new categories need a content test update).
- Hosted Supabase Auth/PostgREST were exercised through the e2e fixture and SQL tests, not a
  two-account browser session; see `docs/evidence/RYT-008/validation.md`.

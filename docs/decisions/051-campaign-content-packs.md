# ADR 051: campaigns choose content packs

Date: 2026-11-22. Status: accepted. Amends ADR 040 (content library) and generalises ADR 039
(campaign bestiary) to every kind of game data.

## Context

The content library (ADR 040, RYT-092/093) stores packs of game data with versions, visibility
and editors; super admins hold every editor right (RYT-153). The owner wants the super admin to
manage downloadable packs, such as the SRD and their own, for creatures, spells, classes and
subclasses, rules and items. Each DM then downloads the packs a campaign uses. The options were
weighed on a published options page and the owner chose every recommendation (2026-11-22).

## Decision

1. **Pinned versions.** A campaign uses a pack at the version it downloaded. When a new version is
   published the DM sees what changes (new, changed and withdrawn entries) and decides when to
   update. Withdrawn entries leave the campaign only when it updates.
2. **Whole packs per kind, with hidden entries.** The DM enables a pack for a kind (for example
   "SRD 5.2.1 · Creatures") in one step and can hide single entries; hidden entries leave every
   list and search of the campaign.
3. **One Content section** in the DM Command Center lists the available packs by kind. Every
   module (bestiary, combat, encounter builder, spells, character creation and level up, glossary,
   storeroom and shops) reads what the campaign enabled there.
4. **Campaign versions.** Editing an entry that comes from a pack stores the campaign's own version
   and leaves the pack unchanged, as the campaign bestiary does today. The DM can return to the
   pack's version, and an update says when it touches an entry the campaign changed.
5. **Custom packs are public or private.** A public pack is offered to every DM; a private one only
   to the campaigns its owner adds (for content from books they bought).
6. **The manager stays the content library**, reached from the Library tab of Administration:
   packs, kinds and entries with drafts and "Publish version".
7. **First kinds:** creatures, spells, classes with subclasses and features, rules and conditions,
   and items. Species and backgrounds come later.

The campaign's own homebrew (glossary entries, items and creatures the DM creates) stays the
campaign's and is not part of any pack.

## Delivery

- RYT-162: campaign content (pinned versions, update review, hidden entries, campaign versions)
  and the Content section; existing campaign bestiary downloads become the SRD creatures pack.
- RYT-163: private packs offered to chosen campaigns.
- RYT-094: creatures read from the campaign's packs (bestiary, combat, encounter builder).
- RYT-164: spells and class content read from packs (sheet, creation, level up, casting).
- RYT-165: rules and conditions read from packs (glossary and automatic term links).
- RYT-166: items as a pack kind (editor form, the basic items as a pack, storeroom and shops).
- RYT-167: the bundled catalogues leave the repository once every reader has moved.

## Creatures from packs (RYT-094, 2026-11-22)

Owner choices from the block F options page, all the recommended ones:

- P1 A: every creature pack works like the SRD (bestiary, fights, board, own image, campaign
  version). Stored references name the pack: `<ref>--<key>`, the SRD keeping its bare key.
- P2 A: the bestiary sends the DM to Content to choose packs. "Remove" becomes "Hide in this
  campaign" (undone from Content), and "remove all" is the pack's switch.
- P3 A: the source filter lists each enabled pack (a list once there are several), and list rows
  name their pack when more than one is enabled.
- P4 A: an unreachable library shows a retryable error and never falls back to the bundled SRD.
  Pack versions are cached for the session; offline copies are a later decision.

The CR baselines (a rules table) stay bundled until rules come from packs (RYT-165).

## Spells, class features and rules from packs (RYT-164, RYT-165, 2026-11-23)

Owner choices from the block I options page, all the recommended ones:

- P1 A: spells, class features and rules (the glossary-shaped kinds the SRD pack has) come from
  the campaign's packs now. The mechanics of the classes and subclasses stay in the app until
  RYT-168 models them as pack data.
- P2 A: a hidden entry is no longer offered (choices, glossary, term links). Characters that
  already have it keep it on their sheet.
- P3 A: the glossary outside a campaign reads the published SRD pack. The demo keeps the bundled
  sample.
- P4 A: without the library the sheet keeps working from the character's stored data, and rule
  texts offer a retry. Character creation and level up wait for the library.

## Items and private packs (RYT-166, RYT-163, 2026-11-23)

Owner choices from the block J options page, all the recommended ones:

- P1 A: the 197 SRD items join the SRD pack as its version 2, and the 3 Rytta items get their own
  public pack, "Rytta · Basic items". Both reach every campaign when first published. A version
  now advances, without review, the categories it does not change.
- P2 A: the storeroom import shows the items of every enabled pack with a source filter, and shop
  presets stock from the same items. Hidden items are not offered.
- P3 A: an imported item is the campaign's copy. Accepting a pack version does not touch the
  storeroom; "Update" in the import lists the items that differ from their pack and changes only
  the ticked ones (never prices, images or templates).
- P4 A: the library has a full item form: category, weight, price, where it is worn, weapon and
  armour values and the common properties. Rarer fields stay in the JSON tab.
- P5 A: a private pack's owner offers it to campaigns they run as DM; a super admin can offer it to
  any campaign.
- P6 A: removing a campaign from a private pack stops its reads at once. The pack stays listed in
  Content only so its DM can turn it off; what the campaign already copied stays.

Storeroom items keep their link to the pack in `basic_key`: the SRD and the Rytta basics keep the
keys of the old bundled catalogue (so existing items and shop presets stay linked), and other packs
use `<ref>--<key>`.

## Classes and subclasses from packs (RYT-168, 2026-11-23)

Owner choices from the block K options page, all the recommended ones:

- P1 A: a class's table is pack data: hit die, saving throws, skill choices, spellcasting kind and
  ability, the level its subclass is chosen, its ability score improvement levels, its prepared
  spells by level and whether it learns cantrips. Class resources with uses (Rage, Bardic
  Inspiration, Sorcery Points and the rest) stay in the app for the 12 SRD classes; a class from
  another pack shows its features and its uses are tracked by hand.
- P2 A: a pack class picks one of the four slot progressions (full, half, pact, none).
- P3 A: a subclass names its class: any SRD class or a class of its own pack. Level up offers
  every enabled subclass of the character's class.
- P4 A: the wizard's typed "other class" stays for single characters; pack classes are listed
  with their pack.

Classes and subclasses travel in the classes category with the class features, as index rows of
kinds `class` and `subclass`. An SRD pinned at a version without classes keeps offering the app's
SRD classes, which hold the same data, until its DM accepts the version that adds them.

## The SRD leaves the code (RYT-167, 2026-11-23)

Owner choices from the block L options page, all the recommended ones:

- P1 A: the bundled creatures, glossary (spells, class features and rules), basic items and class
  tables leave the code once the rest of the SRD (items, classes and subclasses) and the Rytta
  basic items are loaded into the library and published. Species, backgrounds and feats move to
  packs next (RYT-171).
- P2 A: creating a campaign has a Content step that lists the packs per category, with the SRD and
  the Rytta basics ticked; the campaign pins the versions chosen, and Content changes them later.
- P3 A: existing campaigns move to the SRD version with classes, which holds the data the code
  lent them until now.
- P4 A: the demo reads the published SRD instead of a bundled copy. In practice no anonymous
  surface shows SRD data: a visitor without an account sees the landing page, and the offline
  preview build (no backend) says the glossary needs the library. Anonymous reads were therefore
  not opened, which also avoids unbounded anonymous egress (security review of RYT-167).

## A subclass that gives spellcasting (RYT-175, 2026-11-24)

A subclass index can carry `caster` and `spellAbility`. A class without spellcasting takes them
when that subclass is chosen (creation, sheet, level up) and loses them when it is left; a class
with its own spellcasting ignores them, and a progression set by hand on the sheet stays. The
caster kinds gain `third`: no slots before level 3, then the full caster table at a third of the
level, rounded up. A caster without its ability is refused by the library and skipped by the
reader. The server needs no change: it stores the kind as text inside the build and only tells
pact magic apart.

## Species, backgrounds and feats from packs (RYT-171, 2026-11-23)

Owner choices from the block M options page, all the recommended ones:

- P1 A: species, backgrounds and feats are pack entries; the effects the app already applies
  (Dwarven Toughness, Alert, Breath Weapon and Luck uses, the Magic Initiate and Savage Attacker
  trackers) stay for the SRD ones. A pack species or feat shows its traits and texts, and its
  effects are noted by hand, as for pack classes.
- P2 A: they travel in the classes category, which the app now calls "Characters" ("Personajes"),
  as index rows of kinds `species`, `background` and `feat`. No category is added and no campaign
  changes what it pins; a single species is hidden like any entry.
- P3 A: the library has forms for them. A species holds its speed, size, traits and the traits
  whose option the player picks (with the options' names); a background its three abilities, one to
  four skills, its origin feat and that feat's spell list; a feat its category (origin, general,
  fighting style, epic boon), minimum level and whether it repeats. Trait and feat texts are the
  pack's features `species-<species>-<trait>` and `feat-<feat>`.
- P4 A: the quick sheet offers the species of every pack; its classes and backgrounds stay the SRD
  archetypes.
- P5 A: an improvement at level up offers the campaign's general feats (and epic boons from their
  level), linked to their text; another feat can still be typed.

A character keeps the skills and abilities its background gave (`backgroundSkills`,
`backgroundAbilities`), so the sheet needs no background table; builds saved before take them from
the campaign's packs when they are edited. The SRD species and background keys stay in the code to
translate their names and select the SRD effects. The published SRD gains them as version 3, and
existing campaigns move to it as with RYT-167.

## The base pack becomes Rytta (RYT-174, 2026-11-24)

Owner choices from the block Q options page, all the recommended ones:

- P1 A: the base pack is named "Rytta", with the line "Based on the SRD 5.2.1". Its slug
  (`srd-5-2-1`) and bare keys stay, so stored references keep working; the app shows the pack's
  title where it printed a fixed "SRD".
- P2 A: three origins, worked out by the server: from the SRD, from the SRD and changed by Rytta,
  and Rytta's own. An entry is compared with the SRD as it was published when this was decided
  (the pack's baseline version); its picture does not count as a change.
- P3 A: everyone reads the origin in the source line that already exists (glossary, stat block).
  No new filter for the DM.
- P4 A: the entries the app's code relies on cannot be withdrawn: the 14 conditions the sheet
  tracks, the 12 SRD classes, the 9 SRD species, the 4 SRD backgrounds and the creature baselines
  table. Their texts stay editable.
- P5 A: only the base pack has an origin per entry. Any other pack is its author's as a whole.

The baseline is a version number on the pack, read from the published versions the library
already keeps, so marking the origin changes no entry and asks no campaign for a review.

## The SRD magic items (RYT-176, 2026-11-24)

The base pack gains the "Magic Items A–Z" section of the SRD 5.2.1, in English and in the
official Spanish edition. Owner choices, all the recommended ones:

- The whole text enters. An item description holds 10000 characters (it held 700 in a pack and
  2000 in a campaign); the longest item has about 8500 in Spanish. Tables become one line per row
  with " | " between cells, and the two stat blocks printed inside an item go at the end of its
  text.
- Attunement is the first line of the description, as the SRD prints it under the item's name
  ("Wondrous Item, Rare (Requires Attunement)"). No field of its own and no change on the sheet.
- The price is the SRD value of the item's rarity (100, 400, 4000, 40000 and 200000 GP; an
  artifact has none). A potion is worth half and ten pieces of magic ammunition one potion, as
  the SRD says; an item made from one mundane item adds that item's cost. Only items the SRD
  types as a potion are halved: other consumables cannot be told from the subtitle.

A pack item now carries a rarity, which a campaign keeps when it takes the item; an item without
one is common. One entry per SRD heading, except the five "+1, +2, or +3" headings (ammunition,
armour, shield, wand of the war mage, weapon), which become one entry per bonus because each
bonus has its own rarity: 268 entries from 258 headings. Eight items whose rarity depends on a
variant named in their text (the giant strength belt and potion, the feather token, the
figurine, the horn of Valhalla, the Ioun stone, the potions of healing and the spell scroll)
enter once, with the lowest rarity their text lists and no price. An item made from one mundane
item (a shield, plate armour, a dagger) takes its slot, weight and properties, so it can be
equipped; its magic bonus is not applied by the app. One that fits "any" weapon or armour has no
slot until the DM gives it one. Rings and worn wondrous items go on their slot.

## Consequences

- A published pack version never changes a running game until its DM accepts the update.
- The app needs the network for game data; pack content is cached by version.
- Pack entries keep stable keys across versions so campaign versions, hidden entries and updates
  can follow them.

## Addendum: content by pack (RYT-184, 2026-11-26)

The Content section works by pack instead of by pack category. The server keeps the per-category
records and functions; migration `20261228120000_campaign_content_by_pack` adds pack-wide ones.

- **One switch per pack.** `set_campaign_content_pack` turns on every category the pack has
  (only a pack offered to the campaign) or turns off every category the campaign enabled, also
  when the pack is no longer offered. Each category goes through the same step as
  `set_campaign_content`, so the SRD creatures still follow the bestiary record. The SRD pack
  keeps refusing changes while it is not the published public SRD.
- **One update per pack.** `get_campaign_content_pack_changes` sums what the pack's current
  version changes over the enabled categories pinned below it, and lists the entries an update
  touches (withdrawn, hidden or with a campaign version; own versions first; 200 at most).
  `update_campaign_content_pack` moves them all at once and carries the version it expects.
- **Cover.** A pack's picture is the reserved entry of kind `pack` and key `cover`, which names
  it in `data.index.image` like any pictured entry; without one, the first pictured creature,
  item or class stands in. Kind `pack` belongs to no category: campaigns are never offered it,
  counts and reviews skip it, and a version that changes only the cover advances every campaign
  at once. Pack titles stay unversioned.
- **Lists.** Categories count their entries per kind; the entry list can show hidden entries
  only, returns the hidden total and each entry's index row. `get_campaign_used_creatures` names
  the creatures the campaign's encounters use, so hiding or turning off can warn about them.

## Addendum: owner's book packs made public (RYT-187, 2026-11-26)

Rule 5 keeps content from books the owner bought in private packs. The owner chose otherwise for
the packs of Tasha's Cauldron of Everything and Xanathar's Guide to Everything ("Haz los paquetes
publicos también", 2026-11-26), after being told that every DM of rytta.app would then read the
books' full text and that this exposes the owner to a copyright claim. Both packs are public in
PRE and production at version 1, licence still "Private use". The Player's Handbook 2024 pack
(RYT-175) was already public by an earlier owner change. The texts and line files stay out of
the repository either way.

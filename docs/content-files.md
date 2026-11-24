# Content files

How to prepare a file the content library imports (Library, a pack, Import). The same format
loads any pack; this guide was written for RYT-175, a private pack with content from a book the
owner bought. The examples are entries of the published base pack (SRD 5.2.1, CC-BY-4.0).

## Where the files live

Files with content from a book stay out of the repository, which is public: keep them in
`content-private/`, which is ignored. `npm run check:private` (part of `npm run check`) fails
if a file under that folder is ever tracked. Such content goes into a private pack only, offered
to the owner's campaigns, never into the base pack or a pack open to all.

## The file

```json
{
  "format": "rytta-content",
  "version": 1,
  "kind": "feat",
  "entries": [{ "key": "alert", "name_en": "Alert", "name_es": "Alerta", "data": {} }]
}
```

- `kind` at the top applies to every entry; leave it out and give each entry its own `kind` to
  mix kinds in one file.
- `key`: lowercase letters, digits and hyphens, 80 characters at most. It identifies the entry
  for ever; importing the same kind and key again updates the entry.
- `name_en`, `name_es`: one language is enough.
- `data`: an object of 128 KB at most. `data.index` holds what lists and choices read (4 KB at
  most); `data.en` and `data.es` hold the text in each language.
- A file holds 5000 entries and 20 MB at most.

Check a file before uploading it:

```
npm run content:check -- content-private/feats.json
```

It runs the parser the import uses and lists each entry it refuses with the reason. The import
then shows what it would add, update and refuse before writing anything.

## What each kind needs in `data.index`

| Kind         | Fields                                                                                   |
| ------------ | ---------------------------------------------------------------------------------------- |
| `subclass`   | `class`: the key of its class (a base pack class, or a class of the same pack)           |
| `feature`    | `id` (`feature.<key>`), `cat` (`feature`), `fc` class, `sb` subclass, `lv` level         |
| `feat`       | `category` (`origin`, `general`, `fightingStyle`, `epicBoon`), `repeatable`              |
| `background` | `abilities` (three), `skills` (one to four), `feat` (its origin feat), `featList`        |
| `species`    | `size`, `speed`, `traits` (each with `key`, `en`, `es`)                                  |
| `spell`      | `id` (`spell.<key>`), `cat` (`spell`), `lv` (0 for a cantrip), `sc` school, `cl` classes |

Examples:

```json
{ "kind": "subclass", "key": "champion", "name_en": "Champion", "name_es": "Campeón",
  "data": { "index": { "class": "fighter" } } }

{ "kind": "feature", "key": "fighter-champion-improved-critical",
  "name_en": "Improved Critical", "name_es": "Crítico mejorado",
  "data": { "index": { "id": "feature.fighter-champion-improved-critical", "cat": "feature",
    "en": "Improved Critical", "es": "Crítico mejorado", "fc": "fighter", "sb": "champion", "lv": 3 } } }

{ "kind": "feat", "key": "alert", "name_en": "Alert", "name_es": "Alerta",
  "data": { "index": { "category": "origin", "repeatable": false } } }

{ "kind": "background", "key": "acolyte", "name_en": "Acolyte", "name_es": "Acólito",
  "data": { "index": { "abilities": ["int", "wis", "cha"], "skills": ["insight", "religion"],
    "feat": "magic-initiate", "featList": "cleric" } } }

{ "kind": "species", "key": "dwarf", "name_en": "Dwarf", "name_es": "Enano",
  "data": { "index": { "size": "medium", "speed": 30,
    "traits": [{ "key": "darkvision", "en": "Darkvision", "es": "Visión en la oscuridad" }] } } }

{ "kind": "spell", "key": "fireball", "name_en": "Fireball", "name_es": "Bola de fuego",
  "data": { "index": { "id": "spell.fireball", "cat": "spell", "en": "Fireball",
    "es": "Bola de fuego", "lv": 3, "sc": "evocation", "cl": ["sorcerer", "wizard"] } } }
```

Keys that tie entries together:

- A subclass's features are `feature` entries whose key starts with `<class>-<subclass>-` and
  whose index names both (`fc`, `sb`) and the level that grants them (`lv`).
- A feat's text is the feature `feat-<feat key>`; a species trait's text is the feature
  `species-<species key>-<trait key>`.
- Inside a pack other than the base pack, name a base pack class by its bare key (`fighter`) and
  a class or subclass of the same pack by its own key; the app adds the pack's reference.

## The text

`data.en` and `data.es` share one shape: `summary` (one line for lists), `blocks` (the body) and,
for a printed source, `page`. A block is a paragraph `{ "t": "p", "x": "…" }`, optionally with a
bold lead-in `"lead"`, or a table `{ "t": "table", "head": […], "rows": [[…]] }`. A spell adds
`spell` with `time`, `range`, `components`, `duration` and, where it applies, `save`, `damage`
and `material`.

The quickest way to see the exact shape of a kind is to write one entry with the library's form
and read its JSON tab.

## What the app does with a pack's content

Features show as text. Uses of a new subclass's or feat's resources are tracked by hand, as for
any pack class (ADR 051); only the base pack's own classes, species and feats have automatic
trackers.

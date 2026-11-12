# ADR 030: art for every SRD creature and the DM's own image per creature

Date: 2026-11-05. Status: accepted for `RYT-053`; production migration `bestiary_images` applied
2026-11-05 (hosted version 20261104234516). Builds on ADR 027 (private creature images) and ADR 028
(SRD bestiary).

## Context

The user wants an image on every bestiary creature, from any free source, and wants the DM to tap
a creature's image, SRD or campaign, to either view it or change it. The SRD (CC-BY-4.0) licenses
text only; Wizards of the Coast art is not licensed and stays out. Wikimedia Commons has free photos
of real animals and public-domain paintings of mythological creatures, but almost nothing for
creatures invented by D&D (searches return unrelated or unsuitable files). The user chose a free mix
over a paid, single-style AI set (2026-11-05).

## Decision

### Sources (all 330 creatures)

- **Wikimedia Commons** (163): the free lead image of the English Wikipedia article for the
  animal, the myth or the folklore creature (`pilicense=free`), plus public-domain plates of the
  _Dictionnaire Infernal_ (1863) for fiends, life restorations (mostly public-domain paintings by
  Charles R. Knight and others) for prehistoric animals instead of fossil skeletons, and a few
  curated files. Accepted licences: public domain, CC0, CC BY, CC BY-SA, CC SA and GFDL; NC, ND and
  non-free files are rejected by the script and by the content test. Authors that the Commons
  metadata leaves empty or buries in prose are curated in the script.
- **Battle for Wesnoth portraits** (84), GNU GPL v2 or later, credited to the Battle for Wesnoth
  contributors with a link to the file at the pinned commit: people of the SRD (guards, mages,
  bandits), undead, the red dragons, trolls, nagas, merfolk, ogres and other monsters.
- **game-icons.net icons** (83), CC BY 3.0, credited to their authors, drawn as chestnut ink on
  parchment for creatures with no fitting picture (aboleth, mimic, owlbear, mephits…). The chromatic
  and metallic dragons other than red take a dragon head (a spiral for wyrmlings) in their own
  colour: no free painting shows each colour, and the Wesnoth drakes did not match it.
- Every choice was made by eye from contact sheets (`scripts/bestiary/contact_sheet.py`) and kept
  in `scripts/bestiary/art-selection.json` with the Commons metadata in `art-commons.json`; real
  human remains, nudity and modern photos of people were avoided.
- `scripts/bestiary/build_images.py` (manual, not CI) writes `public/bestiary/art/<id>.webp`
  (longest side 720px), `public/bestiary/thumbs/<id>.webp` (128px square),
  `src/features/bestiary/content/art.json` (origin, title, source, author, licence, licence URL,
  size) and `docs/bestiary-art-credits.md`. Images are static files fetched on demand (lazy, never
  precached); credits are a lazy chunk.
- The styles differ (photos, engravings, painted portraits, icons). A later single-style set can
  replace the files and `art.json` without code changes.

### The DM's own image

- A campaign creature keeps its private image (ADR 027); a campaign copy of an SRD creature shows
  that creature's bundled art until the DM chooses another image.
- An SRD creature can carry the DM's own image in one campaign: table
  `campaign_creature_images (campaign_id, srd_id) → image_path`, DM-only reads under RLS, writes
  through `set_creature_srd_image(campaign, srd_id, path | null, request)` (DM, campaign lock,
  idempotent request id, path of the own environment, campaign and creature, object must exist;
  null restores the bundled art) and `list_creature_srd_images(campaign)`.
- Objects live in the private `creature-images` bucket under
  `{public|pre}/{campaign}/srd-{srd id}/{uuid}.webp`. The global storage router accepts that
  prefix for the campaign DM only; Players never read these objects.

### Interface

- With any image, the token at the head of the stat block is a button ("Image of X: view or
  change") that opens a menu anchored to it: View image, Change image…, and Restore the original
  art (SRD creature with the DM's image) or Remove image (campaign creature). Without any image the
  token stays the file picker (ADR 027).
- The viewer is a modal (full screen on phones): the image on a raised mat held by four photo
  corners, and a label beneath with the author, the licence (linked) and the source (Wikimedia
  Commons, Battle for Wesnoth or game-icons.net), plus the note that Rytta resized and cropped it.
  The DM's own image says it is the campaign's. One quiet action: Change image. Escape or close
  returns focus to the token.
- List rows show the 128px thumbnail; the DM's combat tokens show the bundled art of an SRD
  creature without an image. Players and the table never receive `srd_id`, so their projection is
  unchanged (monogram unless a campaign image is attached).

## Consequences

- Every SRD creature has art and a visible credit; the repository grows by about the size of the
  WebP files (see the RYT-053 evidence).
- GPL portraits ship as separate data files with their licence and source link; the app code keeps
  its own licence.
- Not covered: Player-side art for SRD creatures (it would reveal which SRD creature an NPC is),
  replacing images in running fights for Players, and a single art style.

## RYT-067 amendment: one painted style, made by hand in ChatGPT (2026-11-06)

The mix of photos, old artwork, portraits and icons fits the creatures unevenly: reviewed by eye, 204
of the 330 pictures score 1–3 out of 10 (icons average 1.5, photos 2.7, old artwork 4.1, Wesnoth
portraits 7.3). The author replaces them, creature by creature, with illustrations painted in ChatGPT
in one style, under the rules of the sprite art (`docs/sprite-art.md`): made by hand in the ChatGPT app,
no artist or product names, no third-party references.

- `scripts/bestiary/art-review.json` keeps each picture's score, kind and review and the subject of
  its replacement; `art_catalogue.py` writes `art/bestiary/bestiary-art-catalogue.xlsx` and
  `catalogue.csv`, worst fit first, with the shared prompt and the path to save each picture at,
  `art/bestiary/source/<creature id>.png`.
- `import_art.py` turns every saved picture into the 720px image and the 128px thumbnail (refusing
  unknown names, pictures under 512px and pictures far from square), keeps the replaced source under
  `replaced` in `art-selection.json` so `build_images.py` rebuilds the same art, and logs the source's
  checksum and C2PA provenance (software agent, model, date) in `art-generated.json`.
- The credit has a fourth origin, `generated`: author Rytta, licence "© Rytta", source the credits page,
  whose header names ChatGPT image generation (OpenAI, `gpt-image`). The viewer says the picture was
  painted for Rytta with ChatGPT image generation and resized. Under OpenAI's Terms of Use the output
  belongs to the author; a purely generated picture may not be protected by copyright, which is
  acceptable for this art.
- The PNG sources (about 2 MB each with their manifest) stay out of git; the shipped WebPs and the
  provenance log are committed. Without the sources, `build_images.py` keeps the imported renditions.

## RYT-087 amendment: the prompts name Dungeons & Dragons (2026-11-11)

At the author's request, every bestiary prompt now names the creature as the official Dungeons &
Dragons creature (5th edition, 2024 rules) and asks for its official D&D design, followed by the
description and an accuracy line (no extra or missing heads, limbs, wings or tails). The author
prefers pictures that match the canonical creatures over the stricter rule of the RYT-067 amendment,
and accepts that they may resemble official Wizards of the Coast designs. The prompts still name no
artist, never ask for the art style of an official book and never attach official art; the shared
Rytta style, framing and background stay. The sprite prompts (`docs/sprite-art.md`) keep their rule.

## RYT-088 amendment: the painted set ships, and the stat block leads with it (2026-11-12)

The 330 painted pictures were imported with `import_art.py` (every source 1254 × 1254 with a ChatGPT
C2PA manifest; one misnamed file, `glick.png`, renamed to `grick.png`). Every credit is now
`generated`; the replaced sources stay in `art-selection.json` under `replaced`.

The DM's stat block leads with the picture, chosen by the user from an options page (P1–P5 A, B, A,
A, A):

- A plate: the print on a raised mat held by four photo corners, the viewer's treatment. Phones show it
  full width above the name; from a 34rem pane (tablet sheet, laptop side pane) it keeps its own
  sticky column (11–17.5rem) beside a stat block of at least 20rem. The square is reserved before the
  image loads; dark themes tone the print down a little.
- Tapping the print opens the viewer. A 44px pencil in the mat's corner changes the image; with the
  DM's own image it opens change and restore (SRD) or remove (campaign creature). Creatures without
  any image keep the token picker beside the name.
- The DM's combat detail of a creature shows a 112px portrait that opens the viewer (no change there);
  Players and the table keep tokens, since they never receive `srd_id`.

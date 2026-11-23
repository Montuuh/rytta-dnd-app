# Interface art

Painted illustrations for the interface itself (RYT-112): the brand emblem and app icons, the
landing hero, campaign covers, default shop banners, class emblems, item category pictures and
empty-state plates. Creature portraits and map sprites have their own guides
([bestiary art credits](bestiary-art-credits.md), [generated sprite art](sprite-art.md)).

## Where it lives

| Set             | Shipped files                                        | Size                 | Used by                                                  |
| --------------- | ---------------------------------------------------- | -------------------- | -------------------------------------------------------- |
| Brand           | `public/art/brand/{hero-wide,hero-tall,emblem}.webp` | 1920×1080, 1080×1440 | landing, header, loading screen                          |
| App icons       | `public/icons/icon-{32,180,192,512}.png`, maskable   | PNG                  | `index.html`, `public/manifest.webmanifest`              |
| Share image     | `public/icons/share.jpg`                             | 1200×630             | Open Graph and Twitter meta                              |
| Campaign covers | `public/art/covers/*.webp` (8)                       | 1280×720             | hub cards, picked by campaign id; no schema field        |
| Shop banners    | `public/art/shops/*.webp` (12, one per shop type)    | 1280×720             | shops without an uploaded image (no type: general store) |
| Class emblems   | `public/art/classes/*.webp` (12) and `thumbs/`       | 512×512, 128×128     | creation, default portraits, tokens                      |
| Item categories | `public/art/items/*.webp` (9) and `thumbs/`          | 256×256, 96×96       | item tiles of 40px or more without an uploaded picture   |
| Empty states    | `public/art/empty/*.webp` (6)                        | 480×480              | whole-panel empty states, not-found and error screens    |
| Scenes          | `public/art/scenes/campfire.webp`                    | 1280×720             | group rest                                               |

Components use `ArtPlate` (`src/shared/ui/art.tsx`) and `artUrl` / `pickByKey`
(`src/shared/ui/art-url.ts`); URLs always go through `import.meta.env.BASE_URL`. The pictures are
decorative (`alt=""`) unless a caller passes text. An uploaded image always wins over a default.

## Rules

- One visual language: painterly still lifes and scenes, warm amber light on deep umber, the
  palette of [the design system](design-system.md). Square plates sit on a near-black umber
  ground (`#140F0B`) so they read as framed prints in both themes.
- No text, numerals, logos, borders, people or faces in a picture. Wide scenes keep their lower
  third dark for a title; the hero keeps its upper part calm.
- Prompts never name an artist, a studio, a product or an existing work, and use no third-party
  image as a reference.
- A painting is not used below 40px; small tiles keep their glyph.
- Sources are PNG under `art/generated/` (not committed, like the other art sources); only the
  WebP, PNG icon and JPEG outputs are committed.

## Regenerating

New interface pictures are requested through the [image queue](art-queue.md) and painted by hand in
ChatGPT (set `interface`); the steps below only render the existing first delivery again.

The scripts in `scripts/art-gen/` are local tools and are never imported by the application:

1. `node scripts/art-gen/build-batch.mjs` writes the prompt list (`batch.json`).
2. `node scripts/art-gen/generate.mjs --batch scripts/art-gen/batch.json` renders the missing
   sources through the Google Cloud image API with the machine's own application-default
   credentials. It needs `GOOGLE_CLOUD_PROJECT` in `.env.local` (never a `VITE_` variable) and
   skips files that already exist.
3. `python scripts/art-gen/build.py` crops and encodes the shipped files.

Inspect every new picture before committing: reject text, frames, hands, cut-out backgrounds
and anything that breaks the rules above, delete the source and render it again.

## Provenance log

| Set                                   | Date       | Model                                           | Prompts                           | Notes                                                                              |
| ------------------------------------- | ---------- | ----------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------- |
| All 51 pictures of the first delivery | 2026-11-17 | Google Gemini image model, `gemini-3-pro-image` | `scripts/art-gen/build-batch.mjs` | Three rejected and rendered again: `items/ammo`, `items/tool`, `covers/underdark`. |

## Credits

The pictures under `public/art/` and `public/icons/` were made by the Rytta author with Google's
image generation (Gemini) from the prompts in `scripts/art-gen/build-batch.mjs`, and cropped and
encoded by `scripts/art-gen/build.py`. Google does not claim ownership of generated output under
its terms of service. The compass emblem carries the four cardinal letters as part of the object.

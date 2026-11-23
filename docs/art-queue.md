# Image queue

Rytta's painted pictures are made by the author by hand in the ChatGPT app: the subscription does
not include the image API and OpenAI's terms forbid scripting the website. The image queue is the
single place where a delivery asks for a picture, the author paints it, and the delivery checks and
imports it. It replaces separate prompt lists for new work; the sprite and bestiary catalogues
([sprite art](sprite-art.md), [bestiary art credits](bestiary-art-credits.md)) keep the record of
what was imported before it, and the [interface art](interface-art.md) rules still apply.

## Files

| File                                    | What it is                                                                     |
| --------------------------------------- | ------------------------------------------------------------------------------ |
| `art/queue/requests.json`               | The queue: batches and requests with their status and every attempt (tracked). |
| `scripts/art-queue/queue.mjs`           | Command line: add, list, mark, check, approve, reject, import, cancel.         |
| `scripts/art-queue/server.mjs`          | The author's panel, `npm run art:queue`, on http://127.0.0.1:5190 only.        |
| `scripts/art-queue/inspect.py`          | Automatic checks of one picture (Pillow).                                      |
| `art/<set>/source/…`, `art/generated/…` | The PNG sources at each request's path (not committed, C2PA inside).           |

All of them are local tools; the application never imports them.

## Flow

| Status      | Who      | What happens                                                                                                                                                                                           |
| ----------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pending`   | delivery | Request added: purpose, full prompt, aspect, background, minimum size, path, acceptance criteria.                                                                                                      |
| `generated` | author   | Painted in ChatGPT, downloaded with its download button and dropped on the request in the panel (the panel saves it at the path), or saved there by hand and marked. The automatic checks run at once. |
| `approved`  | delivery | The picture was looked at against the acceptance criteria and passes the automatic checks.                                                                                                             |
| `pending`   | delivery | Rejected: the reason is recorded on the attempt and the prompt is corrected for the next one.                                                                                                          |
| `held`      | author   | Rejected three times: the author decides whether to change the request, accept it or cancel it.                                                                                                        |
| `imported`  | delivery | The set's import ran (WebP, thumbnails, the lists the app reads) and the result was checked in the app.                                                                                                |
| `cancelled` | either   | No longer needed; the reason is kept in the notes.                                                                                                                                                     |

Requests of one set that share a style form a **batch**: the author opens a new ChatGPT
conversation, pastes the batch style once and then each request prompt, as with the tavern pilot.

## Automatic checks

`inspect.py` refuses a file that is not a real PNG (a renamed JPEG or WebP), is smaller than the
request's minimum side, has the wrong aspect (a warning instead when the importer crops), or has no
real transparency when a transparent background was asked for (a painted checkerboard). It warns
when the picture has no C2PA manifest naming ChatGPT, which usually means a screenshot or a
clipboard copy rather than the download button. Approval refuses a picture that fails a check or
changed after it was marked.

## Sets

| Set         | Source folder         | Defaults                     | Import                                     |
| ----------- | --------------------- | ---------------------------- | ------------------------------------------ |
| `bestiary`  | `art/bestiary/source` | 1:1, opaque, 512 px          | `python -I scripts/bestiary/import_art.py` |
| `sprites`   | `art/sprites/source`  | 1:1, transparent, 1024 px    | `python scripts/sprites/import_sheets.py`  |
| `interface` | `art/generated/<set>` | 16:9 cropped, opaque, 720 px | `python scripts/art-gen/build.py`          |
| `other`     | `art/queue/source`    | 1:1, opaque, 1024 px         | none: the request's ticket wires it        |

A new sprite sheet also needs its row in `scripts/sprites/catalogue.py` (layout and footprint); a
bestiary file is named by the SRD creature id; a new interface folder needs its rule in
`scripts/art-gen/build.py`. New interface art is painted in ChatGPT like the rest;
`scripts/art-gen/generate.mjs` stays only to render the existing batch again.

## Adding requests

```text
node scripts/art-queue/queue.mjs add requests.json
```

```json
{
  "batches": [{ "id": "shops-2", "title": "Shop banners, second set", "style": "Style: …" }],
  "requests": [
    {
      "set": "interface",
      "batch": "shops-2",
      "ticket": "RYT-000",
      "title": "Shop banner: alchemist",
      "purpose": "Default banner of alchemist shops without an uploaded image.",
      "prompt": "Create a wide 16:9 painting of …",
      "aspect": "16:9",
      "path": "art/generated/shops/alchemist.png",
      "acceptance": ["Lower third dark for the title", "No text, people or faces"]
    }
  ]
}
```

Prompts follow the rules of their set: no artist, studio, product or existing work (the command
refuses the common ones), no text, people or faces unless the set allows them, and the conventions
of [sprite art](sprite-art.md) for map pieces. Every request names at least one acceptance
criterion that can be judged by looking at the picture.

## Reviewing and importing

```text
node scripts/art-queue/queue.mjs check                         every generated request
node scripts/art-queue/queue.mjs approve IMG-001 --note "…"
node scripts/art-queue/queue.mjs reject IMG-001 --reason "…" --prompt-file corrected.txt
node scripts/art-queue/queue.mjs import                        every approved request, set by set
```

Look at every picture before approving it. An import that fails marks nothing imported. After the
import, check the picture where the app shows it (390 px and tablet) and record the attempt in the
set's provenance log or credits.

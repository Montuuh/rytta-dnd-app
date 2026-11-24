# RYT-169 validation: image queue

Date: 2026-11-23. Branch `next`.

## Inventory before the queue

Every row of the existing catalogues was already imported, so nothing was migrated (owner: only
pictures not yet generated and imported move to the queue):

| Catalogue                        | Rows | Imported |
| -------------------------------- | ---- | -------- |
| `art/sprites/catalogue.csv`      | 211  | 211      |
| `art/bestiary/catalogue.csv`     | 330  | 330      |
| `scripts/art-gen/batch.json`     | 50   | 50 sources present |

The queue starts empty (`art/queue/requests.json`).

## Automatic checks on real sources

`inspect.py` on shipped sources:

- `art/bestiary/source/aboleth.png`: PNG, 1254×1254, 1:1, C2PA naming ChatGPT, gpt-image, OpenAI.
- `art/sprites/source/props/altar-1.png` as transparent: alpha passes (58 % transparent).
- `art/generated/covers/city.png` at 16:9 crop: passes; the C2PA warning (manifest without ChatGPT)
  is correct, since that set was rendered by the Google image model.

## End-to-end run on a scratch queue (`ART_QUEUE_FILE` outside the repository)

1. `add` with a batch and two requests: IMG-001 and IMG-002 added.
2. `add` of a prompt with "in the style of": refused.
3. `mark IMG-001` (transparent, opaque picture saved at the path): status `generated`, check
   `fail: no alpha channel`, exit code 1.
4. `approve IMG-001`: refused because an automatic check fails.
5. `reject IMG-001 --reason …`: back to `pending`, attempt 1 keeps the reason.
6. `mark IMG-002`, `approve IMG-002 --note …`, `import`: set `other` has no import command, so it
   is reported for manual wiring and marked imported.
7. `summary`: `{ pending: 1, imported: 1 }`.

## Panel

`npm run art:queue` served on 127.0.0.1 (test instance on port 5191 with the scratch queue):

- Uploading a PNG to IMG-001 from the page saved it at the request path, marked attempt 2 as
  generated and returned the checks; the review tab shows them (✓ PNG, size, aspect, C2PA; ✕ no
  alpha) with the earlier rejection reason labelled by attempt.
- Uploading bytes that are not a PNG: HTTP 400 with the download hint.
- The panel opens on the first tab with work; captured at desktop width and 375 px.
- The server refuses other Host headers and cross-site posts, and only serves or writes `.png`
  paths inside the repository.

Scratch sources and the test launch entry were removed afterwards.

## Not covered

- No real ChatGPT round trip yet: the first real request will exercise the author's download and
  drop with a fresh C2PA file.
- The panel is a local tool, not application UI, so no independent UI review verdict was recorded
  for it.

## Repository checks

`npm run check` passed on 2026-11-23: typecheck, lint, architecture and documentation contracts, 132 test files (1199 tests) and the build.

# RYT-178: SRD magic items show their own painting

Status: planned. First slice on 2026-11-24: the requests are in the image queue and the item
prompt the app copies matches them. Nothing is painted, imported or shown yet.

## Inventory of the two packs (2026-11-24)

Only creature, item and class entries carry a picture (RYT-172). Counts read from the hosted
library and the repository:

| Pack        | Kind with a picture | Entries | State                                             |
| ----------- | ------------------- | ------- | ------------------------------------------------- |
| Base (SRD)  | creature            | 330     | 330 painted                                       |
| Base (SRD)  | class               | 12      | 12 painted                                        |
| Base (SRD)  | item, basic         | 200     | queued, IMG-001 to IMG-200 (RYT-170)              |
| Base (SRD)  | item, magic         | 268     | queued here, IMG-201 to IMG-468                   |
| Handbook    | none                | 405     | subclasses, features, feats, backgrounds, one species and spells: the app draws none of them |

## Delivered

- **Queue.** 268 requests in nine batches by kind of item (armour and shields 23, weapons and
  ammunition 37, potions, oils and the scroll 25, rings 22, rods, staffs and wands 34, worn
  items 29 and 28, wondrous objects 35 and 35), set `interface`, saved at
  `art/generated/items/srd/<library key>.png`, with the style sentence of the basic items. Each
  prompt describes the object from its SRD entry; an entry that stands for several objects
  shows one representative. The queue holds 468 pending requests with 468 different paths.
- **Import rule.** `scripts/art-gen/build.py` turns `art/generated/items/srd` into
  `public/art/items/srd` and its thumbs, like the basic items.
- **The app's item prompt.** "Copy art prompt" in the item form now opens like a queue request
  ("Create a square (1:1) image … Item icon: …"), adds the item's description on one line (cut
  near 300 characters at a word) and ends with the queue's style sentence, so a picture made
  from it matches the app's own. A unit test compares the sentence with the queue's item
  batches. Names and descriptions lose their double quotes, which closed the quoted name.

## Checks

- `npm run check` passed before the review fix; after it, the prompt's unit tests (7),
  typecheck and lint passed.
- Browser, 390px and 820px: the tests that copy a prompt in the item form, shop image, map
  import, story card and creature image pass (10).
- UI review: round 1 CHANGES_REQUIRED (a double quote in the item name closed the quoted name;
  a word ending exactly at the limit was dropped). Both fixed; round 2 PASS.

## Not verified

- No prompt was tried in an image tool: the 268 descriptions were written from the entries and
  not looked at as pictures.
- The manual copy box shows eight lines of a longer prompt (it scrolls); the copied message at
  150% text size and Safari's clipboard were not tried.

## Still to do

- The owner paints the pictures; then review, import and show them in the library and in the
  inventory, storeroom and shop tiles.

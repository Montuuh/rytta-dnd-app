// Local-only: writes scripts/art-gen/batch.json for generate.mjs.
import { writeFileSync } from 'node:fs'

const scene =
  'Style: original painterly dark-fantasy illustration with rich oil-paint brushwork, a quiet field-journal mood, warm amber candle or lantern light against deep umber and near-black shadows, restrained palette of oak brown, iron grey, cream, muted red, ochre, moss and slate. No text, no letters, no numbers, no logos, no watermark, no border, no people, no faces.'
const plate =
  'Style: original painterly dark-fantasy still life, rich oil-paint brushwork, a single subject centred with generous margin on a very dark warm umber background (#140F0B) that fades to near-black at every edge, soft warm amber rim light from the upper left, restrained palette of oak brown, iron grey, cream, muted red, ochre and moss. No text, no letters, no numbers, no logos, no watermark, no frame, no border, no people, no faces, no hands.'

const items = []
const S = (out, prompt, aspect = '16:9', size = '1K') =>
  items.push({ out: `art/generated/${out}.png`, prompt: `${prompt}\n\n${scene}`, aspect, size })
const P = (out, prompt, size = '1K') =>
  items.push({
    out: `art/generated/${out}.png`,
    prompt: `${prompt}\n\n${plate}`,
    aspect: '1:1',
    size,
  })

P(
  'brand/app-icon',
  'App icon artwork: an ornate antique brass compass seen straight from above, its needle a warm amber, engraved rose with eight points, filling most of the square, perfectly centred and symmetrical, simple bold readable shapes that stay legible at very small sizes.',
  '2K',
)
S(
  'brand/hero-portrait',
  'Vertical key art: a candlelit wooden gaming table seen from a low angle at the bottom third of the picture: polyhedral dice without visible numerals, a rolled parchment map, a brass compass and a closed leather tome. The upper two thirds are calm dark drifting haze for interface overlay.',
  '3:4',
  '2K',
)

const shops = {
  blacksmith:
    'a blacksmith forge interior: glowing coals, anvil with a half-finished blade, hammers and tongs hanging on a stone wall',
  armorer:
    'an armourer workshop: a suit of plate on a wooden stand, shields and helmets on racks, polishing cloths on a bench',
  fletcher:
    'a fletcher workshop: bundles of arrows, unstrung longbows on pegs, goose feathers and a fletching jig on a workbench',
  generalStore:
    'a village general store: shelves of lanterns, rope coils, sacks, crates, candles and tin cookware behind a worn counter',
  alchemist:
    'an alchemist shop: coloured glass flasks, a copper alembic, dried herbs hanging from beams, a mortar and pestle',
  tavern:
    'a cosy tavern interior: a long bar with wooden tankards, barrels, a hearth fire, empty stools',
  tailor:
    'a tailor shop: bolts of dyed cloth, cloaks on wooden mannequins, spools of thread, shears on a cutting table',
  temple:
    'a small temple alcove: a stone altar with votive candles, incense smoke, an offering bowl, light through a narrow window',
  outfitter:
    'an adventuring outfitter: backpacks, bedrolls, climbing gear, grappling hooks, tents and travel boots displayed on walls',
  toolShop:
    'an artisan tool shop: chisels, saws, lockpicks, cartographer instruments and tinker tools laid out in neat rows on pegboards',
  musicShop: 'a luthier and music shop: lutes, a lyre, drums, flutes and a viol hanging on a wall',
  jeweler:
    'a jeweller workshop: gems on velvet trays, gold rings, a loupe and fine tools under a small lamp',
}
for (const [key, subject] of Object.entries(shops))
  S(
    `shops/${key}`,
    `Wide shop banner: ${subject}. Composition keeps the lower third darker and uncluttered for a title overlay.`,
  )

const classes = {
  barbarian: 'a notched greataxe wrapped with fur and bone charms',
  bard: 'a lute with a ribbon and a feathered cap beside it',
  cleric: 'a mace resting against a radiant sun-disc holy symbol',
  druid: 'a gnarled wooden staff sprouting leaves and a small antler talisman',
  fighter: 'a longsword crossed behind a dented steel shield',
  monk: 'cloth hand wraps coiled around a simple wooden staff with prayer beads',
  paladin: 'a winged great helm resting on a warhammer with a faint holy glow',
  ranger: 'a longbow and a quiver of arrows with a folded green hooded cloak',
  rogue: 'a pair of daggers, a lockpick roll and a dark half-mask',
  sorcerer:
    'a crystal orb with a swirling ember-and-lightning storm inside, held in a clawed iron stand',
  warlock: 'a chained eldritch tome bound in dark leather with a single violet gem on its cover',
  wizard:
    'an open spellbook with a quill, an hourglass and a pointed hat beside it, faint arcane glow from the pages, no legible writing',
}
for (const [key, subject] of Object.entries(classes))
  P(`classes/${key}`, `Class emblem: ${subject}.`)

const categories = {
  weapon: 'a well-used arming sword lying diagonally',
  armor: 'a leather-and-steel cuirass on a small wooden stand',
  shield: 'a round wooden shield with an iron boss and rim',
  gear: 'a worn leather adventurer backpack with a bedroll and coiled rope',
  consumable: 'a corked glass potion bottle with softly glowing red liquid',
  ammo: 'a bundle of arrows tied with twine',
  tool: 'a leather tool roll with a hammer, chisel and pliers, full-bleed square painting whose dark background reaches all four edges, not a circular medallion',
  treasure: 'a small open coffer spilling gold coins and a few cut gems',
  quest: 'a rolled parchment scroll sealed with dark red wax and a ribbon',
}
for (const [key, subject] of Object.entries(categories))
  P(
    `items/${key}`,
    `Item icon: ${subject}. Bold simple silhouette that reads clearly at thumbnail size.`,
  )

P(
  'empty/campaigns',
  'A blank unrolled parchment map on a table with an unlit candle and three dice without numerals, waiting for an adventure to begin.',
)
P(
  'empty/invitations',
  'A closed letter with an unbroken amber wax seal lying beside a small brass key.',
)
P('empty/shop', 'An empty wooden merchant shelf with a single small lit lantern on it.')
P('empty/satchel', 'An open empty leather satchel lying on its side, flap open, nothing inside.')
P(
  'empty/not-found',
  'A weathered wooden crossroads signpost with blank arms, wrapped in low fog, a lantern hanging from it.',
)
P(
  'empty/error',
  'A tipped-over inkwell with spilled ink and a snapped quill on scattered blank parchment.',
)
S(
  'scenes/campfire',
  'A small campfire at night in a forest clearing, bedrolls and packs around it, a kettle on a tripod, sparks rising into dark trees. Centre composition.',
)

const covers = {
  forest: 'a narrow road winding into an ancient misty forest at dusk, a distant lantern glow',
  mountains:
    'a high mountain pass with a ruined watchtower under storm clouds and a break of amber light',
  coast: 'a fog-bound harbour town at dawn with moored ships and a lighthouse',
  desert: 'half-buried sandstone ruins in a desert at sunset, long shadows',
  underdark:
    'a vast underground cavern with luminous fungi and a stone bridge over a chasm, full-bleed painting with no painted border or canvas edge',
  frost: 'a snowbound stone keep on a cliff under a pale aurora',
  swamp: 'a drowned swamp with twisted trees, hanging moss and wisp lights over black water',
  city: 'rooftops and spires of a walled medieval city at dusk, warm windows lit, crows in the sky',
}
for (const [key, subject] of Object.entries(covers))
  S(
    `covers/${key}`,
    `Wide campaign cover landscape: ${subject}. Lower third darker and calm for a title overlay.`,
  )

writeFileSync('scripts/art-gen/batch.json', JSON.stringify({ items }, null, 2))
console.log(`${items.length} items`)

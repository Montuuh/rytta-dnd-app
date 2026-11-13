#!/usr/bin/env python3
"""RYT-066: the catalogue of painted art the author generates by hand with ChatGPT.

Each row is one picture to generate: the prompt to paste, the file name and where to save it.
scripts/sprites/import_sheets.py reads the same rows to find every prop on its sheet, so a picture
saved under its name is imported without further notes. Writes art/sprites/catalogue.csv and
art/sprites/sprite-catalogue.xlsx (docs/sprite-art.md explains the rules).

Run: python scripts/sprites/catalogue.py
"""

from __future__ import annotations

import csv
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CSV_PATH = ROOT / "art/sprites/catalogue.csv"
XLSX_PATH = ROOT / "art/sprites/sprite-catalogue.xlsx"
SOURCE = "art/sprites/source"

# ---------------------------------------------------------------------------------------------
# Style blocks. Every prompt carries its block in full, so each row can be pasted on its own.

PROP_STYLE = (
    "Style: hand-painted digital art for a fantasy virtual tabletop battle map, soft painterly "
    "brushwork, slightly desaturated warm palette (oak brown, dark iron grey, cream linen, muted red, "
    "ochre, moss green, slate blue). A thin dark-brown outline around every object so it stays "
    "readable when small. Bold simple shapes and clear silhouettes, moderate detail, no tiny clutter. "
    "Soft even light from directly overhead. No cast shadows, no drop shadows and no glow or light "
    "spilling outside the objects. Flames, candles and embers are seen from directly above: a bright "
    "core with glowing embers, never upright tongues of fire. No text, letters, runes, numbers, labels, "
    "watermark or signature; no living people or animals (statues, carvings and bones are fine).\n"
    "View: strictly top-down orthographic, like a floor plan: the camera directly overhead, pointing "
    "straight down at 90 degrees. Show only what is seen from above, the tops of objects. Never draw a "
    "front face, a side, legs, doors, shelves, arches or openings as seen from the front; no "
    "perspective, no isometric or three-quarter angle, no horizon. Tall things read only by their top "
    "outline.\n"
    "Background: fully transparent PNG with a real alpha channel. No floor, no ground texture, no "
    "grid, no cells, no frames."
)

TILE_RULES = (
    "Scale: the image covers exactly 4 by 4 five-foot squares (about 6 by 6 metres) and must read at "
    "that scale.\n"
    "Seamless: the texture tiles in both directions. Whatever leaves the right edge continues on the "
    "left edge, and the bottom continues at the top, with no visible border or seam. Avoid any single "
    "feature that would stand out when the tile repeats.\n"
    "View: strictly top-down orthographic, perfectly flat, with even, shadowless lighting: no "
    "vignette, no light spots, no darker corners.\n"
    "Nothing on it: no furniture, objects, characters, grid lines, text, labels, frames or watermark."
)

FLOOR_STYLE = (
    "Style: hand-painted digital texture for a fantasy virtual tabletop battle map, soft painterly "
    "brushwork, slightly desaturated natural palette that sits under hand-painted props.\n"
    + TILE_RULES
    + "\nFill the whole square image edge to edge (no transparency)."
)

WALL_STYLE = (
    "Style: hand-painted digital texture for a fantasy virtual tabletop battle map, soft painterly "
    "brushwork, slightly desaturated palette, a little lighter and more contrasted than a floor so a "
    "wall stands out from the floor beside it.\n"
    + TILE_RULES
    + "\nFill the whole square image edge to edge (no transparency)."
)

EFFECT_STYLE = {
    "screen": (
        "Painted on a pure black background (#000000): only the effect itself is bright. Rytta blends "
        "it over the map so black becomes invisible, so leave no dark details that should stay dark."
    ),
    "multiply": (
        "Painted on a pure white background (#FFFFFF): only the effect itself is dark. Rytta blends it "
        "over the map so white becomes invisible."
    ),
    "normal": "Background: fully transparent PNG with a real alpha channel; thin parts may be partly transparent.",
}

EFFECT_COMMON = (
    "Style: hand-painted digital effect for a fantasy virtual tabletop battle map, soft painterly "
    "brushwork, readable from a distance.\n" + TILE_RULES
)

# ---------------------------------------------------------------------------------------------
# Props: one sheet holds 4 variants of one prop. Sizes in 5 ft squares as drawn before any turn.


@dataclass
class Prop:
    name: str  # plural used in the prompt
    w: int
    h: int
    size: str  # how much of its footprint it takes, said in the prompt
    fill: float  # the same as a share of the footprint, used by the import
    sheets: list[list[str]]
    used_in: str
    library: str = "existing"
    anchor: str = ""  # "back": a wall prop, its back along the top edge
    facing: str = ""  # an orientation sentence for the prompt
    halo: float = 0.0  # warm light past the footprint, in squares (as ui/sprites.ts)
    above: str = ""  # what each one shows from directly above (sprite audit 2026-11-08)
    spin: bool = False  # square and without a front: the board may turn it a quarter
    priority: int = 1
    second_priority: int = 2  # priority of sheets after the first


WALL_BACK = (
    "Each one stands against a wall, seen from directly above: its back runs along the top edge of its space and its front is only the bottom edge of its outline; its front face is not visible."
)

PROPS: dict[str, Prop] = {
    # Furniture ---------------------------------------------------------------------------------
    "table": Prop(
        "tavern tables",
        1, 1, "a table almost fills its square", 0.92,
        [
            ["a bare, worn oak table with knife marks", "a table with dice, a few coins and two tankards",
             "a table with an open map, an inkwell and a lit candle", "a table with bowls of stew, bread and a spilled tankard"],
            ["a round table with a red-and-cream checked cloth", "a table with playing cards and a clay pipe",
             "a table with a cutting board, cheese, a loaf and a knife", "a table with a stack of books and a candle stub"],
        ],
        "tavern hall, kitchen and bedrooms; dungeon libraries",
        spin=True,
    ),
    "chair": Prop(
        "wooden chairs",
        1, 1, "a chair takes about half of its square", 0.6,
        [
            ["a plain wooden chair", "a chair with a faded red cushion", "a sturdy armchair with a leather seat",
             "a rickety chair with a cracked seat"],
            ["a carved high-backed chair: from above, only the carved top rail of its back shows behind the seat", "a chair with a cloak draped over the backrest", "a simple wicker chair",
             "a dark-stained chair with iron studs"],
        ],
        "around tables in taverns and dungeon libraries",
        facing="Each chair is seen from directly above: the backrest is only a thin bar along the top edge of the seat, and the seat fills the rest.",
    ),
    "bed": Prop(
        "beds",
        1, 2, "a bed fills its 1 by 2 squares", 1.0,
        [
            ["a bed with a moss-green wool blanket", "a bed with a slate-blue blanket",
             "an unmade bed with rumpled cream sheets", "a simple straw pallet with a rough blanket"],
            ["a bed with an ochre patchwork quilt", "a bed covered with a brown fur blanket",
             "a noble bed with red velvet covers and carved corner posts", "a narrow cot with a grey wool blanket"],
        ],
        "tavern bedrooms, dungeon barracks",
        facing="The pillow end of each bed is at the top.",
    ),
    "bookshelf": Prop(
        "bookshelves against a wall",
        1, 1, "a bookshelf spans its square from side to side and is about half a square deep", 1.0,
        [
            ["a bookshelf: from above, rows of book tops in muted colours along its top board", "a scroll rack: from above, the round ends of rolled scrolls in rows",
             "a shelf of jars and potion bottles: from above, round lids and corks in rows, dried herbs on top", "a half-empty dusty shelf: bare boards from above, a skull and a candle on top"],
        ],
        "dungeon libraries and studies, tavern rooms",
        anchor="back", facing=WALL_BACK,
    ),
    "bar": Prop(
        "tavern bar counters",
        1, 3, "a bar fills its length and is about two thirds of a square wide", 0.9,
        [
            ["a dark wood bar with a brass rail and three tankards", "a stone-topped bar with bottles and a cutting board",
             "a rough plank bar with a small keg on top"],
        ],
        "the tavern hall",
        facing="Each bar stands vertically, with its beer tap or keg at the top end.",
    ),
    "rug": Prop(
        "rugs",
        2, 2, "a rug fills its 2 by 2 squares", 1.0,
        [
            ["a slate-blue rug with a cream border", "a worn moss-green rug with a leaf pattern",
             "a round braided rag rug in mixed colours", "a brown fur pelt rug"],
        ],
        "tavern hall, dungeon shrines and studies",
        spin=True,
    ),
    "weapon-rack": Prop(
        "weapon racks against a wall",
        1, 1, "a rack spans its square and is about a third of a square deep", 1.0,
        [
            ["a rack holding three upright spears: from above, a wooden rail with three spear points", "a rack with two swords and a round shield: the pommels and crossguards on the rail, the shield face-up beside it",
             "a rack with axes and a crossbow: axe heads and the crossbow lying on top of the rail", "a broken, half-empty rack: a cracked rail and one fallen sword on the floor beside it"],
        ],
        "dungeon barracks and guard rooms",
        anchor="back", facing=WALL_BACK,
    ),
    # Containers --------------------------------------------------------------------------------
    "crate": Prop(
        "wooden crates",
        1, 1, "a crate takes most of its square", 0.8,
        [
            ["a closed crate with plank lid and corner battens", "an open crate with straw and red apples",
             "two small crates stacked slightly offset", "a broken crate with spilled straw"],
            ["a crate with iron corner plates", "a crate full of bottles packed in straw",
             "a crate with a canvas tarp tied over it", "a small open crate of carrots and onions"],
        ],
        "tavern storerooms and cellars, dungeon stores",
        spin=True,
    ),
    "barrel": Prop(
        "barrels",
        1, 1, "a barrel is about three quarters of a square across", 0.75,
        [
            ["a closed barrel with a round lid and iron hoops", "an open barrel of dark water",
             "an open barrel full of apples", "a barrel lying on its side"],
            ["a dark-stained wine barrel with a tap", "an open barrel of arrows",
             "a burst barrel with broken staves", "a small keg with brass hoops"],
        ],
        "taverns, dungeon stores, camps",
        spin=True,
    ),
    "sack": Prop(
        "sacks",
        1, 1, "a sack takes about two thirds of its square", 0.65,
        [
            ["a tied burlap sack: from above, a round bulging top gathered into a knot at the centre", "an open sack of grain", "a spilled sack of white flour",
             "two tied sacks side by side: from above, two round bulging tops"],
            ["a sack of potatoes", "a sack of coal", "a rolled bundle of cloth tied with rope", "a small tied sack of salt: from above, a round top gathered at the centre"],
        ],
        "tavern kitchens and storerooms, camps",
        spin=True,
    ),
    "chest": Prop(
        "chests",
        1, 1, "a chest is about three quarters of a square wide and half a square deep", 0.75,
        [
            ["an iron-banded wooden chest with a flat lid", "an open chest with gold coins: from above, the inside full of coins, the open lid lying flat behind it",
             "a small ornate chest with brass corners", "an old rotten chest with a broken lid"],
            ["an open treasure chest with gems and a goblet: from above, the inside, the open lid lying flat behind it", "a plain pine travel trunk",
             "a heavy iron strongbox", "a chest wrapped in chains with a padlock"],
        ],
        "tavern bedrooms, dungeon treasuries",
        facing="Each chest is seen from directly above: a rectangular box with straight sides and a flat lid, the lock clasp at the middle of its bottom edge; never a rounded or barrel-shaped lid, and the front face is not visible.",
    ),
    "urn": Prop(
        "urns and pots",
        1, 1, "an urn takes a little over half of its square", 0.6,
        [
            ["a clay amphora seen from above, round mouth and body", "a tipped, broken urn with shards",
             "a bronze funerary urn: from above, its round lid with a knob and its two handles at the sides", "a cluster of three small clay pots"],
        ],
        "crypts and dungeon stores",
        spin=True,
    ),
    "coins": Prop(
        "coin piles",
        1, 1, "a pile takes a little over half of its square", 0.6,
        [
            ["a small pile of gold coins", "scattered silver and copper coins", "an open leather pouch spilling coins",
             "a few stacks of coins with a red gem"],
        ],
        "treasuries, caves and lairs",
        spin=True,
    ),
    "cauldron": Prop(
        "cauldrons",
        1, 1, "a cauldron takes about two thirds of its square", 0.7,
        [
            ["an iron cauldron with a bubbling green brew", "a cauldron of stew over glowing embers",
             "an empty rusty cauldron", "a cauldron with a glowing purple potion"],
        ],
        "kitchens, witch huts, dungeon labs",
        spin=True,
    ),
    # Dungeon -----------------------------------------------------------------------------------
    "altar": Prop(
        "altars",
        2, 1, "an altar fills its 2 by 1 squares", 1.0,
        [
            ["a stone altar with a red cloth and two candles", "a dark stone altar with a bronze bowl and a dagger",
             "a white marble altar with gold trim", "a rough rock altar with offerings of fruit and flowers"],
        ],
        "dungeon shrines and crypts",
        anchor="back", facing="Each altar lies horizontally against a wall: its back runs along the top edge.",
    ),
    "statue": Prop(
        "stone statues on plinths, seen from above",
        1, 1, "a statue and its plinth take most of its square", 0.8,
        [
            ["a knight statue on a square plinth: from above, the helmet, the shoulders and the sword's pommel", "a robed figure statue on a round plinth: from above, a hooded head and the robe's shoulders",
             "a broken statue: only the legs remain on the plinth", "a winged gargoyle statue on a plinth: from above, its head, its back and its spread wings"],
        ],
        "dungeon halls and shrines",
        facing="Each statue faces the bottom of the image, seen from directly above: the top of its head and its shoulders, never its face.",
    ),
    "pillar": Prop(
        "stone pillars seen from above",
        1, 1, "a pillar takes about three quarters of its square", 0.75,
        [
            ["a round stone column top", "a square stone pillar with a carved capital",
             "a broken pillar stump with rubble", "a round pillar wrapped in ivy"],
            ["a fluted marble column: from above, its round top with the flutes as a scalloped edge", "a cracked sandstone pillar: its square top with cracks", "a dark basalt pillar: its hexagonal top", "a pillar with an iron torch ring: its top, with the ring at one side"],
        ],
        "dungeon halls and crypts",
        spin=True,
    ),
    "sarcophagus": Prop(
        "sarcophagi",
        1, 2, "a sarcophagus fills its 1 by 2 squares", 0.95,
        [
            ["a stone lid carved with a knight effigy", "a plain stone sarcophagus",
             "an open sarcophagus with its lid slid aside", "a mossy, cracked sarcophagus"],
        ],
        "crypts",
        facing="The head end of each sarcophagus is at the top.",
    ),
    "bones": Prop(
        "bone piles",
        1, 1, "bones take most of their square", 0.8,
        [
            ["a skeleton lying on its back", "scattered loose bones", "a pile of skulls and bones",
             "a rib cage and a skull"],
            ["a horned beast skull", "bones tangled in old cobweb", "a few small bones",
             "a skeleton in rusty armour"],
        ],
        "crypts, caves and lairs",
        spin=True,
    ),
    "rubble": Prop(
        "rubble piles",
        1, 1, "rubble takes most of its square", 0.85,
        [
            ["a small pile of rubble", "broken masonry blocks", "a fallen beam with stones", "gravel and dust"],
            ["a collapsed bit of wall", "rubble with a broken shield", "sandstone rubble", "mossy rubble"],
        ],
        "ruined rooms, caves",
        spin=True,
    ),
    "web": Prop(
        "corner cobwebs",
        1, 1, "a web fills its square", 1.0,
        [
            ["a dense web filling the top-left corner", "a large round web", "a torn, sagging web",
             "a web with a wrapped cocoon"],
        ],
        "dungeon corners, caves",
        facing="Each web is anchored in the top-left corner of its space.",
    ),
    "trapdoor": Prop(
        "trapdoors",
        1, 1, "a trapdoor takes most of its square", 0.85,
        [
            ["a wooden trapdoor with an iron ring", "a square iron grate", "an open trapdoor showing a ladder going down",
             "a stone slab with an iron ring"],
        ],
        "tavern cellars, dungeon floors",
    ),
    "lever": Prop(
        "wall levers",
        1, 1, "a lever takes about half of its square, against the wall", 0.5,
        [
            ["an iron lever pulled up", "an iron lever pushed down", "a wooden lever in a bracket",
             "a chain pull with a handle"],
        ],
        "dungeon puzzles",
        anchor="back", facing=WALL_BACK,
    ),
    # Nature ------------------------------------------------------------------------------------
    "rock": Prop(
        "rocks",
        1, 1, "a rock takes about three quarters of its square", 0.75,
        [
            ["a grey boulder", "a mossy rock", "a cluster of small rocks", "a flat stone"],
            ["a sandstone rock", "a dark volcanic rock", "a rock with yellow lichen", "a split rock"],
        ],
        "caves, forests, outside taverns",
        spin=True,
    ),
    "stalagmite": Prop(
        "stalagmites seen from above",
        1, 1, "a stalagmite takes about two thirds of its square", 0.7,
        [
            ["a single stalagmite: from above, ringed layers narrowing to its tip at the centre, like a contour map", "three stalagmites close together: three tips, each ringed by its layers", "a broken stalagmite stump: its flat broken top",
             "a stalagmite tipped with pale crystals: the crystal tips at its centre"],
            ["a tall pale limestone stalagmite", "a wet, dark stalagmite", "a pair of joined stalagmites",
             "a small stalagmite with moss"],
        ],
        "caves",
        spin=True,
    ),
    "mushrooms": Prop(
        "mushroom clusters",
        1, 1, "a cluster takes about two thirds of its square", 0.7,
        [
            ["brown cave mushrooms: round brown caps overlapping", "softly glowing blue cave mushrooms: round blue caps overlapping", "red toadstools: round red caps with white spots",
             "shelf fungus growing on a stone"],
            ["pale mushrooms: round pale caps overlapping", "purple mushrooms", "a ring of tiny mushrooms", "a giant flat-capped mushroom"],
        ],
        "caves and forests",
        spin=True,
    ),
    "bush": Prop(
        "bushes",
        1, 1, "a bush nearly fills its square", 0.9,
        [
            ["a round green bush", "a berry bush with red berries", "a flowering bush", "a dry thorny bush"],
            ["a fern", "a holly bush", "a dark leafy shrub", "an orange autumn bush"],
        ],
        "forests and around taverns",
        spin=True,
    ),
    "tree": Prop(
        "tree crowns seen from above",
        2, 2, "a crown fills its 2 by 2 squares", 1.0,
        [
            ["a leafy oak crown", "a star-shaped pine crown", "a light green birch crown",
             "a dead tree: bare branches seen from above"],
            ["an orange autumn maple", "a drooping willow", "a fruit tree with apples", "a dark old yew"],
        ],
        "forests",
        spin=True,
    ),
    "stump": Prop(
        "tree stumps",
        1, 1, "a stump takes a little over half of its square", 0.6,
        [
            ["a cut stump with growth rings", "a mossy stump", "a stump with an axe stuck in it", "a rotten hollow stump"],
        ],
        "forests and camps",
        spin=True,
    ),
    "log": Prop(
        "fallen logs",
        2, 1, "a log fills its 2 by 1 squares", 1.0,
        [
            ["a fallen log", "a mossy log", "a log with broken branches", "two logs side by side"],
        ],
        "forests and camps",
        facing="Each log lies horizontally.",
    ),
    "flowers": Prop(
        "flower patches",
        1, 1, "a patch takes most of its square", 0.8,
        [
            ["mixed wildflowers", "red poppies", "blue cornflowers", "white daisies"],
            ["yellow buttercups", "purple heather", "foxgloves", "a patch of clover with tiny flowers"],
        ],
        "forests and meadows",
        spin=True,
    ),
    # Light sources -----------------------------------------------------------------------------
    "campfire": Prop(
        "campfires",
        1, 1, "a campfire takes about three quarters of its square", 0.75,
        [
            ["a ring of stones around burning logs", "glowing embers in a stone ring", "a campfire with a cooking spit",
             "a cold campfire with grey ash"],
        ],
        "camps, caves, forests",
        halo=1.5, spin=True,
    ),
    "brazier": Prop(
        "braziers",
        1, 1, "a brazier takes a little over half of its square", 0.6,
        [
            ["an iron brazier full of glowing coals", "a bronze tripod brazier", "an unlit brazier with cold coals",
             "a brazier with blue magical fire"],
        ],
        "dungeon shrines and halls",
        halo=1.2, spin=True,
    ),
    "candles": Prop(
        "candle groups",
        1, 1, "candles take about half of their square", 0.5,
        [
            ["three candles on an iron dish", "a brass candelabra with five candles", "a cluster of melted candles",
             "a single candle in a holder"],
        ],
        "shrines, libraries, crypts",
        halo=0.8, spin=True,
    ),
    "torch": Prop(
        "wall torches",
        1, 1, "a torch and its bracket take about half of its square, against the wall", 0.75,
        [
            ["an iron wall sconce with a burning torch", "an unlit torch in a sconce", "a lantern on a wall hook",
             "a torch with a blue flame"],
        ],
        "dungeon walls",
        anchor="back", facing=WALL_BACK, halo=1.1,
    ),
    "hearth": Prop(
        "hearths against a wall",
        2, 1, "a hearth fills its 2 by 1 squares", 1.0,
        [
            ["a stone hearth with burning logs: from above, logs and embers in the fire pit", "a hearth with a cooking pot over embers: the pot seen from above, its rim and contents", "a cold hearth with ash",
             "a domed brick bread oven: from above, a round brick dome against the wall, its mouth only a dark crescent on the front edge"],
        ],
        "tavern hall and kitchen",
        anchor="back", facing="Each hearth lies horizontally against a wall, seen from directly above: the chimney breast is a stone block along the top edge, and in front of it the hearth slab with the fire pit open to the sky; no arch and no front face.",
        halo=1.2,
    ),
    # Structures --------------------------------------------------------------------------------
    "stairs": Prop(
        "staircases",
        1, 1, "a staircase fills its square", 1.0,
        [
            ["stone stairs going down into darkness", "wooden stairs going up", "the top of a stone spiral stair",
             "a ladder going down a square hole"],
        ],
        "tavern and dungeon exits",
        facing="The top step of each staircase is at the top edge.",
    ),
    "well": Prop(
        "wells",
        1, 1, "a well takes most of its square", 0.85,
        [
            ["a round stone well with dark water", "a well with a wooden crank frame", "a dry, broken well",
             "a well with a bucket on its rim"],
        ],
        "villages, outside taverns",
        spin=True,
    ),
    "bridge": Prop(
        "bridges",
        2, 2, "a bridge fills its 2 by 2 squares", 1.0,
        [
            ["a wooden plank bridge running from top to bottom with rope rails", "a stone arch bridge",
             "a broken wooden bridge with missing planks", "a bridge of two lashed logs"],
        ],
        "forests and rivers",
        facing="Each bridge runs from the top edge to the bottom edge.",
    ),
    "cart": Prop(
        "carts",
        2, 1, "a cart fills its 2 by 1 squares", 1.0,
        [
            ["a wooden handcart", "a cart loaded with hay", "a cart with barrels", "a broken cart missing a wheel"],
        ],
        "outside taverns, roads, camps",
        facing="Each cart lies horizontally with its handles to the right.",
    ),
    "tent": Prop(
        "tents seen from above",
        2, 2, "a tent fills its 2 by 2 squares", 1.0,
        [
            ["a cream canvas tent", "a red-and-cream striped tent", "a leather hide tent", "a collapsed tent"],
        ],
        "camps",
        facing="Each tent is seen from directly above: the roof canvas with its ridge line, the entrance only as a flap on the bottom edge.",
    ),
    "fountain": Prop(
        "fountains",
        2, 2, "a fountain fills its 2 by 2 squares", 1.0,
        [
            ["a round stone fountain with clear water", "a square fountain", "a dry, broken fountain",
             "an ornate fountain with a statue in the middle"],
        ],
        "villages and courtyards",
        spin=True,
    ),
}

# New props for the library: more variety for generated maps once Rytta places them.
NEW = dict(library="new", priority=3, second_priority=3)
PROPS.update({
    "stool": Prop("stools", 1, 1, "a stool takes about a third of its square", 0.4,
                  [["a round three-legged stool", "a square stool", "a stool with a cushion", "a tall bar stool"]],
                  "tavern bar and hall", spin=True, **NEW),
    "bench": Prop("benches", 2, 1, "a bench fills the length of its 2 by 1 squares and half its depth", 1.0,
                  [["a plain plank bench", "a carved pew: from above, the seat planks and the carved top rail of its back along the top edge", "a log bench", "a bench with a folded blanket"]],
                  "tavern hall, chapels, camps", facing="Each bench lies horizontally, seen from directly above.", **NEW),
    "wardrobe": Prop("wardrobes against a wall", 2, 1, "a wardrobe fills the width of its 2 by 1 squares", 1.0,
                     [["a dark oak wardrobe, doors closed: from above, its flat moulded top", "a wardrobe with one door open: from above, its top and the open door as a thin board swung out, clothes on hangers seen from above",
                       "a painted wardrobe: its flat top painted with flowers", "a broken wardrobe: a cracked top with a missing corner"]], "bedrooms", anchor="back", facing=WALL_BACK, **NEW),
    "desk": Prop("writing desks against a wall", 2, 1, "a desk fills its 2 by 1 squares", 1.0,
                 [["a desk with papers, quill and inkwell", "a desk with an open book and a candle",
                   "a cluttered alchemist's desk with flasks", "a tidy desk with a map and compass"]],
                 "studies, libraries, captain's rooms", anchor="back", facing=WALL_BACK, **NEW),
    "throne": Prop("thrones", 1, 1, "a throne nearly fills its square", 0.9,
                   [["a gilded throne with red cushions", "a stone throne", "a throne of bones and antlers: from above, the antlers spread along its top rail",
                     "a carved wooden chieftain's seat"]], "throne rooms, lairs",
                   facing="Each throne is seen from directly above: the high back is a thick top rail along the top edge, the seat cushion and the armrests below it.", **NEW),
    "bathtub": Prop("bathtubs", 1, 2, "a tub fills its 1 by 2 squares", 0.95,
                    [["a wooden tub with steaming water", "a copper tub", "an empty stone basin", "a tub with soap and a brush"]],
                    "bathhouses, noble rooms", **NEW),
    "kitchen-counter": Prop("kitchen counters against a wall", 2, 1, "a counter fills its 2 by 1 squares", 1.0,
                            [["a counter with a cutting board and vegetables", "a counter with pots and ladles",
                              "a counter with dough and flour", "a counter with fish and a cleaver"]],
                            "tavern kitchens", anchor="back", facing=WALL_BACK, **NEW),
    "oven": Prop("stone ovens against a wall", 1, 1, "an oven fills its square", 0.95,
                 [["a stone oven with glowing coals: from above, a round stone dome with a glow at its mouth on the front edge", "a brick oven with bread: a brick dome, loaves on a board at its mouth", "a cold oven: a soot-darkened dome", "an iron stove with a kettle: the stove top and the kettle seen from above"]],
                 "tavern kitchens, bakeries", anchor="back", facing=WALL_BACK, halo=0.9, **NEW),
    "keg-rack": Prop("keg racks against a wall", 2, 1, "a rack fills its 2 by 1 squares", 1.0,
                     [["a rack holding three kegs: from above, three kegs lying side by side as long cylinders with iron hoops", "a rack with two big casks: two long casks lying side by side", "a half-empty rack: one keg and an empty wooden cradle", "a rack with wine bottles: rows of bottle necks and corks seen from above"]],
                     "tavern bars and cellars", anchor="back", facing=WALL_BACK, **NEW),
    "hay-bale": Prop("hay bales", 1, 1, "a bale takes most of its square", 0.85,
                     [["a square hay bale", "a round hay bale", "a loose pile of hay", "two stacked small bales"]],
                     "stables, barns, farms", spin=True, **NEW),
    "firewood": Prop("firewood piles", 1, 1, "a pile takes most of its square", 0.8,
                     [["a neat stack of split logs: from above, logs lying side by side", "a loose pile of branches", "logs in a basket", "a chopping block with an axe"]],
                     "kitchens, camps, cabins", spin=True, **NEW),
    "workbench": Prop("workbenches against a wall", 2, 1, "a bench fills its 2 by 1 squares", 1.0,
                      [["a carpenter's bench with tools", "a leatherworker's bench", "a tinkerer's bench with gears",
                        "a bench with a vice and iron scraps"]], "workshops", anchor="back", facing=WALL_BACK, **NEW),
    "anvil": Prop("anvils", 1, 1, "an anvil on its block takes about half of its square", 0.55,
                  [["an anvil on a wooden block", "an anvil with a hammer and tongs", "a small rusty anvil",
                    "an anvil with a glowing horseshoe"]], "smithies", **NEW),
    "forge": Prop("smithing forges", 2, 2, "a forge fills its 2 by 2 squares", 1.0,
                  [["a stone forge: from above, the glowing coal bed with the bellows beside it", "a brick forge: the chimney hood as a square block over part of the hearth",
                    "a cold forge: grey ash in the coal bed", "a dwarven forge with a channel of molten metal"]], "smithies, dwarven halls",
                  halo=1.4, **NEW),
    "loom": Prop("weaving looms", 2, 1, "a loom fills its 2 by 1 squares", 1.0,
                 [["a loom with red cloth", "a loom with blue cloth", "an empty loom", "a loom with half-woven tapestry"]],
                 "houses, workshops", facing="Each loom lies horizontally.", **NEW),
    "spinning-wheel": Prop("spinning wheels", 1, 1, "a wheel takes most of its square", 0.8,
                           [["a wooden spinning wheel with wool", "a spinning wheel with flax", "an old cracked wheel",
                             "a spinning wheel with a basket of yarn"]], "houses", **NEW),
    "training-dummy": Prop("training dummies", 1, 1, "a dummy takes about half of its square", 0.55,
                           [["a straw dummy on a post", "a wooden dummy with arms", "a dummy with a dented helmet",
                             "a broken dummy"]], "barracks, yards", **NEW),
    "archery-target": Prop("archery targets", 1, 1, "a target takes most of its square", 0.8,
                           [["a straw target with arrows: from above, the round straw boss standing on its edge as a thick bar, arrow fletchings sticking out of its front", "a painted wooden target", "a target on its wooden A-frame stand, seen from above", "a worn target"]],
                           "yards, barracks", **NEW),
    "banner": Prop("wall banners", 1, 1, "a banner spans its square along the wall", 1.0,
                   [["a red banner with a gold border: from above, the pole along the wall and the cloth as a narrow red strip with a gold edge", "a blue banner: the pole and a narrow blue strip of cloth", "a torn black banner: the pole and a ragged black strip", "a green banner: the pole and a narrow green strip with a gold fringe"]],
                   "halls, throne rooms", anchor="back", facing=WALL_BACK, **NEW),
    "cage": Prop("iron cages", 1, 1, "a cage fills its square", 0.9,
                 [["an empty iron cage", "a cage with straw and a bowl", "a hanging cage seen from above",
                   "a broken cage with bent bars"]], "prisons, lairs", spin=True, **NEW),
    "chains": Prop("wall chains and shackles", 1, 1, "chains hang along the wall and take about half of its square", 0.6,
                   [["shackles on a short chain: an iron ring at the wall, the chain and the open shackles lying on the floor", "a long chain coiled on the floor", "a rusty manacle lying on the floor by its wall ring", "chains with a broken lock lying on the floor"]],
                   "prisons, dungeon cells", anchor="back", facing=WALL_BACK, **NEW),
    "skull-pile": Prop("skull piles", 1, 1, "a pile takes most of its square", 0.8,
                       [["a pile of human skulls", "skulls with melted candles", "skulls and old helmets", "a few skulls in dust"]],
                       "crypts, lairs, ossuaries", spin=True, **NEW),
    "treasure-hoard": Prop("treasure hoards", 2, 2, "a hoard fills its 2 by 2 squares", 1.0,
                           [["a heap of gold coins with goblets", "coins, gems and a crown", "a hoard with a sword and shield",
                             "a small scattered hoard"]], "dragon lairs, vaults", spin=True, **NEW),
    "weapon-pile": Prop("weapon piles", 1, 1, "a pile takes most of its square", 0.8,
                        [["a pile of rusty swords", "spears and shields", "broken arrows and bows", "axes and maces"]],
                        "armouries, battlefields", spin=True, **NEW),
    "armor-stand": Prop("armour stands", 1, 1, "a stand takes about two thirds of its square", 0.7,
                        [["a plate armour on a stand", "chainmail on a stand", "leather armour on a stand", "an empty stand"]],
                        "armouries, noble halls", facing="Each stand faces the bottom of the image.", **NEW),
    "fallen-pillar": Prop("fallen pillars", 2, 1, "a fallen pillar fills its 2 by 1 squares", 1.0,
                          [["a toppled round column in pieces", "a fallen square pillar", "a broken marble column",
                            "a mossy fallen pillar"]], "ruins", facing="Each one lies horizontally.", **NEW),
    "spike-trap": Prop("spike traps", 1, 1, "a trap fills its square", 0.95,
                       [["iron spikes rising from floor holes", "a pit with sharpened stakes", "a plate with retracted spikes",
                         "rusty floor spikes"]], "dungeon traps", **NEW),
    "pressure-plate": Prop("pressure plates", 1, 1, "a plate takes most of its square", 0.8,
                           [["a square stone pressure plate", "a slightly sunken plate", "a plate with a carved border",
                             "a cracked plate"]], "dungeon traps", **NEW),
    "crystal-cluster": Prop("crystal clusters", 1, 1, "a cluster takes about two thirds of its square", 0.7,
                            [["pale blue crystals", "violet amethyst crystals", "glowing green crystals", "white quartz crystals"]],
                            "caves", spin=True, **NEW),
    "coffin": Prop("wooden coffins", 1, 2, "a coffin fills its 1 by 2 squares", 0.95,
                   [["a closed plain coffin", "an open empty coffin", "a coffin with iron bands", "a broken coffin"]],
                   "crypts, graveyards", facing="The head end of each coffin is at the top.", **NEW),
    "gravestone": Prop("gravestones seen from above", 1, 1, "a grave takes most of its square", 0.85,
                       [["a rounded headstone with a grassy mound", "a stone cross", "a sunken old grave", "a fresh dirt grave"]],
                       "graveyards", facing="The headstone of each grave is at the top.", **NEW),
    "obelisk": Prop("obelisks", 1, 1, "an obelisk takes about half of its square", 0.55,
                    [["a black stone obelisk", "a sandstone obelisk", "a cracked obelisk", "an obelisk with carved bands"]],
                    "ruins, deserts, shrines", spin=True, **NEW),
    "idol": Prop("idols", 1, 1, "an idol takes about two thirds of its square", 0.7,
                 [["a squat stone idol", "a golden idol on a pedestal", "a wooden totem pole: from above, its carved top with outspread wings", "a horned idol: from above, its head with the horns spread"]],
                 "shrines, jungles, lairs", facing="Each idol faces the bottom of the image, seen from directly above: the top of its head and its shoulders, never its face.", **NEW),
    "pit": Prop("pits", 1, 1, "a pit fills its square", 0.95,
                [["a dark round pit", "a square pit with stone edges", "a pit covered with a broken grate",
                  "a collapsed hole in the floor"]], "dungeon traps, caves", **NEW),
    "boulder": Prop("large boulders", 2, 2, "a boulder fills its 2 by 2 squares", 1.0,
                    [["a large grey boulder", "a mossy boulder", "a cracked boulder", "a pile of large stones"]],
                    "forests, caves, mountains", spin=True, **NEW),
    "reeds": Prop("reed clumps", 1, 1, "reeds take most of their square", 0.85,
                  [["green reeds", "brown cattails", "reeds in shallow water", "dry reeds"]], "rivers, swamps", spin=True, **NEW),
    "lily-pads": Prop("lily pads on water", 1, 1, "lily pads take most of their square", 0.85,
                      [["lily pads with a white flower", "a few lily pads", "lily pads with a pink flower", "duckweed patch"]],
                      "ponds, swamps", spin=True, **NEW),
    "standing-stone": Prop("standing stones", 1, 1, "a stone takes about half of its square", 0.55,
                           [["a tall grey standing stone", "a leaning mossy stone", "a stone with spiral carvings", "a broken stone"]],
                           "moors, stone circles", spin=True, **NEW),
    "cactus": Prop("cacti", 1, 1, "a cactus takes about half of its square", 0.6,
                   [["a round barrel cactus", "a branching cactus", "a flowering cactus", "a cluster of small cacti"]],
                   "deserts", spin=True, **NEW),
    "dune-grass": Prop("dune grass tufts", 1, 1, "a tuft takes most of its square", 0.8,
                       [["pale dune grass", "dry desert scrub", "spiky grass", "grass with small yellow flowers"]],
                       "deserts, beaches", spin=True, **NEW),
    "mushroom-ring": Prop("fairy rings of mushrooms", 2, 2, "a ring fills its 2 by 2 squares", 1.0,
                          [["a ring of white mushrooms", "a ring of red toadstools", "a ring of glowing mushrooms",
                            "a broken ring in tall grass"]], "forests", spin=True, **NEW),
    "bedroll": Prop("bedrolls", 1, 2, "a bedroll fills its 1 by 2 squares", 0.9,
                    [["a green bedroll with a pack", "a brown fur bedroll", "a rolled-up bedroll", "a blanket bedroll"]],
                    "camps", facing="The head end of each bedroll is at the top.", **NEW),
    "wagon": Prop("covered wagons", 2, 3, "a wagon fills its 2 by 3 squares", 1.0,
                  [["a covered wagon with a cream canvas", "a merchant wagon with crates", "an open wagon with hay",
                    "a broken wagon"]], "roads, camps", facing="Each wagon points to the top of the image.", **NEW),
    "rowboat": Prop("rowboats", 1, 2, "a boat fills its 1 by 2 squares", 0.95,
                    [["a wooden rowboat with oars", "a rowboat with nets", "an old leaky rowboat", "a painted rowboat"]],
                    "docks, rivers", facing="The bow of each boat points to the top.", **NEW),
    "signpost": Prop("signposts", 1, 1, "a signpost takes about half of its square", 0.85,
                     [["a wooden signpost with three blank arrows", "a leaning signpost", "a stone waymarker", "a broken signpost"]],
                     "roads, crossroads", **NEW),
    "fence": Prop("wooden fence sections", 2, 1, "a fence spans its 2 squares and is thin", 1.0,
                  [["a split-rail fence: from above, post tops joined by rails", "a picket fence: a row of small square picket tops along a rail", "a wattle fence: a woven band seen from above", "a broken fence: posts with a gap and a fallen rail"]], "farms, villages",
                  facing="Each fence section lies horizontally, seen from directly above, as thin as a line.", **NEW),
    "lantern-post": Prop("lantern posts", 1, 1, "a post and lantern take about half of its square", 0.85,
                         [["an iron post with a lit lantern", "a wooden post with a lantern", "an unlit lantern post",
                           "a crooked post with a lantern"]], "streets, docks", halo=1.1, spin=True, **NEW),
    "market-stall": Prop("market stalls", 2, 2, "a stall fills its 2 by 2 squares", 1.0,
                         [["a stall with a striped awning and fruit", "a stall with cloth bolts", "a stall with pots",
                           "a fish stall"]], "villages, markets",
                         facing="Each stall is seen from directly above: its awning is a flat rectangle of canvas over the back half, and the top of its counter with the goods fills the front half; no hanging valance and no front of the counter.",
                         above="the flat awning and the counter top with its goods; never the front of the stall", **NEW),
})

# ---------------------------------------------------------------------------------------------
# Floors, walls, decals and effects.

FLOORS = [
    # slug, priority, used in, description
    ("flagstone-grey", 1, "dungeon rooms", "large grey flagstones of varied sizes (most about one square, some smaller), irregular joints that never line up in a grid, worn edges, thin dark mortar"),
    ("flagstone-grey-worn", 1, "dungeon rooms", "grey flagstones like a dungeon floor, cracked and chipped, with grit in the joints and a few dark stains"),
    ("crypt-slabs", 1, "crypts", "large blue-grey stone slabs about one by one and a half squares in staggered courses, fine joints, a few faint carved border lines"),
    ("crypt-slabs-mossy", 1, "crypts", "blue-grey crypt slabs with moss and lichen in the joints and damp patches"),
    ("cave-rock", 1, "caves", "uneven natural rock floor, grey-brown stone with ridges, cracks and loose grit"),
    ("cave-rock-damp", 1, "caves", "dark damp cave rock with a wet sheen, small puddles and mineral streaks"),
    ("grass-lush", 1, "forests, outside taverns", "short lush green grass with subtle clumps and a little clover"),
    ("forest-floor", 1, "forests", "grass mixed with fallen leaves, twigs, pine needles and moss"),
    ("dirt-trail", 1, "forest trails, roads", "packed brown earth with small pebbles and faint footprints"),
    ("planks-oak", 1, "tavern hall", "warm honey-brown oak floorboards running left to right, boards about a third of a square wide and of varied lengths with staggered joints, nail heads, worn"),
    ("planks-oak-dark", 1, "tavern rooms", "dark walnut floorboards running left to right, varied lengths, scuffs and a few knots"),
    ("kitchen-flagstone", 1, "tavern kitchens", "small warm sandstone flagstones with irregular joints and a few grease stains"),
    ("cellar-earth", 1, "tavern cellars and storerooms", "packed earth floor with scattered straw and a few stones"),
    ("cobblestone", 1, "yards, streets", "rounded grey cobblestones of mixed sizes with soil between them"),
    ("flagstone-mossy", 2, "ruins, crypts", "old grey flagstones overgrown with moss and grass in the joints"),
    ("marble-white", 2, "temples, palaces", "polished white marble tiles with soft grey veins, large square tiles about one square"),
    ("marble-checker", 2, "palaces, guild halls", "black and white checkered marble, each tile one square"),
    ("sandstone-tiles", 2, "desert temples", "worn sandstone tiles with sand in the joints"),
    ("hex-tiles", 2, "dwarven halls", "dark grey hexagonal stone tiles about half a square across"),
    ("brick-herringbone", 2, "courtyards, kitchens", "red brick floor in a herringbone pattern, bricks about a quarter of a square long"),
    ("brick-running", 2, "workshops, cellars", "worn red brick floor in a running bond, with chipped bricks"),
    ("slate", 2, "manors, towers", "dark blue-grey slate slabs of varied sizes"),
    ("parquet-herringbone", 2, "manors, libraries", "polished oak parquet in a herringbone pattern"),
    ("parquet-chevron", 2, "noble rooms", "warm wood parquet in a chevron pattern, two wood tones"),
    ("ship-deck", 2, "ships, docks", "weathered grey ship deck planks running left to right, with tar lines"),
    ("barn-boards", 2, "barns, stables", "rough wide barn boards with scattered straw"),
    ("mosaic", 2, "temples, bathhouses", "small square stone tesserae in muted ochre, cream and teal, an all-over pattern with no central motif"),
    ("obsidian", 2, "volcanic lairs", "glossy black volcanic rock with faint red cracks"),
    ("terracotta", 2, "kitchens, southern houses", "terracotta tiles, square, slightly uneven"),
    ("wood-rough", 2, "cabins, camps", "rough split log floor, planks of uneven width"),
    ("dirt", 2, "camps, farms", "plain brown dirt with small stones"),
    ("mud", 2, "swamps, roads", "wet dark mud with puddles and ruts"),
    ("gravel", 2, "paths, quarries", "grey gravel with small stones"),
    ("sand-beach", 2, "beaches", "pale beach sand with tiny shells"),
    ("sand-desert", 2, "deserts", "golden desert sand with soft wind ripples"),
    ("sand-red", 2, "badlands", "red desert sand with small pebbles"),
    ("grass-dry", 2, "plains, late summer", "dry yellow-green grass"),
    ("meadow", 2, "meadows", "green grass with scattered small wildflowers"),
    ("moss", 2, "ancient forests", "thick soft green moss"),
    ("swamp", 2, "swamps", "boggy ground with dark water pools and reeds"),
    ("autumn-leaves", 2, "autumn forests", "ground covered in orange, red and brown fallen leaves"),
    ("snow", 2, "winter", "fresh snow with soft drifts"),
    ("ice", 2, "frozen lakes and caves", "pale blue ice with white cracks"),
    ("ash", 2, "burned ground", "grey ash and charred earth with embers going out"),
    ("straw", 2, "stables", "a floor covered in loose straw"),
    ("water-shallow", 2, "streams, flooded rooms", "clear shallow water over pebbles"),
    ("water-deep", 2, "lakes, rivers", "deep dark blue-green water with soft ripples"),
    ("lava", 2, "volcanic lairs", "glowing orange lava with dark crusted plates"),
    ("carpet-red", 2, "throne rooms", "a deep red woven carpet with a subtle all-over pattern"),
    ("cave-crystal", 2, "crystal caves", "dark cave rock with veins of pale glowing crystal"),
]

WALLS = [
    ("wall-dungeon-stone", 1, "dungeon walls", "rough grey stone blocks of varied lengths in courses, the tops of the stones, chips and dark mortar"),
    ("wall-crypt-ashlar", 1, "crypt walls", "smooth blue-grey dressed stone blocks in neat courses"),
    ("wall-cave-rock", 1, "cave walls", "a mass of dark natural rock with ridges and cracks"),
    ("wall-tavern-stone", 1, "tavern walls", "warm grey fieldstone blocks of varied sizes with pale mortar"),
    ("wall-brick-red", 2, "town houses", "red brick in a running bond"),
    ("wall-timber-plaster", 2, "village houses", "cream plaster between dark oak timber beams"),
    ("wall-log-palisade", 2, "forts, camps", "the tops of sharpened logs standing side by side: round cut ends with bark"),
    ("wall-wood-planks", 2, "huts, ships", "dark vertical wooden planks"),
    ("wall-ruined", 2, "ruins", "broken, mossy grey stone blocks with gaps"),
    ("wall-sandstone", 2, "desert buildings", "large sandstone blocks"),
    ("wall-ice", 2, "ice caves", "translucent blue ice blocks"),
    ("wall-hedge", 2, "gardens, mazes", "a dense green hedge seen from above"),
    ("wall-cliff", 2, "mountains, ravines", "rocky cliff top with grass tufts"),
    ("wall-obsidian", 2, "volcanic lairs", "black volcanic stone blocks with red seams"),
    ("wall-granite", 2, "castles", "large pale granite blocks"),
    ("wall-adobe", 2, "desert villages", "sun-dried mud brick with straw"),
]

DECALS = [
    # slug, priority, used in, subject, size
    ("cracks", 1, "stone floors", "floor cracks in stone", "about half"),
    ("puddles", 1, "dungeons, caves, roads", "water puddles", "about half"),
    ("moss", 1, "dungeons, ruins, forests", "moss patches", "about half"),
    ("rubble-scatter", 1, "ruins, caves", "scatters of small stones and grit", "about half"),
    ("grass-tufts", 1, "forests, yards", "grass tufts", "about a third"),
    ("leaves", 1, "forests", "scatters of fallen leaves", "about half"),
    ("pebbles", 1, "caves", "clusters of pebbles", "about a third"),
    ("straw", 1, "taverns, stables", "scatters of loose straw", "about half"),
    ("scorch", 2, "battlefields, fire traps", "scorch marks", "about half to one"),
    ("stains-dried", 2, "dungeons, lairs", "old dark dried stains", "about half"),
    ("bones-scatter", 2, "crypts, lairs", "tiny scattered bones", "about a third"),
    ("ale-stains", 2, "taverns", "spilled ale and wine stains on wood", "about a third"),
    ("roots", 2, "caves, ruins", "roots breaking through the floor", "about half"),
    ("snow-drifts", 2, "winter", "small snow drifts", "about half"),
    ("ash-piles", 2, "burned places", "ash piles", "about a third"),
    ("mud-patches", 2, "roads, swamps", "mud patches", "about half"),
    ("sand-drifts", 2, "deserts, ruins", "drifts of sand", "about half"),
    ("flower-patches", 2, "meadows", "small flower patches", "about a third"),
    ("tracks", 2, "trails, snow", "animal and boot tracks", "about half"),
    ("shards", 2, "taverns, ruins", "broken pottery and glass shards", "about a third"),
]

EFFECTS = [
    # slug, blend, description (damage types follow the SRD names)
    ("fire", "screen", "a carpet of low flames and glowing embers over scorched ground"),
    ("cold", "screen", "frost and ice crystals spreading in pale blue feathers"),
    ("acid", "screen", "bubbling lime-green acid pools and drips"),
    ("poison", "screen", "drifting toxic green mist in soft swirls"),
    ("lightning", "screen", "branching blue-white lightning arcs across the ground"),
    ("thunder", "screen", "pale blue concussive ripples with dust"),
    ("necrotic", "multiply", "dark creeping shadow tendrils and withered grey veins"),
    ("radiant", "screen", "golden holy light rays and floating motes"),
    ("force", "screen", "a translucent blue hexagonal force shimmer"),
    ("psychic", "screen", "swirling violet psychic waves and sparks"),
    ("darkness", "multiply", "deep inky darkness in soft clouds"),
    ("fog", "screen", "thick white fog billowing softly"),
    ("web", "screen", "dense sticky white spider webs"),
    ("entangle", "normal", "writhing green vines and roots"),
    ("spikes", "normal", "thorny brambles and sharp wooden spikes"),
    ("grease", "multiply", "slick dark oily puddles"),
]

MAGIC_CIRCLES = [
    "a glowing blue summoning circle of interlocking rings",
    "a golden protective circle with radiating lines",
    "a crimson ritual circle ringed by candle marks",
    "a green druidic circle of leaves and vines",
]

# Pictures saved at their path that the import must not use, with the reason shown in the catalogue.
# Sprite audit 2026-11-08: what each object of these sheets shows from directly above.
ABOVE = {
    "torch": "the iron bracket as a small plate on the edge that touches the wall, and the flame as a round bright core with embers; never an upright tongue of fire or a bracket seen from the front",
    "archery-target": "the boss standing on its edge as a thick round-ended bar on its stand; never the painted face",
    "banner": "the pole along the wall and the hanging cloth as a narrow strip of colour; never the banner's face",
    "bench": "the seat planks and, for a bench with a back, only the top rail of the back",
    "bookshelf": "the long top board of the shelf and, along its front edge, the tops of what it holds",
    "cart": "the cart bed and the handles, with the wheels as narrow rectangles at the sides; never round wheels",
    "chains": "an iron ring at the wall and the chain lying on the floor; never chains hanging down a wall",
    "chair": "the seat and the thin top edge of the backrest; no legs and no backrest seen from the front",
    "chest": "only the lid with its bands, studs and lock clasp; an open chest shows its inside from above",
    "crystal-cluster": "crystal points radiating outward from the centre like a star; never pointing up",
    "fence": "post tops joined by rails, as thin as a line; never posts or pickets standing up",
    "firewood": "logs and branches lying on the floor; never the ends of a stack seen from the front",
    "forge": "the coal bed, the bellows and the chimney as a square, filling its 2 by 2 squares",
    "hearth": "the hearth slab and fire pit filling the 2 by 1 footprint",
    "idol": "the top of the head and the shoulders on the plinth; never the face",
    "keg-rack": "kegs lying on their wooden cradle seen as long cylinders with hoops; never their round ends",
    "mushrooms": "round caps overlapping; no stems",
    "obelisk": "a square base and the pyramid tip as four triangles meeting at the centre",
    "oven": "the round dome or stove top, the mouth only as a dark crescent on the front edge",
    "pillar": "the round or square top and its capital; no shaft and no base",
    "sack": "round bulging tops, tied sacks gathered at the centre; never the side of a sack",
    "spike-trap": "the spike points as small dots with bright tips; never cones in perspective",
    "spinning-wheel": "the wheel seen edge-on as a thin line along its axle, the treadle and the stool beside it",
    "stalagmite": "a round rocky base narrowing to its tip at the centre; never a cone seen from the side",
    "statue": "the top of the head and the shoulders on the plinth",
    "tent": "the roof canvas with its ridge line, the guy ropes and the pegs; no walls and no doorway seen from the front",
    "throne": "the seat cushion, the armrests and the top of the high back; never the back seen from the front",
    "urn": "round mouths, lids and rims",
    "wardrobe": "the flat top of the wardrobe; the doors only as a thin line on the front edge",
    "weapon-rack": "a long narrow wooden rack along the wall with the tops of the weapons in a row",
}
for _key, _text in ABOVE.items():
    PROPS[_key].above = _text
DECAL_ABOVE = {
    "flower-patches": "round flower heads facing up among their leaves; no stems, and spikes such as lavender seen from above as clusters of buds",
    "grass-tufts": "a flat rosette of blades radiating from a darker centre, the way grass looks from a tower; never a fan of blades standing up and no visible base",
    "shards": "flat broken pieces lying on the floor; a cup, jug or goblet shows its round rim or base, never its profile",
}


def decal_above(slug: str) -> str:
    text = DECAL_ABOVE.get(slug)
    return f"\nSeen from directly above, each patch shows only {text}." if text else ""


# Fitting options for single objects of a sheet, by file and position (0 = top left).
OBJECT_EXTRAS: dict[tuple[str, int], dict] = {
    # The unlit torch casts no light: no warm halo around it (UI review RYT-068 round 14).
    ("props/torch-1.png", 1): {"halo": 0.0},
}

# Sheets to generate again (empty since the 2026-11-08 redo). The import leaves out the listed objects
# of a sheet (None: the whole sheet, so Rytta draws the prop; an empty set: it keeps the current
# pictures), and the catalogue shows the sheet as pending with the reason. Example:
# "props/chest-1.png": ({0, 3}, "Redo top left and bottom right: they read as barrels.")
REDO: dict[str, tuple[set[int] | None, str]] = {}

# Pictures that came out wrong, with the reason (none since the shards were redone on 2026-11-08).
REJECTED: dict[str, str] = {}

# ---------------------------------------------------------------------------------------------
# Rows


@dataclass
class Row:
    priority: int
    category: str
    subject: str
    file: str
    aspect: str
    background: str
    layout: str
    contents: str
    blend: str
    used_in: str
    library: str
    prompt: str
    status: str = "pending"
    notes: str = ""
    # For the import, not written to the files:
    props: list[tuple[str, tuple[float, float], dict]] = field(default_factory=list)

    @property
    def path(self) -> str:
        return f"{SOURCE}/{self.file}"


def footprint_words(p: Prop) -> str:
    if (p.w, p.h) == (1, 1):
        return "one 5-foot square (1.5 m)"
    if p.w == p.h:
        return f"{p.w} by {p.h} five-foot squares"
    if p.h > p.w:
        return f"{p.w} square wide and {p.h} squares long, standing vertically"
    return f"{p.w} squares wide and {p.h} square deep, lying horizontally"


def layout_of(p: Prop, count: int) -> tuple[str, str, str, list[tuple[float, float]], list[str]]:
    """Aspect, layout key, layout sentence, centre hints and position words for a sheet."""
    if p.h > p.w and p.h >= 2 and p.w == 1:
        xs = [(i + 0.5) / count for i in range(count)]
        words = ["first from the left", "second from the left", "third from the left", "fourth from the left"]
        return ("Landscape (3:2)", f"row{count}",
                f"{count} objects side by side in one row, evenly spaced, each standing vertically",
                [(x, 0.5) for x in xs], words[:count])
    portrait = p.h > p.w
    hints = [(0.25, 0.25), (0.75, 0.25), (0.25, 0.75), (0.75, 0.75)][:count]
    return ("Portrait (2:3)" if portrait else "Square (1:1)", "grid2x2",
            "a 2 by 2 arrangement, one object in the middle of each quarter of the image",
            hints, ["top left", "top right", "bottom left", "bottom right"][:count])


def prop_prompt(p: Prop, variants: list[str]) -> tuple[str, str, list[tuple[float, float]]]:
    aspect, layout, sentence, hints, words = layout_of(p, len(variants))
    lines = [
        f"Create a {aspect.lower()} sprite sheet of {len(variants)} different {p.name} for a fantasy "
        f"tabletop RPG battle map. Each one is a separate object on a footprint of {footprint_words(p)}; "
        f"at that scale {p.size}.",
        f"Layout: {sentence}. All of them at the same scale, each alone in its own space with wide "
        "empty space around it; nothing touches, overlaps or crosses into its neighbour's space. Do not "
        "draw a grid.",
    ]
    if p.facing:
        lines.append(p.facing)
    for word, text in zip(words, variants):
        lines.append(f"- {word.capitalize()}: {text}.")
    if p.above:
        lines.append(f"Seen from directly above, each one shows only {p.above}.")
    return "\n".join(lines) + "\n\n" + PROP_STYLE, aspect, hints


def pilot_rows() -> list[Row]:
    small = [
        ("table", (0.167, 0.167)), ("table", (0.5, 0.167)), ("chair", (0.833, 0.167)),
        ("barrel", (0.167, 0.5)), ("crate", (0.5, 0.5)), ("sack", (0.833, 0.5)),
        ("chest", (0.167, 0.833)), ("bookshelf", (0.5, 0.82)), ("candles", (0.833, 0.833)),
    ]
    run = {"sizes": [[1, 2], [1, 3], [1, 4], [1, 5]],
           "run": {"cap": 0.24, "end": 0.9, "plain": [0.775, 0.895],
                   "items": [[0.262, 0.415], [0.435, 0.598], [0.614, 0.785]]}}
    # Not used (UI review RYT-066): flames drawn from the side turn sideways on the board, and the chest
    # reads as a barrel. Their props keep the drawn sprite until their catalogue sheets arrive.
    skip = {"skip": True}
    small_extras = {1: skip, 6: skip, 8: skip}
    large = [("bar", (0.14, 0.5), run), ("bed", (0.39, 0.48), {}), ("rug", (0.75, 0.29), {}),
             ("hearth", (0.75, 0.76), skip)]
    note = "Pilot sheet (docs/sprite-art.md, sheet 1 and 2 prompts); made 2026-11-06 with ChatGPT gpt-image (C2PA in the file)."
    return [
        Row(1, "prop", "tavern pilot, 9 props of one square", "tavern-small.png", "Square (1:1)", "transparent",
            "custom", "table, table, chair, barrel, crate, sack, chest, bookshelf, candles", "", "taverns",
            "existing", "See docs/sprite-art.md, Sheet 1.", "imported", note,
            [(n, at, small_extras.get(i, {})) for i, (n, at) in enumerate(small)]),
        Row(1, "prop", "tavern pilot, 4 larger props", "tavern-large.png", "Landscape (3:2)", "transparent",
            "custom", "bar 1x3, bed 1x2, rug 2x2, hearth 2x1", "", "taverns", "existing",
            "See docs/sprite-art.md, Sheet 2.", "imported", note, list(large)),
    ]


def build_rows(imported: set[str] | None = None) -> list[Row]:
    rows = pilot_rows()
    for prop, p in PROPS.items():
        for n, variants in enumerate(p.sheets, start=1):
            prompt, aspect, hints = prop_prompt(p, variants)
            _, layout, *_ = layout_of(p, len(variants))
            rows.append(Row(
                p.priority if n == 1 else p.second_priority, "prop",
                f"{prop} ({len(variants)} variants)", f"props/{prop}-{n}.png", aspect, "transparent", layout,
                f"{prop} {p.w}x{p.h} x{len(variants)}", "", p.used_in, p.library, prompt,
                notes="New prop: Rytta adds it to the library and the generators when imported." if p.library == "new" else "",
                props=[(prop, at, dict(OBJECT_EXTRAS.get((f"props/{prop}-{n}.png", i), {})))
                       for i, at in enumerate(hints)],
            ))
    for slug, priority, used, text in FLOORS:
        rows.append(Row(priority, "floor", slug, f"floors/{slug}.png", "Square (1:1)", "opaque", "tile",
                        "tile 4x4", "", used, "n/a",
                        f"Create a square (1:1) seamless, tileable floor texture: {text}.\n\n{FLOOR_STYLE}"))
    for slug, priority, used, text in WALLS:
        rows.append(Row(priority, "wall", slug, f"walls/{slug}.png", "Square (1:1)", "opaque", "tile",
                        "tile 4x4", "", used, "n/a",
                        "Create a square (1:1) seamless, tileable texture of the top of a thick wall seen from "
                        f"directly above, the way a battle map paints a wall: {text}. Rytta fills its wall bands "
                        f"with it.\n\n{WALL_STYLE}"))
    for slug, priority, used, subject, size in DECALS:
        rows.append(Row(priority, "decal", subject, f"decals/{slug}.png", "Square (1:1)", "transparent", "grid3x3",
                        f"{slug} 1x1 x9", "", used, "n/a",
                        f"Create a square (1:1) sheet of 9 different {subject} for a fantasy tabletop RPG battle map, "
                        "to scatter over floors. Layout: a 3 by 3 arrangement, one in the middle of each ninth of the "
                        "image, with wide empty space around each; nothing touches. Each is "
                        f"{size} of a 5-foot square. They have soft, irregular edges and sit naturally on any floor; "
                        f"thin parts may be partly transparent.{decal_above(slug)}\n\n{PROP_STYLE}",
                        props=[(slug, ((c + 0.5) / 3, (r + 0.5) / 3), {}) for r in range(3) for c in range(3)]))
    for slug, blend, text in EFFECTS:
        rows.append(Row(2, "effect", slug, f"effects/{slug}.png", "Square (1:1)",
                        {"screen": "black", "multiply": "white", "normal": "transparent"}[blend], "tile", "tile 4x4",
                        blend, "spell areas (Area tool), hazards", "n/a",
                        f"Create a square (1:1) seamless, tileable spell effect texture seen from directly above: "
                        f"{text}.\n\n{EFFECT_COMMON}\n{EFFECT_STYLE[blend]}"))
    rows.append(Row(2, "effect", "magic circles (4 variants)", "effects/magic-circles.png", "Square (1:1)", "black",
                    "grid2x2", "magic-circle 2x2 x4", "screen", "shrines, rituals, summoning", "n/a",
                    "Create a square (1:1) sheet of 4 different magic circles for a fantasy tabletop RPG battle map, "
                    "each 2 by 2 five-foot squares, seen from directly above. Layout: a 2 by 2 arrangement, one in "
                    "the middle of each quarter of the image, with empty space around each.\n"
                    + "\n".join(f"- {w}: {t}." for w, t in zip(["Top left", "Top right", "Bottom left", "Bottom right"], MAGIC_CIRCLES))
                    + "\n\nNo letters, runes or text: use geometric marks only. " + EFFECT_STYLE["screen"]))
    for row in rows:
        if row.file in REJECTED:
            row.status, row.notes = "rejected", REJECTED[row.file]
        elif row.status != "imported" and (ROOT / row.path).exists():
            row.status = "imported" if imported and row.file in imported else "generated"
        if row.file in REDO:
            left_out, reason = REDO[row.file]
            row.status, row.notes = "pending", reason
            row.props = [(prop, at, {**extra, "skip": True} if left_out is None or i in left_out else extra)
                         for i, (prop, at, extra) in enumerate(row.props)]
    # Within a priority the categories are interleaved, so floors and walls arrive early enough to
    # try them on maps while the props keep coming.
    totals: dict[tuple[int, str], int] = {}
    for row in rows:
        totals[(row.priority, row.category)] = totals.get((row.priority, row.category), 0) + 1
    seen: dict[tuple[int, str], int] = {}
    keyed = []
    for row in rows:
        k = (row.priority, row.category)
        seen[k] = seen.get(k, 0) + 1
        pilot = row.file in ("tavern-small.png", "tavern-large.png")
        keyed.append((not pilot, row.priority, (seen[k] - 0.5) / totals[k], row.category, row))
    keyed.sort(key=lambda k: k[:4])
    return [k[-1] for k in keyed]


COLUMNS = ["order", "priority", "category", "subject", "file", "path", "aspect", "background", "layout",
           "contents", "blend", "used_in", "library", "status", "prompt", "notes"]


def values(i: int, row: Row) -> list:
    return [i, row.priority, row.category, row.subject, row.file.split("/")[-1], row.path, row.aspect,
            row.background, row.layout, row.contents, row.blend, row.used_in, row.library, row.status,
            row.prompt, row.notes]


def write_csv(rows: list[Row]) -> None:
    with CSV_PATH.open("w", encoding="utf-8", newline="") as f:
        out = csv.writer(f, lineterminator="\n")
        out.writerow(COLUMNS)
        for i, row in enumerate(rows, start=1):
            out.writerow(values(i, row))


def write_xlsx(rows: list[Row]) -> None:
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.worksheet.datavalidation import DataValidation

    font = Font(name="Arial", size=10)
    bold = Font(name="Arial", size=10, bold=True, color="FFFFFF")
    head = PatternFill("solid", fgColor="5B3A21")
    edit = PatternFill("solid", fgColor="FFF2CC")
    wb = Workbook()

    guide = wb.active
    guide.title = "How to use"
    lines = [
        ("Rytta sprite catalogue (RYT-066)", True),
        ("One row = one picture to generate by hand in ChatGPT.", False),
        ("1. Copy the 'prompt' cell of a row into ChatGPT (one conversation per category keeps the style).", False),
        ("2. Check the result: strictly from above, the right number of objects in the right order, real transparency where 'background' says transparent, no text.", False),
        ("3. Download it with ChatGPT's download button (not a screenshot) and save it exactly at 'path', with the name in 'file'.", False),
        ("4. Set 'status' to 'generated' (the yellow column is the only one to edit). Rytta's import marks it 'imported'.", False),
        ("Order: generate by 'order'. Priority 1 is what the generated maps use today; 2 adds variety (floors, walls, effects); 3 is new props that Rytta will add to its library.", False),
        ("If a picture comes out three-quarter or with a drawn checkerboard, ask ChatGPT to redo it strictly from directly above with a real transparent background (docs/sprite-art.md lists the corrections).", False),
        ("Rules: never name an artist, studio or asset pack in a prompt, and never upload someone else's art as a reference.", False),
        ("Rows 1 and 2 of the catalogue are the pilot sheets, already imported: they show the expected file names and paths.", False),
    ]
    for r, (text, title) in enumerate(lines, start=1):
        cell = guide.cell(row=r, column=1, value=text)
        cell.font = Font(name="Arial", size=14 if title else 10, bold=title)
        cell.alignment = Alignment(wrap_text=True, vertical="top")
    guide.column_dimensions["A"].width = 120

    sheet = wb.create_sheet("Catalogue")
    widths = {"order": 7, "priority": 8, "category": 10, "subject": 30, "file": 26, "path": 42, "aspect": 15,
              "background": 12, "layout": 10, "contents": 22, "blend": 9, "used_in": 30, "library": 9,
              "status": 11, "prompt": 110, "notes": 40}
    for c, name in enumerate(COLUMNS, start=1):
        cell = sheet.cell(row=1, column=c, value=name)
        cell.font, cell.fill = bold, head
        cell.alignment = Alignment(vertical="center")
        sheet.column_dimensions[cell.column_letter].width = widths[name]
    for i, row in enumerate(rows, start=1):
        for c, value in enumerate(values(i, row), start=1):
            cell = sheet.cell(row=i + 1, column=c, value=value)
            cell.font = font
            cell.alignment = Alignment(wrap_text=COLUMNS[c - 1] in ("prompt", "notes", "used_in", "subject"),
                                       vertical="top")
        sheet.cell(row=i + 1, column=COLUMNS.index("status") + 1).fill = edit
        sheet.row_dimensions[i + 1].height = 60
    sheet.freeze_panes = "E2"
    sheet.auto_filter.ref = f"A1:{sheet.cell(row=1, column=len(COLUMNS)).column_letter}{len(rows) + 1}"
    status_col = sheet.cell(row=1, column=COLUMNS.index("status") + 1).column_letter
    check = DataValidation(type="list", formula1='"pending,generated,imported,rejected"', allow_blank=False)
    sheet.add_data_validation(check)
    check.add(f"{status_col}2:{status_col}{len(rows) + 1}")

    summary = wb.create_sheet("Summary")
    summary["A1"], summary["B1"], summary["C1"], summary["D1"], summary["E1"] = (
        "category", "rows", "generated", "imported", "pending")
    for cell in summary[1]:
        cell.font, cell.fill = bold, head
    cat_col = sheet.cell(row=1, column=COLUMNS.index("category") + 1).column_letter
    n = len(rows) + 1
    for r, category in enumerate(["prop", "floor", "wall", "decal", "effect"], start=2):
        summary.cell(row=r, column=1, value=category).font = font
        summary.cell(row=r, column=2, value=f"=COUNTIF(Catalogue!${cat_col}$2:${cat_col}${n},A{r})").font = font
        for c, state in ((3, "generated"), (4, "imported"), (5, "pending")):
            summary.cell(row=r, column=c, value=(
                f"=COUNTIFS(Catalogue!${cat_col}$2:${cat_col}${n},$A{r},"
                f"Catalogue!${status_col}$2:${status_col}${n},\"{state}\")")).font = font
    summary.cell(row=7, column=1, value="total").font = Font(name="Arial", size=10, bold=True)
    for c in range(2, 6):
        letter = summary.cell(row=1, column=c).column_letter
        summary.cell(row=7, column=c, value=f"=SUM({letter}2:{letter}6)").font = Font(name="Arial", size=10, bold=True)
    summary.cell(row=9, column=1, value="Counts come from the 'status' column of the Catalogue sheet.").font = font
    for letter, width in zip("ABCDE", (14, 10, 12, 12, 10)):
        summary.column_dimensions[letter].width = width
    wb.calculation.fullCalcOnLoad = True
    wb.active = 1
    wb.save(XLSX_PATH)


def main(imported: set[str] | None = None) -> None:
    rows = build_rows(imported)
    CSV_PATH.parent.mkdir(parents=True, exist_ok=True)
    write_csv(rows)
    write_xlsx(rows)
    by = {}
    for row in rows:
        by[row.category] = by.get(row.category, 0) + 1
    print(f"{len(rows)} rows {by} -> {CSV_PATH.relative_to(ROOT)}, {XLSX_PATH.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

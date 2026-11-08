# Map design doctrine

How to make a battle map that works on Rytta's table, by hand or with the generator. The generator
(RYT-063) follows the same rules; the last section shows where. Sources are listed at the end and in
[research](research.md). Rules references are SRD 5.2.1 (CC-BY-4.0).

## 1. Start from the table

- **One square is one miniature base.** Calibrate the table first (Tabletop → table setup). It tells
  you how many whole squares the screen holds, for example 47 × 26 on a 55-inch 4K screen with
  one-inch bases. Design at that size. A bigger map pans, which is fine while exploring and poor
  during a fight.
- **Keep the edges quiet.** Arms, cups and the screen bezel cover the outer squares. Keep doors,
  hazards and anything that matters at least two squares from the edge of the table frame.
- **Export cleanly.** Use a whole number of pixels per square (64–140), make the image exactly
  columns × pixels wide, and start the grid at pixel 0. Leave the grid out of the image, since Rytta
  draws its own. If it is baked in, enter the squares across when you upload and line it up with
  the offset.
- **Sizes that work.** A fight needs about 20 × 15 to 30 × 20 squares around it. A dungeon level
  should fit on one table. The largest room should be at least twice the party's speed across:
  a 30-foot speed is 6 squares, so make it 12.

## 2. Purpose before shape

Before you draw a wall, answer five questions: who built this place, what for, what happened to it,
who is here now, and what the party wants here. Every room then has a job, and the job decides its
size, its doors and its furniture. A guard post watches the way in, the kitchen sits beside the hall,
and the shrine faces whoever enters. At the very least a map needs an **entrance**, a **goal** and
one **reward off the main path**.

## 3. Flow: loops, not a line (Jaquays)

- **Loops give choices.** Add at least one loop for every five rooms, so the party can circle
  round, flank or retreat. Plain branches still play as a straight line.
- **Make the goal far.** Put it far from the entrance by walking, not just by distance on paper.
- **Two ways in** (or one secret way out) change how the party approaches.
- **Reward dead ends** with treasure, lore, a shortcut or a trap that warns.
- **Don't overdo it.** Endless loops make every choice meaningless.
- **For one session, use five rooms:** an entrance with its guardian, a puzzle or a conversation,
  a setback, the climax, then a reward or a twist.

## 4. Spaces for fights

- **Mix sizes.** Passages of one or two squares are chokepoints. Most rooms are 4 × 4 to 8 × 8.
  The climax gets one large hall.
- **Cover.** In fighting areas, put something to hide behind every three to five squares: pillars,
  crates, rubble. Half cover is +2 to AC and Dexterity saves, three-quarters cover +5 (SRD Cover).
- **Terrain with a cost.** Add difficult terrain (rubble, shallow water, undergrowth), hazards
  (a chasm, fire, deep water) and height (a dais, a ledge, stairs). Draw each of them clearly.
- **Sightlines.** Long, open lines favour archers and casters; broken lines favour melee. Doors
  and corners cut lines of sight, so use both.
- **Ranges.** 60 feet is 12 squares, a common spell range. Keep the diagonal of the biggest room
  close to the longest range you want to matter in it.
- **Room for miniatures.** Put furniture against the walls and keep a free square around anything
  someone may stand next to. Furniture should take less than a third of a room's floor.

## 5. Readable at the table

- **Contrast first.** Squint at the map: floor and walls must still read as different. Walls
  should be at least a sixth of a square thick, and anyone at arm's length should see at a glance
  where they can walk.
- **A quiet grid.** Rytta draws it softly on top. Do not compete with it using busy floor patterns.
- **Low-contrast texture.** Stones and grass should read as surface, not as objects.
- **Same symbol, same meaning.** Draw doors, stairs and hazards the same way every time. Never
  show meaning by colour alone.
- **Secrets stay out of the picture.** The players see the image. Draw a secret door as plain wall
  and place it as a Rytta door marked secret. Leave out tokens, room numbers and traps too: place
  them as tokens, notes and events, which can be hidden.
- **Check both lights.** Look at the map in a dim room (the dark theme at night) and in daylight.
- **Leave the outside alone.** What nobody walks on (the rock round a cave or a dungeon) stays a quiet
  dark ground, never a texture: the eye goes to the rooms. Walls show with the room they close.
- **One floor per purpose.** A floor may say what a room is (a library's parquet, a kitchen's flags)
  but stays quieter than the props and miniatures on it.

## 6. Reveal and pacing

- **One reveal area per part.** Each room, passage, cavern or clearing should be revealable on
  its own. Rytta's generator stores these areas. On an uploaded map, use the room or box fog tools.
- **Doors sit on the line between two areas**, so opening one reveals what lies beyond.
- **Events go on thresholds.** An ambush event can reveal the room and its hidden creatures at once.

## 7. Outdoors

- **A trail from edge to edge** with places on it. Each clearing has a purpose: a camp, a shrine,
  standing stones. One place sits off the trail for those who look.
- **Water is a barrier with crossings.** Give it a bridge or a ford where the trail meets it.
- **Trees with room between them.** Keep trunks one and a half to two and a half squares apart so
  miniatures fit, with denser woods at the edges to frame the scene.

## 8. Ownership

Use your own art or assets whose licence covers your use, and keep their credits. Uploaded maps stay
private to the campaign. Rytta never bundles them.

## 9. Before the session

1. Does the map fit the table, with nothing important on the outer two squares?
2. Is there a way in, a goal far from it and a reward off the main path?
3. Is there at least one loop?
4. Does every fighting area have cover, a chokepoint and something with a cost to cross?
5. Do walls and floors stay distinct when you squint?
6. Are all secrets out of the image and placed as hidden items?
7. Are the reveal areas and doors in place?
8. Do the notes say what is in each key room?
9. Can every miniature stand where it needs to?
10. Did you look at it on the table screen at full size?

## How the generator applies this

| Doctrine                 | Generator v2                                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Table size               | "The table" size uses the calibrated squares                                                                             |
| Entrance, goal, reward   | Rooms get roles: an entrance by the edge (a passage out or stairs), the goal farthest by walking, treasure in a dead end |
| Loops                    | A spanning tree of passages plus loops that join parts far apart through the tree                                        |
| Purpose                  | Furniture by room purpose (store, library, barracks, shrine, tombs), against the walls, flanking pairs                   |
| Chokepoints and sizes    | Rooms from a wish list (large, ordinary, small); passages one square or two                                              |
| Secrets out of the image | Secret doors are drawn as wall; the door is a hidden item; the passage square behind one is in no reveal area            |
| Reveal areas             | Rooms, passages, caverns and clearings are fog areas; doors reveal both sides                                            |
| Notes                    | DM notes for the entrance, the goal, treasure, places and, optionally, traps                                             |
| Readable                 | One traced wall line, a light band and hatching outside, low-contrast floor stones                                       |
| Outdoors                 | Clearings with a purpose on a trail, a stream with a bridge, trees spaced by dart throwing                               |
| Themes (RYT-068)         | Each kind has themes (stone, ruins, temple, dwarf hold, ice, lava…) that choose its tiles, light and part of its props   |
| Purpose shows (RYT-068)  | Rooms are armouries, forges, kitchens, prisons, studies, training grounds, throne rooms; floors follow the purpose       |
| The outside (RYT-068)    | Untextured dark ground with faint clouds and specks; caves' rock fades into it; revealed rooms show their walls          |

## Sources

- Justin Alexander, [Jaquaying the Dungeon](https://thealexandrian.net/wordpress/13085/roleplaying-games/jaquaying-the-dungeon)
  and [Xandering techniques](https://thealexandrian.net/wordpress/13103/roleplaying-games/xandering-the-dungeon-part-2-xandering-techniques).
- Sly Flourish, [simpler Jaquays-style maps](https://slyflourish.com/simpler_jaquay_style_maps.html).
- Bob Nystrom, [Rooms and Mazes](https://journal.stuffwithstuff.com/2014/12/21/rooms-and-mazes).
- RogueBasin, [cellular automata caves](https://roguebasin.com/index.php/Cellular_Automata_Method_for_Generating_Random_Cave-Like_Levels).
- Boris the Brave, [dungeon generation in Unexplored](https://www.boristhebrave.com/2021/04/10/dungeon-generation-in-unexplored/)
  (cyclic generation).
- Watabou, [One Page Dungeon](https://watabou.itch.io/one-page-dungeon) (the print-like ink look).
- World Anvil, [how to create great D&D battle maps](https://blog.worldanvil.com/mapmaking/how-to-create-great-dd-battle-maps).
- SRD 5.2.1: Playing on a Grid, Cover, Difficult Terrain (CC-BY-4.0).

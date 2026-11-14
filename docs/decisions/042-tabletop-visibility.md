# ADR 042: shared exploration at the physical table

Date: 2026-11-14. Accepted for RYT-101. Amends [ADR 032](032-tabletop.md).

The DM moves the group's digital miniatures. Players can use a torch, cast Light, or
reveal the area within 30 feet of their own present character if the DM grants that
action in the token inspector. These are map effects. The group tracks charges,
consumables and spell slots on the sheet or in inventory.

Vision and lighting are independent scene settings, initially off. Party vision uses
the positions of present characters and the DM's sight range. With both settings on,
exploration remembers the occupied squares and what the party can see in the light.
Moving away or extinguishing a torch leaves the terrain known, but dark without a
light source. A reveal effect remembers terrain through darkness without showing
hidden creatures. Shared memory is attached to the scene, not to one browser.

Automatic vision starts from unexplored ground, even if the DM had previously cleared
manual fog. Switching it off restores manual fog; switching it back on resumes exploration.
Replacing or recalibrating map geometry starts a new exploration mask. With lighting
alone, lights clear covered terrain in their radius. A source has a bright radius and
a dim outer band of the same width.

Closed and locked doors block rays across their opening. Open doors pass sight and up
to two squares of light beyond the threshold. Generated floors and imported room
boundaries provide occlusion. Ordinary image uploads have no machine-readable walls:
use door items or import a Universal VTT file. Its lights become editable map sources.

The server filters the live projection before sending it to a phone or the table.
Current sight and light govern creature positions; remembered terrain alone never
discloses a creature. Authorisation for light effects includes campaign, module, live
scene, ownership, presence and the DM's grant. Players gain no permission to move
tokens. Both settings can be disabled to return to the previous map behaviour without
deleting scenes or their manual fog.

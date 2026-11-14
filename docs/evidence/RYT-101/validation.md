# RYT-101: tabletop exploration and map tools

## What to try

Open **Scene → Visibility and light** with a DM account. Set party vision and lighting
independently. Under **Tokens → Party characters**, place a present character
even if no encounter is running. Open the token inspector
to grant map effects and set the light radius. Publish the scene to the table. On the
character owner's phone, activate a torch, the Light spell or the reveal effect.
Only the DM moves the token. Resource accounting remains manual.

Try the same doorway closed and open, move the group away, then turn the torch off.
Known terrain remains on the map; creature locations require current sight and light.
On the table screen, the ruler measures grid distances without physical calibration;
the physical scale strip is available when calibrated. In the editor, area size and
width change in five-foot steps.

## Database checks, 2026-11-14

- Exercised Player, DM, unrelated DM, outsider and anonymous access locally. Tests cover
  both schemas, retry idempotency, present/absent characters, remote light footprints,
  hidden enemies, closed/open doors, two-square spill, reveal, memory and stale revisions.
- First applied the change only to hosted PRE. A disposable scene exercised the DM and
  Player RPCs using two different existing identities in one rolled-back transaction.
  Verified closed-door concealment, opening and spill, light on/off, remembered terrain,
  a reveal pulse, duplicate use and denial of Player movement. No test scene persisted.
- Applied the same reviewed schema change to production only after the PRE check.
  Both migration records exist. Verified two existing scenes in PRE and one in
  production; both switches remain off on the production scene. Authenticated callers
  have access to the two guarded RPCs, anonymous callers do not; neither can call the
  private geometry helpers. PRE functions have no production references.
- Hosted security advice lists the two deliberately authenticated definer functions;
  each checks campaign/role or ownership internally. No new performance advisory
  identified for this change. To stop the feature, turn both switches off on the scene.
  The migration neither deletes data nor requires old clients to send new fields.

## Verification boundaries

The first browser pass found the private Player ruler ending at zero after a drag,
a radius edit saving the first valid prefix, and the projection ruler losing its
readout beyond the viewport. Follow-up Chromium tests verified seven squares as
35 feet with drag, two taps and keyboard, a committed 120-foot radius, and readable
distances at the edge of normal and rotated displays. Player effects were retested
with a separate Player session after correcting the initial DM fixture.

The full build and 424 unit/database tests passed. The broader browser run passed
565 cases on isolated ports. Three sign-in assertions required the standard callback
port and all three passed there. That run skipped 45 configured cases. The first
focused change matrix passed 10 cases with eight intentional viewport-matrix skips.
An earlier global check encountered a concurrent character-suite failure and a
translation parse error before the successful check.

The final tabletop browser suite passed 37 cases. Eight repeated viewport combinations
were intentionally skipped. On all three screen sizes the DM placed a party member
without a combat encounter, opened the token and saved its torch permission.
The first version of that test assumed the tablet panel was already open and expected
the checkbox to update synchronously. The final version opens the panel and verifies
both the checked state and the stored permission after the click.

Independent interface review passed after enlarging the Player's Measure switch
to a 44-pixel target. At 150% text on a 390-pixel phone, the effect list scrolls
to reach the last action and the status message. Both were accessible by keyboard.

Browser interactions use fixture identities and real Chromium rendering; the hosted
check exercises PostgreSQL, not two signed-in devices or Realtime over the network.
No physical display measurement or web deployment was performed.

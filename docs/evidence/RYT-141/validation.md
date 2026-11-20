# RYT-141 — Menus: Enter after Escape moves focus into the reopened menu

## Reproduction

A repeated browser test opens the DM row menu (`Opciones de Bea`) with Enter, closes it with
Escape and reopens it with Enter, 25 times per run, on identity-mobile, identity-tablet and
identity-desktop.

- With a check taken immediately after the menu became visible, 2 of 25 reopenings had focus
  outside the menu, and once focus fell to a `div` after Escape.
- Measured: Mantine moves focus into the dropdown after its enter transition. Keys pressed inside
  that window (well under one frame in the automated run) act on the button or on a menu that is
  still mounting. With the check waiting for focus to arrive, 30 runs × 25 reopenings passed on
  mobile and tablet, with and without a candidate fix (no exit transition for menus), so the fix
  was withdrawn.
- On opening, focus lands on Mantine's initial focus placeholder inside the menu, not on the
  first item; ArrowDown reaches the first item. This is the library's documented behaviour.

## Decision

No product change. The RYT-137 losses came from specs that chose an item before focus arrived;
they already wait for the items. The cause belongs to the menu library's transition timing and
no human-speed reproduction exists. Workaround for specs: wait for focus inside the menu (or for
the items) before the next key.

## Guard

`RYT-141 reopening a menu with Enter after Escape moves focus inside every time` stays in the
suite: 25 reopenings per run, focus inside the menu each time, ArrowDown on the first item, and
Escape returning focus to the button. Existing focus specs stay green.

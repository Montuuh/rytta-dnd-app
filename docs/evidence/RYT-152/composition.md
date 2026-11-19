# RYT-152 — Landing scene pilot composition (not shipped)

Owner decision, 19 November 2026: real Rytta captures on a tablet and a phone, composed over the
current hero illustration. No generated or commissioned art and no cost.

## Captures

All four were taken on 19 November 2026 from the e2e fixture backend (`tests/e2e/fixtures`), with
the Hearth theme, reduced motion and a device scale of 2. The data are fixtures: the characters
Arin and Bea, four goblins and a healing potion. No account or personal data appears.

| File | Source screen | Viewport |
| --- | --- | --- |
| `tablet-table-{es,en}-1180.png` | Table screen (`#/campaign/<id>/tabletop-table`) of an active fight, DM fixture, round 1 with Arin acting | 1180 × 820 |
| `phone-card-{es,en}.png` | Player inventory (`#/campaign/<id>/inventory`) with the healing potion card open | 390 × 844 |

## Devices and crop

The compose script drew each device frame (dark bezel, rounded corners, light rim), warped the capture
onto it, added a contact shadow and a warm candle glow, and wrote WebP at quality 72. The quads of
`SCENES` were the crop shown to the owner:

- Wide (`hero-wide.webp`, 1920 × 1080): the tablet stands on a folio stand in the right part
  (x 1134–1802, y 360–818), clear of the copy column; the phone lies flat between the tablet and
  the compass (x 1146–1296, y 858–1072).
- Tall (`hero-tall.webp`, 1080 × 1440): the tablet stands at x 406–1056, y 666–1112, behind the
  compass, which is repainted in front of it; the phone lies flat at the lower left
  (x 96–306, y 1132–1408).

The compass, the illustration's second emblem, stayed visible in both framings; the owner kept it.

The capture files and the compose script were not kept after the owner's verdict (see `verdict.md`).

## Output and weight

| Asset | Size | Current hero |
| --- | --- | --- |
| `landing-scene-tall-es.webp` / `-en` (1080 × 1440) | 45.2 / 44.5 KB | `hero-tall.webp` 44.6 KB |
| `landing-scene-wide-es.webp` / `-en` (1920 × 1080) | 57.4 / 56.8 KB | `hero-wide.webp` 56.8 KB |

The pilot would have loaded one image per visitor, chosen by language and width. None of these
assets shipped; the current hero stays unchanged on main.

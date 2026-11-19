# RYT-152 — Owner verdict on the landing scene pilot

Decision, 19 November 2026: the scene does not ship. The landing keeps the current hero and the
compass emblem in the illustration, exactly as on main.

The owner reviewed the comparison sheet (private, shared with the owner):
current hero against the composed scene, headline covered at 390, 820 and 1280 px, Hearth and
Parchment, English and Spanish, slow connection and blocked image. In their words: "no termina de
integrarse bien lo del movil y la tablet. Si no se integra bien, prefiero que ni salga nada."
Improving backgrounds and illustrations with generated art is parked until the end of the
backlog, with no paid or API generation.

## What the comparison showed

- Weight was equal: tall 45.2/44.5 KB (ES/EN) against 44.6 KB; wide 57.4/56.8 KB against
  56.8 KB.
- At 400 kbit/s and 400 ms latency on a production build at 390 px, both versions showed the hero
  at 18.2 s, dominated by JavaScript, and finished the image 0.9 s later, with no layout shift.
- The tablet was legible from 390 px; the phone measured about 60–75 px on screen and could not be
  read at any width.
- The independent interface review of the pilot returned CHANGES_REQUIRED: the wide frame cropped
  the tablet at 820 px with 150% text, and the phone was too small to carry its half of the
  message. The crop was fixed on the pilot branch. The focused re-review did not run because the
  owner decided first.

`composition.md` records the captures, framings and weights of the pilot. Its code, assets and
captures were removed before merging.

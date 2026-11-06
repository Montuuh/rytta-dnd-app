---
target: DM bestiary
total_score: 29
max_score: 40
na_heuristics:
p0_count: 0
p1_count: 3
target_identity: "file:C:\\Users\\dmont\\Desktop\\CODE - Proyectos\\rytta-dnd-app\\src\\features\\combat\\ui\\bestiary.tsx"
target_fingerprint: 'sha256:ebae58ed45cbc60698c81b451c4cfd043416798da985f4f1bb6b7f7ca9d6ccc8'
target_path: "C:\\Users\\dmont\\Desktop\\CODE - Proyectos\\rytta-dnd-app\\src\\features\\combat\\ui\\bestiary.tsx"
timestamp: 2026-11-04T16-23-39Z
slug: src-features-combat-ui-bestiary-tsx
---

Method: dual-agent (A: design review · B: detector + browser + audit evidence)

## Design Health Score (Nielsen) — 29/40, Good

| #   | Heuristic                   | Score | Key issue                                                                                                              |
| --- | --------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------- |
| 1   | Visibility of system status | 3     | Phone filter drawer: live count and "Ver N criaturas" below the fold                                                   |
| 2   | Match system / real world   | 4     | Size bases, token shapes, Σ vs dice, CR bands, SRD page                                                                |
| 3   | User control and freedom    | 3     | "Rápida" skips the start step: no "Otras formas" back                                                                  |
| 4   | Consistency and standards   | 2     | "Eliminar" vs "Borrar {name}"; Customise keeps the SRD name, Duplicate adds "(copia)"; footer button alignment differs |
| 5   | Error prevention            | 3     | Customising Lobo saves a second "Lobo"                                                                                 |
| 6   | Recognition over recall     | 3     | SRD picker ordered by English name                                                                                     |
| 7   | Flexibility and efficiency  | 3     | Good keys; chrome above the list costs every visit                                                                     |
| 8   | Aesthetic and minimalist    | 3     | Intro + sidebar + licence on every visit                                                                               |
| 9   | Error recovery              | 3     | Retry exists; empty-state action at the screen edge on phones                                                          |
| 10  | Help and documentation      | 2     | Customise vs Duplicate never explained; "/" hint on touch                                                              |

## Audit Health Score — 15/20, Good

| Accessibility | 3 | axe 0 violations (6 views × 8 combos); slider thumbs 36px hit area, search clear 36px, inline glossary terms 21–25px |
| Performance | 3 | 330 rows (~6k nodes) re-render per keystroke, no useDeferredValue |
| Theming | 3 | Only .bst-filter-actions uses --mantine-color-white/dark-6 instead of --app-* |
| Responsive | 3 | 390px @150%: sheet action row +10px, editor footer group +6px, "Iniciativa" dt overflows |
| Implementation integrity | 3 | Detector clean (regex-only for tsx); overlay: straggler, 158-char licence lines, Inter 82–85% |

## Priority issues

- [P1] Phone list buried under three levels of chrome (first row at y≈655/844). Fix: compact bestiary header on phones, search+Filtros on one row, sticky toolbar. layout/distill
- [P1] Phone filter drawer hides its result (size auto; actions below 14 type tiles). Fix: sticky footer with live count. adapt
- [P1] Add to an encounter: six decisions at once, submit doesn't name the encounter, plain success state. Fix: "Añadir 3 a Cripta", fold alias/side/hidden into table options, richer success. clarify/delight
- [P2] Customise vs Duplicate redundancy and name collision. Fix: one action that names the copy. clarify
- [P2] Identical red hexagons with initials in every SRD row. Fix: type glyph or tier in the token. colorize/bolder
- [P2] 150% text overflow on phones (sheet action row, editor footer, Iniciativa). adapt

## Minor

- Content: "las t iradas" in Lobo's Pack Tactics (es.json).
- Gender: "Dragón rojo joven añadida/guardada".
- Quick dialog titled "Rápida"; delete body doesn't say it can't be undone.
- CR band left accent border (side-stripe); slider value label "0" always visible.
- Licence lines ~158 chars; intro straggler "sección.".

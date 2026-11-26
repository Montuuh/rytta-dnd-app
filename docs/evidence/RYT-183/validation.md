# RYT-183 validation: a shadcn kit beside Mantine

Date: 2026-11-26. Decision: [ADR 059](../../decisions/059-shadcn-kit-beside-mantine.md).

## What was checked

- `npx shadcn add item empty skeleton` wrote `item.tsx`, `empty.tsx`, `skeleton.tsx` and
  `separator.tsx` into `src/shared/ui/kit` with `tw:` utilities. Two things needed a hand: the
  command line resolves the `@/` alias from the root `tsconfig.json`, which gained the `paths`
  entry (the first run wrote into a literal `@` folder, removed); and the components import `cn`
  from the `cn` package, changed to the prefixed helper in `src/shared/lib/cn.ts`.
- `@base-ui/react` had to be installed by hand; the command line did not add it.
- A throwaway page rendered `Item` (outline and muted), `Skeleton` and `Empty` in Hearth and
  Parchment. Computed on the outline item: `border: 1px solid rgb(77, 56, 40)` (`--app-border`),
  `border-radius: 12px`, `display: flex`, `padding: 10px 12px`; the skeleton background is
  `rgb(42, 31, 22)` (`--app-raised`). No console errors. The page was deleted afterwards.
- Built stylesheet: 332.17 kB (52.10 kB gzip) before, 344.57 kB (54.51 kB gzip) after. Layers
  appear in the order theme, base, components, utilities; Mantine and the application styles
  stay unlayered above them.
- A probe file outside the kit that imported Base UI made `npm run check:architecture` fail with
  "Base UI belongs in the kit"; the probe was removed.
- `npm run check`: passed (typecheck, lint, architecture, docs, private content, unit and SQL
  tests, build).
- `npm run test:e2e`: 1,828 passed, 197 skipped, 3 failed in the full run
  (`glossary.spec.ts:688` on desktop, `identity.spec.ts:1751` on tablet, `legal.spec.ts:119` on
  phone). Each of the three passed when run alone straight after; they failed under the load of
  the full run on this machine, each in a different project.

## Not checked

- No screen uses the kit yet, so no kit component has been through captures at 390px and 820px,
  keyboard, 150% text or reduced motion inside the application. That belongs to RYT-184.
- Kit overlays (Drawer, popovers) are not installed; stacking and focus beside Mantine overlays
  is untested.

## UI review

Passed on 26 November 2026: 58 captures per side of this tree and the previous commit at 390px
and 820px, in both themes and both languages, with no difference in computed styles. Left for
the first screen that uses the kit (RYT-184): the reset must also clear the margins of
paragraphs and the underline of links inside kit parts; a focused `Item` shows the global
outline, the kit ring and the border at once; `Skeleton` keeps pulsing with reduced motion;
kit controls are 32px until raised to 44px.

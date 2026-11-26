# ADR 059: a shadcn kit beside Mantine

Date: 2026-11-26. Status: accepted for `RYT-183`. Changes decision 2 of
[ADR 001](001-foundation.md) (Mantine as the only UI kit) and the matching paragraph of the
[design system](../design-system.md). No database change.

## Context

Mantine gave the project accessible dialogs, forms, menus and notifications from the first day
and stays in every screen. The screens the owner now wants rebuilt, starting with the campaign's
downloadable content, need widgets Mantine does not have or has only as generic parts: rich list
rows with media and actions, designed empty states, bottom sheets that follow the finger, a
command list for search-first browsing, carousels and skeletons shaped like the content. The
owner asked on 26 November 2026 for [shadcn/ui](https://ui.shadcn.com/) in the project.

shadcn/ui is not a dependency that renders components: its command line copies component source
into the repository, styled with Tailwind utilities over Base UI primitives. That source is then
ours to shape to the field-journal identity.

## Decision

1. **Two kits, one owner per job.** Mantine keeps the application shell, forms and inputs,
   modals, menus, notifications and everything already built. The shadcn kit is for widgets
   Mantine lacks and for new composed widgets. A screen never shows two versions of the same
   control: there is one button, one switch, one text input and one modal, and they are Mantine's.
2. **The kit lives in `src/shared/ui/kit`.** Components are added with
   `npx shadcn add <name>` (configuration in `components.json`, style `base-nova`, Lucide icons)
   and then edited like any other source file. Base UI is imported only inside the kit; features
   import the kit's components. `npm run check:architecture` enforces it.
3. **Tailwind without Preflight, with a prefix.** `src/app/kit.css` imports Tailwind's theme and
   utilities only. Mantine and `src/app/styles.css` keep owning the page's base styles, and a
   small reset applies to elements that carry `data-slot`, the attribute of every kit part (the
   trade window's boxes carry it too and are unaffected). Every utility carries the
   `tw:` prefix (`tw:flex`), so no utility can collide with a class of the existing stylesheets.
   Tailwind's layers sit below the unlayered Mantine and application styles.
4. **One set of tokens.** The kit's colours (`background`, `primary`, `muted`, `border`, `ring`
   and the rest) point at the application's semantic tokens (`--app-bg`, `--app-accent`, ...), so
   Hearth, Parchment and the class themes apply without a second palette. The `dark:` variant
   follows `data-mantine-color-scheme`.
5. **Class merging** uses `cn` from `src/shared/lib/cn.ts`, configured for the prefix.
6. **Feature stylesheets stay.** Utilities are for the kit and for composing it; existing CSS
   files are not rewritten into utilities, and a feature keeps one styling approach per component.

## Consequences

- The stylesheet grows by about 12 kB (2.4 kB gzip) with the first four components; each
  component adds only the utilities it uses. Base UI is tree-shaken per component.
- The content security policy is unchanged: styles already allow inline, scripts do not.
- Kit overlays (sheets, popovers) and Mantine overlays have separate stacking and focus traps.
  Do not open one from inside the other without testing focus return and Escape.
- Kit components arrive with 32-36px controls and their own focus ring. Each one is adjusted to
  44px targets, the gold focus token and reduced motion before a screen uses it.
- Typed translations, both themes, 390px and 820px captures and the UI review apply to kit
  components exactly as to Mantine ones.

## Alternatives

- Mantine only (ADR 001): kept for five months; the missing widgets were rebuilt by hand in
  feature CSS each time.
- Replacing Mantine with shadcn: a rewrite of every screen for no user-visible gain.
- Tailwind with Preflight and without a prefix: resets Mantine's base styles and generates
  utilities such as `hidden` or `container` that match class names already in use.

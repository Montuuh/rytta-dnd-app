# RYT-022 validation

## Scope and ownership

Owned: warm dark hearth and light parchment palettes (`index.html`, `src/app/theme.ts`,
`src/app/styles.css`, `src/shared/ui/preferences-controls.tsx`), two-row stacked top header
navigation and unified `Profile` menu (`src/app/layout.tsx`), semantic resource tiles and 44px
touch steppers (`src/features/characters/ui/party.tsx`), English/Spanish catalogs
(`src/shared/i18n/{es,en,characters-es,characters-en}.ts`), browser E2E tests
(`tests/e2e/{scaffold,preferences,identity,characters}.spec.ts`), ADR 011 and RYT-022
evidence/backlog. Initial working tree was clean. No backend, production data, release or
legacy sibling edits.

## Verification

- `npm run check`: PASS, including strict typecheck, lint, architecture/docs/AI contracts,
  55 unit/SQL tests across 10 files, and production build.
- First E2E run (`npm run test:e2e`): 126 passed, 3 failed. The 3 failures were in
  `identity.spec.ts` (`DM invites, cancels and hands over before leaving; campaign routes stay scoped`)
  where an extra inner `<span>` around the planned module label caused `getByText('Inventario')`
  to match the inner text span instead of the `aria-disabled="true"` container. Removed the
  redundant inner `<span>` in `src/app/layout.tsx`.
- Full E2E suite (`npm run test:e2e`): PASS, 129 tests across desktop, tablet (`820px`) and
  touch mobile (`390px`), covering dark/light themes, Spanish/English, 150% text zoom, reduced
  motion, keyboard/Escape focus restoration, resource steppers and WCAG AA axe checks.
- Screenshot inspection: Inspected mobile (`390px`) and tablet (`820px`) captures in
  `docs/evidence/RYT-022/`. Refined `.skip-link` off-screen transform and `CharacterEditor`
  vertical stack spacing (`gap="xs"`, `yOffset="2dvh"`) so the 150% resource editor modal fits
  cleanly inside the `390×844` viewport.
- Independent `ui-ux`: PASS, [review](reviewer/review.md). The reviewer inspected the modified
  source files, rendered screenshots and live Playwright runs (`docs/evidence/RYT-022/reviewer/e2e/`)
  and approved source digest `da5f48cf6f7b173fe9e40be946810ebc9656f77b515ce9f50f94e734898c067b`.
- `npm run check:ui-review`, `npm run format:check` and final `npm run check:fast`: PASS.

## Boundaries

Browser mutations use the existing HTTP fixture and assert PRE request profiles. SQL tests run
against PGlite. No hosted PRE/PROD data changes, real two-account OAuth round trip,
physical-device/iOS Safari verification, commit, push or deployment is included.

# RYT-021 verified GitHub Pages deployment

Date: 2026-10-29. Continuation after the preflight agent hit its usage limit mid-publish.

## Published revision

- Public URL: https://montuuh.github.io/rytta-dnd-app/
- Frontend revision: `9df13044e944a1bb95c97f04eb49147b517edc48`
- Quality: https://github.com/Montuuh/rytta-dnd-app/actions/runs/40881337760 — success
- Publish Pages: https://github.com/Montuuh/rytta-dnd-app/actions/runs/40881337718 — success
  (build + deploy). GitHub Pages deployment id `7413479818` for the same SHA.
- Preflight: [release-preflight.md](release-preflight.md). UI review digest remained
  `c7da5ca8b841f0dd92aa9f72499dd3ed65c57b58bf2becc03bb055210f835dc1`.

## Public verification

Harness: `.tmp/ryt021-release/public-smoke.mjs` → `public-smoke.json` (ignored `.tmp/`).

- Live signed-out load at 390 and 820: HTTP 200, Google sign-in visible, deep-route
  `#/campaign/<id>/party` reload stays on the sign-in shell, zero page errors, zero failed
  asset requests; JS/CSS under `/rytta-dnd-app/` returned 200.
- Deployed-bundle fixture (synthetic identity; every Supabase request intercepted — not a
  hosted Auth/RLS round trip): Members heading is “Miembros e invitaciones” with no
  Link/Unlink; “Gestionar personajes en Grupo” opens Party; link Player works; PostgREST
  Accept/Content-Profile is `public` on the production host.
- Result: `PASS` (`deployedFixtureSchema: public`, `hostedMutations: 0`).

## Boundaries

No second real Google account, Safari/iOS or concurrent Auth session was exercised here.
No database migration or paid resource was created. Frontend rollback: restore
`a879f8e34eeba175d95fd2774ea7b3a64726d99c` through Quality + Publish Pages and re-check
the public URL.

# RYT-026 validation

## Delivery and ownership

Campaign item catalogue, shared definition editor and images, shop/grant integration,
direct DM gold entry, and accessible Player equipment controls. Owned code: inventory,
shop integration, Party resources, sheet navigation, app navigation/routes, translations,
API overlays, the additive migration and relevant tests. No frontend deployment or Git
push was performed.

## Backend evidence

Project: Rytta (`ekscdsmniukuxqjixapu`). Compared the local migration series and hosted
history before changes. Existing inventory/shops migration names agree, but their historical
version timestamps differ; they were not reapplied or rewritten.

- CLI 2.122.0 created the new migration. Its local timestamp was advanced past the repository's
  already-present `20261102120000_shops.sql` so ordered fresh installs apply dependencies first.
- `npm run pre:plan` could not contact the Management API without a terminal token. Ran its
  owner-only `pre_admin.refresh(false,true)` dry run through MCP in a REPEATABLE READ,
  READ ONLY transaction instead. No data refresh or replacement was performed.
- Hosted PRE migration `20261102112051_campaign_items_pre` used the canonical
  `pre_admin.remap` for application DDL and the shared Storage router unchanged.
- `hosted-pre-probe.sql`: real hosted PostgreSQL and Storage RLS with synthetic identities
  inside one rolled-back transaction. Passed creation without characters, image attachment,
  replay/stale rejection, cross-environment path denial, own/selected-shop reads, pending-image
  denial, Player/peer/outsider/other-DM/anon denials and Player equip/unequip with server AC.
- Then applied PROD `20261102112408_campaign_items`. Verified both image columns, private
  `item-images` bucket (1 MB, JPEG/PNG/WebP), authenticated RPC grant and anon denial. Existing
  production definitions stayed at 6; PRE stayed at 0; zero synthetic Auth users remained.
- Actual anonymous PostgREST calls to `set_item_image` returned HTTP 401 / SQLSTATE 42501
  in both schemas. No public application RPC was used for local gameplay testing.
- Security advisors report the existing default-deny/RPC-only table information and deliberate
  authenticated SECURITY DEFINER RPC warnings, now including `set_item_image`; its campaign DM
  check, empty search path, revision, path and object checks are covered by denial tests.
  The Google-only project's existing password-protection warning remains out of scope.
- `npm run db:types` could not run: no installed local CLI/stack was available to that script.
  The last generated file was preserved; the explicit RPC/table overlays were updated and
  checked against the hosted contract.

## Automated and rendered evidence

- `npm run check`: PASS, 105 tests (including 58 SQL tests), strict types, lint, architecture,
  documentation contracts and production build.
- Full `npm run test:e2e -- --workers=2`: PASS, 222 tests across desktop, tablet and phone.
- Subsequent focused runs cover the final equipment focus and partial shop retry corrections:
  campaign-items, inventory and shops: PASS, 69 tests. After the round-3 fixes, `npm run check`
  PASS (105 tests) and campaign-items, inventory, shops and characters E2E: PASS, 123 tests.
- New browser tests cover no-character creation, image preview/persistence/removal and retry,
  definition reuse in gifts/two shops, direct gold zero/cancel/stale, Player-only equipment,
  manual AC override, focus on failed/successful unequip and partial shop retries.
- Captures/axe cover ES/EN, dark/light, 390/820/1440 px, 150% text and reduced motion.
  Durable independent review captures and scripts are under `reviewer/`.
- `npm run format:check`: PASS after normalising Windows working-copy CRLF to LF. All 55
  initial failures were line-ending-only: HEAD versions and normalised text passed. This
  introduces no unrelated source-content changes. Git's index was not staged.

## Initial failures and corrections

1. Initial typecheck exposed translation entries inserted into the Spanish type import and
   the missing explicit RPC overlay; corrected before proceeding.
2. Initial PRE ETL tests failed because a SQL-language image helper resolved dependencies
   before the cloner had created them. Changed the helper to PL/pgSQL; all clone tests pass.
3. Initial hosted probe expected armour effects on an incomplete draft sheet. Prepared the
   fixture sheet using its normal RPC before asserting AC; probe then passed.
4. First browser run: 192/195 passed; three tests still targeted the old textbox role for a
   Mantine Select. Updated to its actual combobox role and the separated catalogue/gift flow.
5. New tests caught editor Escape focus loss; explicit focus restoration fixed it. An incorrect
   unequip label and a hash-router test navigation race were also corrected in the tests.
6. Independent review round 1 found direct unequip losing focus when its row disappeared.
   Fixed success callback to focus the socket, preserving the action on failure.
7. Independent review round 2 found native loading disabled the partial-shop retry button,
   dropping focus. Busy submits now use guarded aria-disabled/aria-busy plus a spinner;
   the shop error stays inside its drawer without a duplicate overlay toast.
8. Independent review round 3 confirmed that fix but found two P2s: at 390px/150% text the
   partial-add error sat below the sticky submit dock, and aria-disabled busy buttons looked
   enabled with an invisible accent-on-accent spinner (P3: same pattern on other busy
   buttons). The error now renders inside `.pick-dock`; global styles dim aria-disabled
   Mantine buttons, colour busy spinners with `currentColor` and dim disabled pick tiles.
9. Independent review round 4: **PASS** at fingerprint
   `d1b7c6574fd53a0cad8b2c7d209d1bb474ccb054dc6cc7be6f7e9109431ac63e`, recorded in
   `docs/evidence/ui-review-current.json`; the UI review check passes. Non-blocking P3
   notes: the dock takes 42% of the drawer at 390px/150% with an error; "Retry" wording on
   first submit in the give/add-to-shop actions; busy cursor resolves to not-allowed.

## Verification limits

HTTP browser fixtures are not live persisted data. The hosted SQL actor matrix is not an
OAuth/JWT browser login. A real two-account Google Player session and authenticated Storage
upload/download via its JWT have not been exercised in this delivery. Physical Safari/iOS
and screen-reader testing remain unverified. Frontend publication is not authorised here.

Independent UI/UX review is recorded in `reviewer/review.md`; the final source fingerprint
and result must match `docs/evidence/ui-review-current.json` before UI approval is claimed.

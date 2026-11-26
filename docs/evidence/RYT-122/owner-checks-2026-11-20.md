# Owner checks, 20 November 2026

What the owner tested by hand on the production site, and what was verified against the hosted
production project afterwards. Times are UTC.

## Reported by the owner

- Real sessions on https://rytta.pages.dev work. The owner did not list each piece, so the
  individual smoke items of RYT-122 (combat realtime for a Player, image upload, account export,
  party level, table screen, phone map, dice, concentration) stay unrecorded one by one.
- Sign-in on a real iPhone with Safari works, including the return from Google sign-in.
  Later the same day, on the iPhone, a second Google account accepted a DM invitation and lost
  access to the campaign when the DM revoked it (RYT-002).
- Google brand verification is still not approved. The reason shown by Google has not been
  recorded yet.

## Account deletion in production (RYT-115)

The owner signed in with a second Google account and deleted it from the app.

- 00:43:45 `prepare_account_deletion` and 00:43:46 `delete_my_account` answered 200 from iOS
  Safari (edge logs).
- The Auth user and its identity no longer exist.
- Auth users and profiles both count 8; no profile, storage object or user reference in the
  `public` and `private` schemas points to a missing Auth user.
- The Google consent screen, captured on 20 November 2026 with the signed-in account blurred
  ([capture](../RYT-115/google-consent-privacy-2026-11-20.png)), links the privacy policy to
  `https://rytta.pages.dev/#/privacy` and the terms to `https://rytta.pages.dev/#/terms`. It still
  names the Supabase project domain instead of Rytta, which brand verification should change.
- Likely cause of the failed brand verification: both links are hash routes. A crawler ignores the
  fragment, fetches the home page and finds no privacy policy without JavaScript. Serving the legal
  pages at real paths with static HTML (RYT-122) should fix it; the reason Google gives is still
  to be read.

## Official SRD pack (RYT-093)

- `srd-5-2-1` is public, owned by the owner's editor account, published 14 November 2026 at
  00:30, revision 3.
- 1,161 entries: 330 creatures, 339 spells, 232 features, 115 rules, 48 creature traits, 18
  skills, 15 conditions, 13 damage types, 12 actions, 10 properties, 8 masteries, 6 abilities,
  6 areas, 5 hazards, 3 attitudes and 1 table.

## Backup artifacts exposed while the repository was public (RYT-116)

- The repository went public again on 19 November 2026 at about 22:10 because GitHub Actions
  stopped starting on the private repository (billing limit).
- The daily backup workflow stored the production dump as a workflow artifact. Two artifacts
  (18 November 17:50 and 19 November 03:28, about 1.2 MB each, with Auth data) were
  downloadable by any signed-in GitHub user from about 22:10 until they were deleted on
  20 November at about 00:55. Whether anyone downloaded them cannot be confirmed.
- The backup workflow is disabled. It stays disabled until the dump is encrypted before upload
  or stored outside the public repository. Until then production has no copy.

## Release checklist closed (2026-11-26)

The owner closed RYT-122 in the session of 26 November 2026: the production checks recorded here
and the owner's own use of https://rytta.app since the launch on 24 November are the evidence, and
no further check was requested. The two privacy sentences the checklist waited for (RYT-147,
RYT-128) were approved the same day and are in the policy, effective 26 November 2026.

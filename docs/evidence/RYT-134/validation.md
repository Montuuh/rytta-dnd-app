# RYT-134 — Casting: "Lanzar" with slot choice and a concentration marker

Branch `sheet-casting`, head `11fd4d3`, rebased onto the dice branch (RYT-133). This delivery has a
backend part: migration `20261203120000_sheet_concentration.sql`, with SQL tests in
`tests/database/`.

## Commits

| Commit | Change |
|--------|--------|
| `9e5472e` | Cast from the sheet: slot choice, concentration marker in the hero, ritual casting and a manual way out |
| `6d8276a` | Migration `20261203120000_sheet_concentration.sql` and its database tests |
| `2b104b8` | First review fixes |
| `6c14540` | Migration hardening: character classes written as escapes, plain ASCII file |
| `cc9af44` | Migration hardening: an oversized value is refused before it is stored |
| `fcfdc8f` | Migration hardening: the escapes are built inside the database so the text survives any transport |
| `11fd4d3` | Second UI review fixes |

## Why a backend change

The ticket assumed the sheet play state could hold a concentration marker. It could not:

- `character_vitals` had no such field;
- `conditions` is constrained to the SRD condition keys;
- a tracker value cannot hold a spell name;
- rests drop unknown trackers.

Spending a slot was already safe: the existing save path checks the revision and carries a request
id. Only the marker needed a server change.

The migration:

- adds a nullable `concentration` text column to `character_vitals`;
- adds two trailing arguments with defaults to `set_character_vitals` (`change_concentration`,
  `new_concentration`), so the slot and the marker are written in one step;
- keeps the call made by the frontend already in production working; that call does not clear a
  marker;
- clears the marker in the server's long rest;
- returns the marker in the party overview under the same sharing rule as conditions;
- includes the marker in the history and in the data export.

## Migration hardening

- Invisible, zero-width, bidi and control characters are refused and Unicode spaces are trimmed.
  The function and the table check use the same expression.
- A value over 1024 bytes is refused before anything is stored. Reason: the raw value entered the
  stored idempotency payload.
- A notice lists any missing PRE objects.
- Character classes are written with an `@u` placeholder that the database turns into a backslash
  at execution. Reason: the first staging apply showed that the delivery path decodes backslash-u
  escapes for non-control code points before the SQL reaches the database. 50 of 64 escapes arrived
  as the characters themselves. The behaviour was equivalent, but the stored source differed from
  the commit. The file now contains no backslash and no non-ASCII character. Tests check both that
  and the escapes in the stored constraint and function.

## Independent security review

| Version | Verdict |
|---------|---------|
| First version | SAFE, three low findings, all addressed |
| Escape version | SAFE, one low finding (storage amplification), addressed in `cc9af44` |
| Placeholder version (`fcfdc8f`), the final form | SAFE |

## Local validation

| Check | Result |
|-------|--------|
| `npx vitest run tests/database` | 36 files, 406 tests |
| `npm run check` on `11fd4d3` | 109 files, 991 tests, build OK |
| `npm run test:e2e` on `9e5472e` | 1088 passed, 1 failed |
| `npm run test:e2e` on `2b104b8` | 1132 passed, 1 failed once |
| `npm run test:e2e` on `11fd4d3` | 1161 passed, 117 skipped, 0 failed |

PGlite tests are not hosted Supabase integration.

### Earlier browser failures on this branch

Recorded so the initial failures are not hidden.

- On `9e5472e`: a race in a dice test on the base branch. It was fixed there.
- On `2b104b8`: an existing touch-target measurement of the hit-point undo button at 150% text.
  It passed when run alone, was measured at 44px in 84 samples by the independent UI review and
  did not recur.

## Staging (`rytta-staging`)

- A pre-check of the regular expression classes matched the expected code points.
- The first apply is recorded as `20261118095759 sheet_concentration` with the decoded text. It is
  left in the history.
- The column and its check were dropped on the empty database. The corrected file was applied as
  `20261118100430 sheet_concentration_transport_safe`.
- The stored text is identical to the file (md5 and 32534 bytes). The escapes are intact in the
  constraint and in the function.
- There is one 15-argument function with two defaults. Grants are as before. RLS is on for 43 of 43
  public tables.
- Actor check in one rolled-back statement:
  - the old 13-argument call works and leaves the marker;
  - the new call spends a slot and sets the marker in one revision;
  - the marker can be cleared;
  - U+200B is refused;
  - 1025 bytes are refused with nothing written;
  - 100 astral characters are accepted;
  - an outsider gets Forbidden;
  - anon is denied;
  - a DM sets a trimmed value;
  - the Player's history shows the change;
  - all counts are zero afterwards.
- No new advisor findings.

Not verified on staging:

- the call over the real HTTP API and its schema cache reload;
- the PRE mirror (staging has no PRE);
- the long rest clearing the marker;
- the export output.

## Hosted production

Applied right before the merge, on 2026-11-18:

- Recorded as `20261118123502 sheet_concentration`. The stored text is identical to the committed
  file (md5 `3b0be2f3b1c635f0013232f6226d38b3`, 32534 bytes).
- Read-only verification in the production and PRE schemas:
  - `concentration` is text and nullable, null on every existing row;
  - a checksum of the play state over the pre-existing columns is identical before and after, in
    public and in PRE;
  - row counts unchanged: 15 and 2 play states, 636 and 33 character events, 311 and 19 stored
    requests, 8 accounts;
  - the escapes are intact in the constraint and in the function, with identical classes in both;
  - one 15-argument `set_character_vitals` per schema, with two defaults, security definer and an
    empty search_path;
  - grants as before: no anon, no PUBLIC; the two private functions are not executable by clients;
  - the PRE copies carry no production schema references;
  - RLS on every table;
  - the nightly pruning job is active.
- Call resolution:
  - the 13-named-argument call of the previous frontend resolves to the new function and is
    refused with `Forbidden` for a session without identity, writing nothing;
  - through the real HTTP API with the public key, both the 13-argument and the 15-argument calls
    resolve (answer: permission denied for anon), while a call with an unknown argument answers
    "function not found", before and after the apply.
- Advisors: nothing new beyond the known class for RPCs.

Not verified in production:

- behaviour with a real Player or DM session (set, clear, replay, long rest);
- the full denial matrix on the hosted database.

## Merge and release

PR 19 merged to `main` right after the apply (merge commit `953343a`); live at
https://rytta.pages.dev with that build id.

## Independent code review

On `9e5472e`:

- The migration and the client validation are correct.
- Changes required:
  - high: a retry after a lost reply could spend a second slot when the sheet refetched before the
    retry;
  - dialog state leaking between casts;
  - a marker with many astral characters making the sheet unreadable;
  - announcements made before the save;
  - smaller items.

All addressed in `2b104b8`. A browser test forces a refetch before the retry and checks that one
slot is spent with the same request id.

## Independent UI review

- CHANGES_REQUIRED on `9e5472e` / `70eb17c`:
  - a clipped "Terminar";
  - the hero marker at 150% text;
  - no visible confirmation after a cast;
  - the manual section above the list;
  - two different concentrations for one character during a fight.
- CHANGES_REQUIRED on `2b104b8`:
  - the pinned result note covering buttons;
  - a clipped "Deshacer".
- PASS on `11fd4d3`.

Automated accessibility checks are clean on every state in three themes.

Non-blocking leftovers, moved to RYT-135:

- when the cast spell is also the new concentration, the result note repeats the name;
- a teammate's concentration is not shown in the party plates;
- the group rest panel does not say that concentration ends;
- no dedicated browser test for a cast waiting on a manual tap.

## Decisions recorded during the delivery

- Any prepared spell with the Ritual tag can be cast as a ritual. This is the 2024 SRD rule this
  project ships.
- A plain cantrip, or a ritual without concentration, writes nothing and says so.
- The sheet's concentration marker and the fight's are separate. The fight's is kept by the DM
  console and drives the concentration reminder on damage. During a fight the sheet says that the
  DM keeps a separate record and asks the Player to tell the DM. One shared concentration is
  ticketed in RYT-139.

## Not verified

- Hosted Supabase through the real API with a signed-in session (the anonymous calls are
  recorded above).
- A real screen reader.
- WebKit and iOS.
- Real phones and tablets.
- Hosted realtime.
- English beyond reading the strings in the last pass.
- The cast flow as the DM in the last pass.

## Status

Done. Local checks, the staging apply, the production apply and its verification, the independent
security review SAFE on the final migration form, and the independent code and UI reviews are
recorded above. Merged to `main` (`953343a`) and live. Follow-ups are in RYT-135 and RYT-139.

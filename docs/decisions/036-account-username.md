# ADR 036: one username per account

Date: 2026-11-09. Status: accepted for RYT-078. Amends ADR 003 (identity and campaign
membership: the member name was the Google full name or the email).

## Context

The user asked for a username and for a decision between one username per account and one per
campaign. Until now a member's name was the Google profile's full name, falling back to the
email, and only DMs saw it (members list, Player preview picker, sheet history). Players are
already named inside each campaign by their characters.

## Options

| Option                                           | For                                                                                                                                  | Against                                                                                                                                       |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| A. One username per account                      | One choice, asked once; the same person is recognisable in every table; a stable handle to invite or mention later; one unique index | No per-table nickname                                                                                                                         |
| B. One username per campaign                     | A different nickname per table                                                                                                       | Asked again on every join; unique only inside a campaign, so it cannot identify a person; duplicates the job characters already do; more RPCs |
| C. Account username + optional campaign nickname | Both                                                                                                                                 | Two names to explain and keep in step; nothing in the product needs it yet                                                                    |

## Decision

**A. One username per account.** In-campaign identity belongs to characters (ADR 004, ADR 035);
the username names the person behind them. A per-campaign nickname can be added later on
`campaign_members` without changing this model.

- `public.profiles(user_id, username, updated_at)`: one row per auth user, deleted with the user.
  3–24 characters `[A-Za-z0-9_]`, case kept for display, unique on `lower(username)`. A short
  list of names the interface uses for roles or the system is reserved (`admin`, `dm`, `rytta`…).
- RLS on, no client grants: the table is reached only through security-definer RPCs.
  `get_my_username()`, `username_available(candidate)` (format, reserved, held by someone else)
  and `set_my_username(new_username)` (create or change; `Username taken`, `Username reserved`,
  `Invalid username`). Anon executes none. Nobody reads another user's row directly; a name is
  only shown where a name was already shown (DM-only RPCs below), so availability answers
  "is this name free", never "who holds it".
- `private.member_name(user)` is the single display rule: username, else Google full name, else
  email. `list_campaign_members` and `get_character_history` use it with unchanged signatures,
  grants and authorization.
- The migration mirrors itself into an existing PRE with `pre_admin.remap`; PRE profiles are
  separate rows (a PRE refresh copies PROD's, as for every table).

### Interface

- **Settings drawer:** "Your username" is the first section for a signed-in account, with the
  field, a fixed status line (`aria-live="polite"`) for the format rule, availability (checked
  after a 350 ms pause), the current name, errors and the saved confirmation, and "Save username".
- **Hub prompt:** while the account has no username, the campaigns hub shows a card above the
  campaigns: what the name is for, the field prefilled with a suggestion from the email (accents
  dropped, padded to 3 characters, never reserved), "Use this name" and "Later". "Later" holds for
  the browser session; the prompt never blocks the hub.
- **Account menu:** the username above the email.
- Errors are inline under the field and tied to it (`aria-invalid`, `aria-describedby`); the
  server stays authoritative for taken and reserved names.

## Consequences

- Inviting by username, showing usernames to Players and per-campaign nicknames are possible
  follow-ups; none is implemented here.
- There is no rate limit on changing a username and no history of old names.

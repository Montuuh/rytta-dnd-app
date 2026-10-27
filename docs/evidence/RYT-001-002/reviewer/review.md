# Independent UI/UX review: RYT-001 and RYT-002

Verdict: PASS

Reviewer: `ui-ux`, independent implementation-read-only subagent.
Reviewed at: 2026-10-27.
Source digest: `6bc82848d71c005333324b9318761b2757c56815b7ce31295b970a25831af958`.

## Scope and method

Read the canonical agent contract, frontend rules, design system, UI-review workflow,
architecture, ADR 003, assigned backlog criteria and delivery verification record.
Independently calculated the source fingerprint before and after browser inspection;
both matched the digest above. No implementation or permission source was modified.

Inspected the actual built application at
`http://127.0.0.1:4180/rytta-dnd-app/` using Chromium/Playwright. Public Supabase HTTP
responses were intercepted with the existing identity fixture before navigation.
This executes the actual production UI and SDK; it is not hosted Auth verification.
Actual captured PNGs were opened and visually inspected in addition to browser assertions.

## Independently exercised scenarios

- A 24-screen matrix: 390x844 and 820x1180 touch viewports, Spanish and English,
  dark and light, 150% root text, and reduced motion, across campaign hub, members and
  signed-out views. The 24 axe WCAG A/AA audits returned no violations.
- Hub and member screens had no horizontal document overflow in all 16 combinations.
  Visible hub/member buttons, links and inputs were measured: no targets below 44px
  in either dimension. Long text reflow, button wrapping and campaign/member hierarchy
  remained readable in the inspected captures.
- Create campaign dialog: initial focus on campaign name, keyboard activation, focus
  containment with Shift+Tab, Escape dismissal and return to the trigger. Created a
  campaign through the keyboard-driven dialog and saw the new campaign card.
- Member role confirmation: opened the promotion dialog, dismissed with Escape and
  verified trigger focus return in every viewport/language/theme combination.
- Last-DM guard: leaving is disabled and the successor explanation is rendered. Member
  role badges remain textual, so authorization presentation does not rely on color alone.
- Invited-player confirmation: declined an invitation explicitly and observed the
  empty invitation state. The hub retains invitation access alongside existing campaigns.
- Player view: DM invite/management controls are absent; leaving is available. Opened
  the mobile navigation drawer, dismissed with Escape and verified focus return.
- Member removal: inspected the non-destructive confirmation copy, confirmed removal
  and observed the member disappear from the list.
- Empty campaign state explains both creation and invitation paths. Slow campaign load
  displays a status and resolves to data. Failed refresh hides previously cached campaign
  cards and offers Retry. Invalid callback displays a useful restart message and removes
  provider error text from the URL.
- Offline view displays the stale-data explanation. An attempted offline invitation
  displays an actionable failure. An additional axe audit of this state had no violations.
- Sign-out closes the private member screen and leaves the Google sign-in action available.
  Sign-in copy clearly describes automatic account creation. Invitation copy explicitly
  explains that delivery is in Rytta and no email notification is sent.

## Visual evidence

All paths below are relative to this review directory:

- `390-hub-dark-150.png`, `390-hub-light-150.png`.
- `820-hub-dark-150.png`, `820-hub-light-150.png`.
- `390-members-dark-150.png`, `390-members-light-150.png`.
- `820-members-dark-150.png`, `820-members-light-150.png`.
- `390-create-dark-150.png`, `820-create-dark-150.png`.
- `390-sign-in-dark-150.png`, `390-sign-in-light-150.png` and tablet equivalents.
- `390-empty.png`, `390-query-error.png`, `390-player.png`, `390-auth-error.png`.
- `820-loading.png` (initial application loading), `820-campaign-loading.png` (campaign loading).
- `390-offline-error.png`.

Reviewed hierarchy is consistent with the field-journal palette. Campaign selection and
creation are distinct; role labels, current campaign and switching are legible. The expanded
mobile layout needs vertical scrolling at 150% text but does not obscure actions or overlap
content. Dark/light content and field contrast passed the audited states and visual checks.

## Findings and limitations

No unresolved blocking UI/UX findings were observed in the reviewed snapshot.

Two initial review-script checks needed selector corrections: a required field's exact label
match and a loading assertion that matched two concurrent status regions. Both were harness
issues, not application defects; corrected checks passed. No product failure was suppressed.

The integrator reports 73 full-suite browser passes with 2 intentional non-mobile drawer
skips, and 34 unit/SQL passes. Those full suites were not rerun by this reviewer; this report
records the independent browser matrix and focused scenarios described above.

Not verified here: real Google consent screens/accounts, hosted Supabase JWT/Auth/PostgREST,
schema deployment, server-side invitation expiration or authorization correctness, concurrent
membership operations, real iOS Safari, a screen-reader session, or hardware keyboards on
physical phones/tablets. Database policy acceptance and hosted multi-account integration
remain separate gates. This UI verdict does not mark RYT-001/RYT-002 integration complete
or authorize deployment.

# UI design flow

Every new screen, component or meaningful redesign follows this flow. It wraps the
implementation step of `rytta-feature` and ends in the mandatory [UI/UX review](ui-review.md).
The user set this flow as a standing instruction: agents apply it without being asked.

Small fixes (copy, translations, a single bug, token tweaks) may skip phases 1–2; say so in the
delivery report. Phases 4–5 still apply to any rendered change, scoped to what changed.

## 1. Design brief (`ui-ux-pro-max`)

Before writing UI code, invoke the `ui-ux-pro-max` skill with a written brief:

- What is being built: ticket, user role (DM, player, table display), the job it serves at the
  table and the states it must cover (loading, empty, error, forbidden, demo).
- Context: in-person play, phone at 390px and tablet at 820px, dim rooms, touch first,
  44px targets, both themes and both languages.
- Constraints: Mantine, the semantic tokens and widgets in [design-system.md](design-system.md),
  the active class theme, no raw HTML, no unlicensed rules or art.
- **Explicit emphasis: do not overuse pills, badges or generic buttons.** Prefer widgets that
  carry meaning for the domain, such as stat blocks, trackers, pips, steppers, segmented
  meters, inline editable values, cards with a clear primary action, sheets and drawers.
  A pill is for a compact state or filter; a button is for an action, and each view keeps one
  clear primary action.

Keep the resulting direction (layout, hierarchy, widget choices, the pills/buttons it avoided
and why) in the delivery report or `docs/evidence/RYT-xxx/`.

## 2. Refinement with frontend skills

Refine that direction with `frontend-design` (and `ui-ux-pro-max:ui-styling` or
`design-skills:interaction-design` where useful) for modern widgets, typography, motion and
microinteractions that fit the field-journal identity. Stay inside Mantine and the project
tokens: borrow ideas, not another component library or a template look.

## 3. Implementation

Implement with `rytta-feature` and run the usual checks, captures and keyboard checks.

## 4. Design analysis (`impeccable`)

On the rendered result, run the `impeccable` skill: `critique` for hierarchy, layout and
composition, and `audit` for accessibility, responsiveness and edge cases. Add `polish`,
`simplify` or `harden` when the findings call for it. Check specifically for pill and generic
button overuse. Fix the material findings, recapture and record what was found and changed.

## 5. Independent review

Request the `ui-ux` review as in [ui-review.md](ui-review.md). That PASS stays the gate.

## Tool availability

`ui-ux-pro-max`, `frontend-design` and `impeccable` are Claude Code plugins. In Codex, Cursor or a
host without them, apply the same criteria by hand and report the plugin steps as not run.
Never claim a skill ran when it did not.

# ADR 008: campaign home and compact global settings

Date: 2026-10-28. Status: accepted for RYT-019.

The user's browser review requested a simpler campaign home, clearer join-campaign area,
a hamburger menu sized to its one action, and conventional appearance icons.

The account control in the header remains the single location for campaign-home navigation
and logout. Remove the redundant account block from the home content. Invitations belong
in a distinct panel: title and explanation, refresh, pending invitation actions or a useful
empty state, followed by the recipient email. Existing loading/error/retry, acceptance,
decline confirmation and refresh behavior remain intact. There is no new invitation code
or public campaign discovery mechanism.

Replace the global right-hand full-height drawer decision in ADR 006 with a Mantine Menu
anchored below the hamburger. Its height follows its contents, currently one Settings item.
Keep the large centered preferences dialog, close the menu before opening it, and restore
focus to the hamburger when the dialog closes. Campaign navigation still has its own drawer.

Use Lucide moon/sun icons in the existing native radio-based appearance selector, with
localized screen-reader labels, selected state, keyboard operation and 44px targets.
Language selection and local persistence are unchanged. No database or permissions change.

See [delivery evidence](../evidence/RYT-019/validation.md) for checks, captures and the
independent review of the final source snapshot.

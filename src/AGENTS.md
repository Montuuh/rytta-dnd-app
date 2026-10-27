# Frontend rules

Follow root AGENTS.md. Read docs/design-system.md for changes to rendered UI.
Keep Supabase SDK imports inside shared/api or a feature data adapter.
Keep server state in TanStack Query; local interaction state stays in React.
When auth ships, include identity in private query keys and clear caches on identity changes.
Use semantic links for navigation, buttons for actions and visible error/retry states.
Do not install a second UI kit, state manager or form system without an ADR.
Use typed translation keys for interface text; Spanish is the default. Preserve user content.
Use semantic theme tokens and support dark (default) and light in every component.
Invoke ui-ux after interface changes and record its verdict per docs/ui-review.md.

# ADR 002: Appearance, localization and UI review

Date: 2026-10-27. Status: accepted. Delivery: RYT-016.

The user requested selectable dark/light (dark default), Spanish/English (Spanish default)
and a UI/UX expert called after interface changes.

Use Mantine's color-scheme manager with a project-specific localStorage key and semantic
CSS palette tokens. Validate the pre-paint preference so initial rendering matches the
selected theme. Do not infer system light mode as the initial preference.

Use i18next/react-i18next, with both catalogs bundled for offline availability and immediate
switching. Typed keys and catalog parity checks prevent missing translations. Store only
the supported language code locally, fail back to Spanish and update document language/title.
Backend errors are mapped to stable domain codes and localized in the view; private/raw
server messages are not displayed. User-authored names/descriptions remain untouched.

Create native ui-ux role instructions and integrate their invocation in the implementation
workflow. The user's request authorizes this recurring review after UI deliveries, without
authorizing arbitrary parallel implementation. Record the independent verdict and source
fingerprint; CI rejects stale/missing review. The consistency check cannot prove reviewer
execution and must never be used to fabricate approval. No unattended model service is added.

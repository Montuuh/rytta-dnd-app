# Design system

A quiet field journal: warm paper, forest green, serif headings and readable system-font
body text. Clear hierarchy suits dim tables and short mobile visits. This shell is the
foundation, not final design approval for every gameplay screen.

## Appearance and language

Dark is the first-visit default, regardless of the OS preference. The warm hearth palette
uses background #140F0B, surface #1E1610, raised surface #2A1F16, warm cream text #F5EBD6,
secondary sand text #CBB699 and amber/orange accents #EDA145. Warm gold #F6C478 is the focus
indicator. Filled amber controls use deep espresso text #181009, including their hover state.

Light mode uses warm parchment #F7EFE2, surface #FFFDF9, text #2A1C11, secondary text #664F3A
and roasted chestnut accents (#6E3410 for primary buttons, #974D13 secondary). Focus uses
#844112. Both palettes preserve the same hierarchy; the palette is a product choice verified
with contrast tests. The dark values are the default Hearth theme and the light values are
Parchment; every theme owns one scheme (RYT-069, ADR 034).

Semantic tokens live in src/app/styles.css and feed Mantine variables. Avoid hardcoded
light backgrounds or white text on pale dark-mode accents. The header has no left sidebar.
Row 1 shows the logo, the RYTTA brand and the campaign name, plus a DM `Player view` switch
and a unified Profile menu (My campaigns, App setup, Sign out). Theme and language are changed
only in the Settings drawer (RYT-033, RYT-069, ADR 021, ADR 034). Tablets and laptops show reachable modules in a second row: one non-wrapping,
scrollable line. Phones (< 48em) use a fixed bottom bar with up to five destinations; when
there are more, the extras go in a `More` drawer. Planned modules are never navigation items.
They fold into the campaign home `Coming soon` accordion and the DM module switch list. A
sticky banner marks the Player preview. All controls have 44px targets. Preferences persist
locally and remain usable in memory if storage is blocked (ADR 015).

## Type scale and layout

Use the fluid tokens instead of literal sizes: `--fs-display` (HP), `--fs-h1..h3`,
`--fs-stat` (stat values), `--fs-body` (16px; never shrink body copy on phones),
`--fs-meta` (14px) and `--fs-tag` (12px minimum for badges and labels). Badges are sentence
case. Content width is `--content-max` (1280px); DM layouts use 1360px. Reuse
`RefreshControl` for refresh actions (icon button plus a relative timestamp, visible on tablets and laptops and announced on phones),
`PullToRefresh` as a touch-only addition, `useLongPress` for ×5 steppers, `Switch` for
visibility toggles, `Chip` for multi-select states, pips for spendable uses and `Tabs` for
panels that are shown one at a time.

Spanish is the first-visit language even on English browsers. English is selectable.
Use src/shared/i18n catalogs and typed keys for visible text, accessible names, loading,
empty/error states and route titles. Update the document language. Never machine-translate
user campaign content. Sample campaign copy is localized because it is application-owned.

Mantine is the single component kit: accessible dialogs/drawers, forms, menus, tabs,
notifications and layout. Lucide supplies icons. Reuse official patterns rather than
maintaining duplicate widgets or adding Tailwind/shadcn alongside Mantine.

Theme tokens: src/app/theme.ts. Layout: src/app/styles.css. Keep campaign art optional;
the compass is decorative. Self-host future fonts and document licenses.

## Interaction

- Prioritize glanceable resources and the next useful action.
- Minimum 44px touch targets; essential information cannot depend on hover.
- Focus trapping, Escape and return focus for overlays; focus content on navigation.
- Preserve reduced motion, text zoom, landmarks and heading hierarchy.
- Show loading, empty, error, forbidden, stale and offline states where relevant.
- No fake mutations. Planned screens clearly say they are planned.
- WCAG AA contrast; never convey roles/status by color alone.

## Verification

Playwright covers an 820px tablet and a 390px touch phone profile; 1440px desktop runs the demo specs and the signed-in specs with wide-layout assertions.
Inspect captures and exercise keyboard, drawer/Escape, direct links, 150% text and reduced motion.
Axe supplements visual/touch review; mobile Chromium emulation does not verify iOS Safari.
Every interface change gets an independent UI review.

## DM tools and item lists (RYT-027)

The DM Command Center is a home board plus panels in three groups (At the table, Party, Settings).
Panels are links with a current-page mark, in a side navigation from 48em and in a sheet opened
from the panel name on phones, never tabs (ADR 056); counts are numerals in the row, and the home
keeps one filled action, the live encounter.
DM-only tools live in the DM Command Center panels (`?panel=` deep links), not in separate
navigation items. Item collections use dense 64px rows (rarity-tinted icon, name, one meta
line, icon actions) with an optional compact grid. Actions that fit stay as 44px icon buttons
with accessible names; on phones they fold into one ⋯ menu. Avoid stacks of plain text
buttons on cards. Campaign pages share one width for every role.

Amounts (RYT-104, ADR 043): every gp field is the inventory `GpInput`: two decimals, the
interface language's separator, the decimal keypad on phones, and half-typed decimals ("12,")
kept until they parse. Weights are `WeightFields`: one fieldset with two linked fields (the
reader's unit first, "=" between, 1 lb = 0.5 kg); editing either updates the other. Shop images
(RYT-107, ADR 044) are a header banner of fixed aspect, at most 260px or a third of the viewport tall, with the name on a fixed dark scrim and
cream ink in every theme, never a page background; the picture is its own button to the image
viewer.

## Settings and themes (RYT-033, RYT-069)

Settings is a right-hand drawer opened from the profile menu, the single home for language
and theme (RYT-069, ADR 034). It is a medium panel (`calc(min(100vw - 1.5rem, 30rem))`) over
the current screen; the route and title stay, Escape or the 44px close button closes it and
focus returns to the profile button. Old `#/settings` links open it over the home screen. The
drawer title is the h2; each preference is a section with an h3 and one line of help, then one
radio group: Language first, then Weight (kg or lb, RYT-104), then Theme. Radio cards are native radios kept in the
accessibility tree and painted as cards (`.choice-card`). They have a 1px border, a 2px accent
border plus a check badge when selected (never color alone), a 3px `--app-focus` ring on
keyboard focus and at least 56px of height. Arrow keys move the selection, and Tab moves
between groups. Do not reintroduce quick toggles in the profile menu or elsewhere.

- Language: Español and English cards with a language-tagged label, side by side when a name
  fits whole and stacked on narrow phones or at enlarged text (names never break inside a word).
- Theme: one radio group of 14 swatch tiles split into a Dark and a Light subgroup
  (`role="group"`, an h4 with a moon or sun glyph and a one-line hint). There is no separate
  light/dark switch: each theme owns its scheme (ADR 034). Each tile is painted in its own
  theme's background, border and text, with a round seal in the theme's surface showing the
  class glyph in the accent and a secondary ring, and the name below; the tagline is the
  radio's screen-reader description. Tiles are at least 4.75rem wide: five a row in the drawer,
  four on phones, fewer at 150% text. The glyphs are Lucide icons: Compass, Music, HandHeart,
  Leaf, Swords, HandFist, ShieldHalf, BowArrow, VenetianMask, Flame, Feather, Axe, Eye and
  WandSparkles.

Dark themes: Hearth (default, campfire amber), Bard (velvet and rose), Cleric (radiant gold),
Druid (moss and bark), Fighter (tempered steel), Monk (saffron and jade), Paladin (gold and
silver), Ranger (forest and leather), Rogue (charcoal and crimson) and Sorcerer (dragonfire).
Light themes: Parchment (ink on paper), Barbarian (blood and embers), Warlock (eldritch violet)
and Wizard (arcane blue). Each class sits in the scheme where its color reads best (ADR 034).

How it works:

- Source of truth: `src/shared/theme/class-themes.ts`. Each theme has a `scheme`, a Mantine
  10-shade palette (lightest first) tuned for that scheme and one token set covering `--app-bg`,
  `--app-surface`, `--app-raised`, `--app-hover`, `--app-border`, `--app-hero`, `--app-text`,
  `--app-muted`, `--app-accent`, `--app-accent-secondary`, `--app-focus` and `--app-on-accent`.
  Dark themes also override Mantine's `dark-4..8` slots.
- `--app-accent` is always the Mantine filled shade: `palette[3]` in dark themes and
  `palette[8]` in light themes. Filled primary controls use `--app-on-accent` text. Light
  palettes keep their tints in shades 1–2 for Mantine's light variants.
- `src/app/class-themes.css` is generated. Do not edit it by hand. After changing the
  source, run `UPDATE_THEME_CSS=1 npx vitest run tests/unit/class-themes.test.ts`. Hearth and
  Parchment stay in the base blocks of `src/app/styles.css`, and the test keeps them equal.
- Applied as `html[data-rytta-theme]` together with `data-mantine-color-scheme`, which always
  follows the theme. The `index.html` bootstrap sets both before the first paint, the theme
  store sets both on change and `MantineProvider` gets `forceColorScheme`. One effect in
  `providers.tsx` keeps `<meta name="theme-color">` equal to the theme background. The theme
  persists in `localStorage['rytta-theme']`. Invalid values fall back to `default`; a legacy
  `rytta-color-scheme` of `light` with the default theme becomes Parchment. Blocked storage
  keeps the choice in memory.
- Contrast is enforced in `tests/unit/class-themes.test.ts` for each theme in its own scheme.
  Text, muted, accent and secondary accent need 4.5:1 on bg, surface, raised and hero.
  On-accent needs 4.5:1 on the accent and on the filled hover shade, and Mantine's light and
  outline variants need 4.5:1. The focus ring needs 3:1 on every surface. A new theme must
  pass this test, and axe on Settings, before it ships.
- Never hardcode a theme color in components. Use the tokens. Resource and status colors
  (gold, water, rations, danger, success, rarity) keep their meaning across themes.

## Primary action and selection (RYT-151)

The filled accent marks one action per screen: the one the DM uses at the table. Item
storeroom: Distribute loot (New item outlined, Manage catalogue a quiet link). Members: Invite
player; Set level N is outlined and enabled only when the stepper differs from the campaign's
level. Shops: Add item (New shop outlined). Combat: the fight-flow button (Start, Next turn);
adding party members or creatures uses the light variant. Bestiary: Add to encounter in the
stat block (New creature light). Dialogs and drawers are their own screen with their own fill.

Selection is never the fill. The selected command-centre tab, shop, segment or pressed toggle
uses accent ink on `--app-select-tint` with a 3px rail (`--select-rail`, vertical lists) or
underline (`--select-underline`, tabs, tiles and segments). A pressed `.category-chip` adds
an accent outline and a check in place of its glyph. Shared pieces in `src/app/styles.css`:
`.ink-segments` for a row of views (current one with `aria-current`), `.select-toggle` for
an `aria-pressed` button and `.tabular` for figures. States such as the acting combatant's
initiative or a spent use follow the same ink-and-outline treatment.

An icon-only control that gives, shows to the group, cancels or deletes carries a visible verb
(Add, Remove) or sits in a named ⋯ menu; the cross only closes. Hit points, gold and initiative
use tabular figures with their unit (PG/HP, po/gp, a visible or visually hidden "Initiative").

## Page heads, phone overlays and destructive actions (RYT-035)

Every page starts with `PageHead`: the h1, one short lede, primary actions and the
`RefreshControl` on one band (ADR 023). On phones the refresh button sits beside the h1 and its
relative timestamp is announced through `aria-describedby` instead of a separate visible row;
pages whose frame already names them (the DM Command Center panels) hide the lede and the
repeated panel title on phones. Inside a
campaign the phone header drops the RYTTA wordmark for the campaign name, and bottom-bar labels
stay on one line. Keep ledes to one line on laptops. Overlays that mount on
open use `usePhone`/`useWide` so phones never paint the desktop variant first. Destructive and
dismissive actions (remove, reject, decline, leave) use `color="red"` with the subtle, light or
outline variant; they map to `--danger`. Visibility toggles are labelled switches. Read-only
exhaustion is a dot meter; the DM gets six 44px numbered pips on one row.

## Glossary (RYT-008)

The glossary reads like a field dictionary: serif headwords and rules text, a quiet sans UI.

- Search is the page's lead element: one large serif field (press `/`), Enter opens the best
  match, ArrowDown/ArrowUp move through the results, Escape clears or returns to search. The
  field owns its value and mirrors it to the URL (`?q=`) after a short pause. Categories are underlined `Tabs`
  with counts. Results are ranked; without a query the index is alphabetical with a thumb index
  (44px letter targets, one Tab stop with arrow keys) and sticky letter rules. No card grids or pills.
- From 62em the index and the reader sit side by side; below, the reader is its own route with
  a back link. Entries show category glyph, headword, the other language's name as a gloss,
  a stat-block "At a glance" list (Lucide icons, ruled like a monster stat block), the rules
  text, house rules in a gold callout, the 2014 rule in an Accordion and the SRD page.
- Inline terms anywhere: dotted accent underline, no background, 44px hit area via a
  pseudo-element. They open the reference sheet (bottom sheet on phones that hugs its content
  up to 86dvh, side sheet from 48em, z-index above other drawers). The headword is the dialog
  title and takes focus on every move through nested terms. Never wrap a term inside another
  control.
- Homebrew uses a side drawer form (full-height sheet on phones) with a sticky footer: delete icon
  at the left, Cancel and Save changes at the right. Entry actions are 44px icon buttons (pencil,
  red trash, each with a tooltip and a named accessible label) on the kind line of a homebrew
  entry and on the title row of a house rule inside an SRD entry; from phones (< 48em) they fold
  into one ⋯ menu. An SRD entry offers a single "Add a house rule" icon. The reference sheet
  shows edit and delete for homebrew definitions; the editor and the delete modal open above the
  sheet (z-index 410), Escape closes only the topmost, and focus returns to the control that
  opened them. Delete asks in a modal titled with the entry name, Cancel holds the initial focus
  and the red `light` confirm names the action. A stale revision shows a recoverable conflict
  alert (load the current version or save yours over it). Saving moves focus to the saved
  headword instead of showing a toast (top-right toasts would cover entry actions).

## Combat tokens and health bands (RYT-043)

Combatants stand on tokens, the bases of tabletop miniatures (ADR 027). The shape carries the side:
round party, rounded-square ally, hexagonal enemy, crenellated keep for the lair; the rim uses the
side's status colour (`--info`, `--success`, `--danger`, muted). Rows carry no extra side glyph: the
skull is reserved for defeated and dead. The image (portrait or bestiary image) is cropped to the
shape; without one, a monogram of up to two initials in the heading face (a castle glyph for the
lair) sits on a radial wash of the rim colour and is decorative. In order rows AC closes the name
line and moves under the name when it needs the room; the hit point value and the band phrase never
break inside, so the full-width bar keeps its length on phones. The acting token's rim becomes `--app-accent` with a
soft glow; defeated tokens use a grey rim and a colourless image; tokens hidden from Players have a
broken rim (DM only). Sizes come from `--token-size` set by the context: 44px in the console order
(36px on phones),
60px in the table order (44px on phones), 56–104px for "Now" in the table banner, 36px in the turn
bar (hidden below 30em) and recap rows, 64px in the bestiary and 72px in the DM detail (a creature
with art opens on its plate instead, below).

Health without exact numbers is a band, never a bar: a 26px seal (36px in the table, 32px on
phones) with one glyph per band (heart, heart minus, droplets, cracked heart, heart off, skull, eye
off) and the band's name in `--app-text`. The seal ring and glyph take the band tone; near death is
the only filled seal. "Not shared" stays quiet (meta size, muted, small seal) because it marks
missing information. Exact hit points keep the proportional bar, numbers and band word.

The bestiary token is its own image picker: a visually hidden file input labelled "Add an image of
…" / "Change the image of …", the token as its label, a camera seal on the rim and the focus ring
around the token. Progress and success are announced; failures appear under the card.

## Bestiary (ADR 028)

The bestiary is a DM Command Center panel (`?panel=bestiary`, `&creature=` deep link), never a
navigation item. It reads like a field guide: a large search first (both languages, accents ignored,
Enter opens the best match, ArrowDown enters the list, `/` focuses it from anywhere on the panel)
with the Filters button beside it (active count; popover from 48em, bottom drawer on phones: CR
range slider, type and size chips, sort), then a source segmented control (all, SRD, campaign,
favourites) and the live count on one row. Active filters and a CR sort show below as removable
44px chips that name what they remove ("Remove the Dragon filter"); removing one keeps focus on the
next chip or returns it to Filters (RYT-050). Without a query the list reads like an index: serif
letter rules by name or CR rules when sorted by challenge, each with its size (sticky inside the
laptop list); a query keeps the ranked order without rules. Rows are 60px buttons with a hexagonal
token (campaign creatures keep their side's shape and image), the name, the other language's name on
its own italic line, one meta line (type · size · AC · HP) and a fixed CR chip on the row's edge;
only campaign creatures carry a source badge. The star is a separate 44px toggle. Arrow keys, Home
and End move through rows across groups.

From 62em the stat block sits beside the sticky list, its action bar pinned to the top of the
viewport while the block scrolls; below it opens in a full-screen bottom sheet
titled "Bestiary" with a sticky action bar (add to an encounter first). The stat block is ruled like a
printed one: core numbers between accent rules, six ability tiles (score, modifier, save; the full
reading is visually hidden text), detail lines, section headings in the accent and italic entry names;
rules terms and spells link to the glossary. SRD blocks show their page and licence; the panel ends
with the official SRD 5.2.1 statement and Rytta's adaptations.

Dialogs that open from the sheet stack above it (z-index 400; their menus 410–420). The editor is a
full-screen modal on phones and a wide one from 62em with the live preview beside the form (a
segmented switch below), accordion sections, entries with 44px move and remove buttons and a sticky
footer with the balance hint ("numbers like CR x–y") and Save.

Bestiary instruments (RYT-051, ADR 029) replace generic pills, segmented controls and selects:
painted tile groups over native radios or checkboxes (accent border, inset ring and a check seal),
type tiles with a glyph per creature type, a size scale of miniature bases drawn to scale, a side
toggle that shows the token shape, number dials (serif value between 44px steppers; hold for ±5), a
CR spin button with a ladder and XP/PB, choice cards for hit points and sort, CR bands under the
Filters slider, a token stack for the count and a seal for saving throw proficiency. Favourites are
a bookmark ribbon. Selects stay only for long textual lists (SRD creature, trait library, usage).

Critique pass (RYT-052): on phones and tablets the search row sticks to the top of the panel while
the list scrolls, and the filters sheet keeps Clear and "Show N creatures" in a sticky footer. List
tokens without an image show the creature type's glyph instead of initials. Add to an encounter asks
for the encounter, the count and hit points; side, table name, hidden and shared initiative fold under
"Table options" with a one-line summary. The submit names the target ("Add 3 to Crypt") and the
success state shows the tokens, the hit point mode and visibility. Customise is the one way to copy an
SRD creature (its editor title says what it is based on); Duplicate stays for campaign creatures.
Notices avoid gendered participles ("Saved to the bestiary: X."). Delete says it cannot be undone. Console trackers are 44px: a recharge toggle with a
battery glyph and its state in words, and daily uses as numbered round pips (crossed when spent).

Creature art (RYT-053, RYT-088, ADR 030): every SRD creature shows its painted art in its list
token, and the stat block leads with it as a plate: the print on the raised mat (12px, inset hairline)
held by four 16px accent photo corners, full width above the name on phones (at most 416px or 44svh).
From a 31rem pane (RYT-091) the plate sits beside the name and the core numbers (hit points on their
own row) and the rest of the stat block runs underneath at full width; from 44rem it leads a stat
column with the core numbers and the abilities beside the reading, which stays in view in sheets
when it fits between the header and the action bar (on short sheets the abilities lead the reading
and the plate shrinks). In dark themes list
thumbnails and prints are toned down slightly. The print is a button that opens the viewer; a 44px
round pencil in the mat's corner changes the image, or opens a short menu (change, then restore the
original art for an SRD creature with the DM's image, or remove the image of a campaign creature,
which asks first). Without any image the token beside the name stays the file picker with the filled
accent seal. Saving, saved and removed notices show in words under the plate or token. The DM's
combat detail opens on a 112px portrait (88px on phones; dimmed when defeated, dashed when hidden)
that opens the viewer. Creature art opens in the shared image viewer (below) with a museum label as
its caption: italic terms for author, licence and source in 44px rows, underlined links with an
external-link glyph and "opens in a new tab" for screen readers, and the adaptation note. The DM's
own image says it is the campaign's; when it cannot load, the viewer shows the bundled art with its
credit, as the token does. The plate's print develops from sepia in 220ms unless motion is reduced.
One quiet action, Change image, sits at the foot of the viewer. Escape and close return focus to the
print. No licence badges or art pills.

## Image viewer (RYT-098)

Every real picture (character portraits, creature art and tokens, item pictures) opens the same
full-screen viewer, `ImageViewer` in `src/shared/ui`: a dark curtain that looks the same in every
theme (its colours are custom properties in `image-viewer.css`; the app and Mantine tokens are
redeclared inside it with the Hearth values), the whole picture centred with `object-fit: contain` and
never cropped, a bar with the name in the heading face, a 44px zoom toggle (`aria-pressed`) and a 44px
close button, an optional caption under the picture (a creature's credit) and optional actions at
the foot (Change portrait and Remove portrait with an inline question, Change image). A double tap or
double click zooms 2× where it lands and back; while zoomed a drag pans; two fingers pinch between 1×
and 4×. The zoom resets when it closes and has no animation with reduced motion. It shows a loader
while a signed address arrives and one sentence when the picture is missing or broken. Escape closes
only the topmost viewer, also over a drawer or sheet, and focus returns to the picture that opened it.

The picture is its own button (at least 44px, `aria-haspopup="dialog"`, "View the portrait of …" or
"View the image of …"), never nested in another control. Where a picture sat inside a row or card
that acts (bestiary rows, shop listings, the DM's stock rows) it moves beside that button, which keeps
its action; without a picture the glyph stays inside. Thumbnails under 44px inside a dense control
(satchel tiles and rows, paper doll sockets, initiative rows, the turn bar, roster chips, rest
accordion rows) stay as they are: the drawer or detail they open has the viewable picture. Monograms
and icon fallbacks are never buttons. The tabletop board does not use it.

## Encounter builder (RYT-054, ADR 031)

A draft (and an encounter collecting initiative) shows a difficulty card under the flow strip of the
DM console, labelled "Encounter difficulty" for screen readers. It reads like an instrument, not a
slider or a progress bar with chips: a 44px seal with the band's glyph (scale: no enemies, feather:
Low, swords: Moderate, flame: High, skull: over High, the only filled seal) beside the band as an h2
in the heading face, then one reading line in tabular numbers ("1100 de 1500 PX; quedan 400"; Spanish groups thousands from five digits).
Numbers use the interface language, and a no-break space keeps each number with its unit.

The gauge is a ruled track on a fixed scale (a quarter past the party's High budget): three notches
for the Low, Moderate and High budgets, each band's word in italics in the middle of its own stretch
(Low and High below, Moderate above, so they never collide) with "up to N" under it from 30em, the
spent XP as the fill and a 3px pointer with a caret (moved by transform), and the stretch beyond High
hatched in `--danger`. A fight beyond the scale pins the pointer at the end with a chevron.

Below sit the party it is measured against, the one action "Suggest creatures" (light variant; full
width on phones, under the reading where the thumb is; beside the reading from 48em; replaced by a
quiet line once the High budget is spent), SRD notes as margin notes (italic heading face, a pen
glyph in the secondary accent and a hairline above; never alert boxes or a thick side rule; a note
also names characters without a sheet) and a quiet 44px disclosure for the party and creature
ledgers (hairline-ruled rows, tabular XP, not-counted rows in italics with the reason in words) and
the SRD source line. "Ask for initiative" stays the console's primary action. One polite live region
announces changes from anywhere, never the first reading; the add notice is plain text and leaves
with the next change of the draft.

The suggestion dialog (full screen on phones) keeps its choices between openings. Difficulty uses
bestiary tiles that show the XP left ("Already reached" and disabled otherwise): three columns from
48em, one row each on phones and with large text. Kinds are choice tiles with a glyph, title and help
(two columns on phones with the help visually hidden); "A leader and its band" is always one leader
with two or more lesser creatures of its type. The creature type is a select with type glyphs and a
real "Any type" option; until the DM picks one it follows the most common enemy type in the draft.
"Other ideas" sits beside the Ideas heading, announces how many new ideas came and stays
`aria-disabled` once there are none. Idea cards show overlapping hexagon tokens, the composition as
the heading, one line per creature with its type glyph, CR and XP, the total and the resulting band,
and one "Add" button whose accessible name carries the composition and the encounter. Buttons stay
focusable while saving (`aria-disabled`), so a failure keeps focus where it was. The dialog unmounts
on close and returns focus to "Suggest creatures"; a successful add closes it and shows the notice.

## Tabletop (RYT-055–063, ADR 032)

The map is the hero; the chrome around it stays quiet. The DM's tabletop (library and editor) is the one
section whose main area spans the window from 48em, with a small fluid gutter; the header and navigation
keep the shell's measure, and the dock grows a little on wide screens (RYT-063). On the DM board each
room carries a key: a small parchment plate with a sepia serif numeral above the fog, in the first
corner of the room (top-left first, then the centre) that holds no note, event or token, so it never covers
what the DM placed. Generated passages are reveal areas
numbered apart (P1, P2…); their dashed, italic keys appear only while the DM uses Fog or has a door or an
event selected, and the reveal list groups rooms and passages. Props on painted maps are painted
sprites (a centred contact shadow, a warm halo for lights); on ink maps and parchment grids they stay
line drawings, so each map keeps one visual language (RYT-064). Painted props with a picture made for
them (RYT-066, [generated sprite art](sprite-art.md)) use it: seen from above, lit from overhead, at their
real share of their squares, mirrored or turned a quarter by item so repeats differ, and shown together
once decoded; the others keep the drawn sprite until their pictures exist, and a picture that fails to
load falls back to it. The look travels with the table projection
(never the recipe), so the table and phones match the DM. On uploaded maps the picture already draws its
doors: Rytta shows the DM dashed handles only and the table nothing extra. The Universal VTT preview tints
each fog area with its number (sized to the picture), draws the file's doors and says what is not imported
(RYT-065). The DM editor has a compact head (back, the scene
name in the serif, the "On the table" seal or the one primary action "Put on the table", "Move the table
here" and "Open the table screen"), then the option strip, the board and the dock. The tool kit is one
radio group of square keys (glyph, word and the key letter engraved in a corner): a left rail from 62em,
one row of nine keys under the board on portrait tablets, and a bottom tray of five keys plus "More" on
phones. Arrows, Home and End move the choice; the letters V, M, A, F, D, N, E, P and X work while focus is
in the editor, outside text fields (entering the editor focuses its title). The option strip shows only the
active tool's instruments (painted tiles, number dials, switches, the measuring readout with feet as a large
serif figure); on phones it is one scrolling row so the board keeps its height.

Panels (Tokens, Props, Story, Audio, Scene) open from disclosure keys (`aria-expanded`): beside the board
from 75em, as a sheet floating over the board from 62em, below the board on portrait tablets, and as a
bottom drawer at 75dvh on phones. The selection opens the
inspector in the same place; door toggles never open the phone sheet. The board is one Tab stop with a
square cursor: arrows move it (Shift: five squares) and announce what is there, Enter does what a tap does
with the current tool, and with Select it opens the item's inspector and moves focus to its heading
(Escape returns to the board). Delete removes and H hides what is under the cursor, or the selection; Undo
follows a removal. Items are named buttons but not Tab stops. Tokens and props also move by drag (snapped)
or by "Move to a square", which waits for a tap or the cursor; areas turn with two 15° keys. Two fingers pan
and zoom in every tool; one finger acts with the tool; the zoom keys sit outside the board element.

The table frame (RYT-075) is the TV's calibrated size, drawn on the DM board as a dashed amber
rectangle. Its tab moves it: drag the tab, or tap it and then a square (Escape cancels). The tab is
grip dots and "Table · cols × rows", at least 40 px tall at any zoom, outside the frame. While the frame
moves, what the table will not show is dimmed. It snaps to whole squares inside the map. It is
prepared before the scene goes on the table, and once there it moves the table screen. "Move the table
here" centres it on the board cursor, and a frame as large as the map is only a label. Deleting a scene
(RYT-076) sits in the plate's menu after a divider and always confirms in a dialog that names the scene
and what goes with it.

Placing a prop (RYT-077) shows the chosen prop at 62 % on a dashed footprint, under the pointer or the
cursor, or under the finger and placed on release. The preview is the exact picture and turn that will
be placed. The option strip, never an overlay on the board, holds the prop's name, its turn (two
quarter-turn keys, R and Shift+R), "Another version", "Change prop" and "Done".

Board art: ink-on-parchment and painted map looks, original line-art props
(2.5px outlines at 64px per square), tokens in the combat token shapes with a name plate and a breathing
amber double ring for the active turn (static with reduced motion), translucent fog for the DM and opaque
fog with paper fibre and feathered edges on the table and phones, an amber measuring tape over a dark halo
with a diamond per counted square, and areas filled at 28 % in their damage colour with corner ticks on
caught squares and the shape and damage named in words. The table screen has no chrome: the map at the
calibrated scale, a small status corner (scene, connection in words, ruler, mute and Leave), a turn
plate while a fight is live (below), a start overlay for the one tap browsers need, and story cards on a
parchment plate set large.

## Level up (RYT-130)

The DM sets the party level in the DM Command Center (Party level panel): a shield seal with the level,
a 44px −/value/+ stepper that starts at the highest finished sheet, and one confirmation that says
what the change does (raising prompts the Players, lowering or clearing only stops the prompts; no
sheet changes). Each request carries one id, so the retry after a failure never applies twice. A
line counts the finished characters still below the level.

A Player below the party level sees one prompt on the sheet with a single action. It opens the
guided level-up: a full-screen sheet on phones and a modal from 48em, owned by the overlay wrappers
(Back and Escape close it, focus returns to the prompt or the sheet name). Four steps with a
segmented progress bar and a sticky footer: hit points (hit-die average plus Constitution, or a
typed roll within the die, with the new maximum), what the level grants (class features by name with
glossary links, resources, proficiency bonus, spell slots), the required choices (subclass,
ability increase or feat, new spells; status in words and an icon, never colour alone) and a
review. The confirm stays unavailable while a choice is missing and writes everything in one
transactional call; a failure leaves the character unchanged and the same button retries the same
request. After the write the sheet shows what changed. The manual level field of a finished sheet
is replaced by the locked value and a pointer for Players; the DM keeps the stepper.

## The table screen for combat (RYT-131, ADR 046)

One chrome-less screen at `#/campaign/:id/tabletop-table`, read-only, for every member of the campaign.
It reads the table projection only, so hidden creatures, real names behind an alias and DM fields are
never in the page, whoever opens it. The way in is a "Table screen" link: in the header of the fight's
table view for Players (same tab; focus returns to the link on the way back) and in the bar above both
views for the DM (a new tab, so a stray key on a shared display never reaches the DM's interface).
Escape or the "Leave the table screen" key in the status bar (44px, always visible) goes back to where
it was opened; a screen opened on its own closes its tab, or goes to the campaign where the browser
refuses. Leaving ends full screen. Escape first closes the ruler or the browser's full screen. The
order screen has a "Full screen" key in the bar. A Player whose DM has not opened the map module is
refused the map once: the screen shows the order, makes no further map calls beyond a slow re-check,
opens no map channel and shows no start card; with no fight it says no fight is running, and a
network failure of the fight says so with a retry.

- With a scene on the table: the map fills the screen and the turn plate sits over a corner while a
  fight is live. The plate is a raised surface in the semantic tokens with an accent border (so it
  reads over any map in Hearth and in Parchment): the round, a 44px move key and a 44px shrink key,
  then "Now" (token and name in the serif) and "Up next" under a hairline. It moves by dragging the
  move key (it follows the pointer and snaps to the corner it is released in), by the arrow keys on
  that key, or by pressing it (next corner clockwise); each move is said in a live region. Shrinking
  keeps the acting name alone. A hidden creature's turn shows only "Hidden turn", and collecting
  initiative shows how many are ready. The corner and size live in `localStorage['rytta-table-plate']`
  and fall back to top left and full size when storage is blocked. Bottom corners stay above the
  status bar. On a table turned 180 degrees the arrow keys and the named corner follow the screen,
  not the plate's own frame. Position changes are instant, so reduced motion has nothing to cut. A
  stale plate has a dashed border and an "offline" strip; the age stays in the status bar. Names take
  at most two lines and break at word boundaries; "Hidden turn" never wraps. The ruler's distance
  readout sits at the top centre, clear of the corners.
- Without a scene (or where the Player's DM has not opened the map): the order is the screen, in the
  semantic tokens of the chosen theme. A header carries the fight, the round, "Now" in display size
  (up to 5rem) and "Up next". Below, the whole turn order reads down two or three columns
  (`orderLayout`: one column up to 4 combatants, two up to 10, three beyond that from 1000px; a tablet
  keeps two). Each row is as tall as the screen allows (container units), so 16 combatants fit without
  scrolling at 1280x720, 1920x1080 and 820x1180, with names from 26px to 40px; a longer order scrolls
  and the acting row is scrolled into view. The acting row has a chevron, bold weight, the raised mat
  and a ruled accent bar, never colour alone. Names take at most two lines at word boundaries and then
  end in an ellipsis (the full name is the tooltip and the accessible name), so a row never spills
  into the next one or under the status bar, also at 150% text; tokens scale with the row. Below
  640px the order is one column read in rows. The list is a Tab stop so a long order can be scrolled
  by keyboard. Defeated rows are struck through with a skull and the word. Initiative totals sit at the row's edge with a visually hidden "Initiative N".
- Each turn change (and each new round) is announced once by a polite live region, emptied just before
  each sentence so two turns with the same words are both read out ("Arin's turn, round
  2"; a hidden creature's turn is announced without a name). The first state after opening is not
  announced. The full-screen strip reserved by `scrollbar-gutter` is off while the screen is open.

## The map on a phone (RYT-132, ADR 046)

On a phone (under 48em wide, or a short screen up to 60em wide, so landscape too) the Player's map at
`#/campaign/:id/tabletop` is the page: the header, notices and bottom bar are removed, not covered, and
the page does not scroll. A compact turn strip (semantic tokens, 56px) leads: a 44px back link to the
campaign, "Now" with the acting token and name, "Up next", and the round. On the Player's own turn the
strip turns to the accent and says "Your turn!" with a glyph (never colour alone); a hidden creature's
turn says only "Hidden turn"; collecting initiative shows how many are ready; stale data adds a dashed
rule and an "offline" line. With no fight the strip names the scene. The map fills the rest edge to
edge (no frame, no radius) and keeps pan, pinch and wheel zoom. Three round 48px keys float at the
thumb's edge, over the map, in this order: centre on my token (fits the map when the Player has no
token), measure (a toggle that opens the existing measure; a chip at the bottom left gives the hint,
the distance and "Clear") and, only for a token the DM lets act on the map, effects (the existing
effects list in a bottom sheet). Centring puts the token and its name in the largest area the keys
leave free, at a zoom where tokens read, so it never sits under a key (`centreOnToken`). Focus is a
3px ring; Back closes the measure or the sheet before it leaves the page, and Escape does the same.
Name plates, the acting ring and the measuring readout keep their size on screen at every zoom
(`--tt-label-k`, the inverse of the zoom). Tablets and laptops keep the page layout. The phone map
reads the Player projection only: hidden creatures, notes, events, secret doors, the room list and
fog stay as hidden as on the page layout.

RYT-132 review changes: the map opens on the own token at a zoom where the map covers the screen
(covering the screen, centred, when the Player has no token); it keeps the world point at its centre
across rotation and a layout switch. Name plates appear from a zoom where a square can hold them
(`labelMinZoom`), are at most three squares wide, and give way to the tokens' monograms below it.
Long names and scene titles end in an ellipsis (the full text stays in the page); the strip reflows
without overlap at large text (round first, then "next" on its own row). Notices that ask for
something (a rest vote, leaving the Player view) stay, right under the strip, and the update notice
moves to the top. The page chrome is removed by `html.tt-pm-mode`, a class the map sets itself.
Decision (RYT-135): the round keys stay on the right edge, with no setting to move them. The measure
readout sits at the opposite corner, so the two never share a side, and every key is a secondary way of
doing what a finger on the map already does (pan, pinch, tap). Only the "fit the map" job of the first key
has a keyboard equivalent (`0`); "centre on my token" has none yet, and the arrows pan from wherever the view is. A per-device switch would add a setting for three
secondary keys; revisit it if left-handed Players ask for it.

The first round key always has a way to the whole map: it fits the map, and once fitted it centres on
the Player's token again (its name and icon change with what it will do). The board is a keyboard stop on
the phone map: `+` and `-` zoom, `0` fits the map (as in the editor). Without a token of the Player's,
the map opens framing the tokens on the table (the whole map when there are none). Name plates are one
line with an ellipsis, at most two squares wide, and show from 0.9 zoom up. The notices stack under the
strip (preview and rest first, then the update notice); on a phone on its side they share one scrolling
row and the update notice moves to the bottom left. While initiative is collected, the Player's own
roll is the main line and "n of m ready" the small one.

RYT-135 polish: the board is a keyboard stop at every width and announces its keys (`aria-keyshortcuts`
and a description): the arrows pan the map by 96px, `+` and `-` zoom, `0` fits (while measuring the arrows
move the cursor, as before). Its focus ring is a 3px border drawn above the map on all four edges. On a
phone a long name keeps its trailing number outside the ellipsis ("Goblin arquero 14" and "… 15" stay
apart), and a token right above another wears its name plate inside its own foot instead of covering the
token below. On its side, the update notice stacks above the measure readout while it shows.

## Dice (RYT-133, ADR 046)

The DM sets the table's dice in the DM Command Center, panel "Dice": two groups of exclusive rows (how
the table rolls: physical dice, dice in the app, each Player chooses; who sees the rolls: the roller and
the DM, the whole table, only the roller). Each row is a 44px label with a mark, the choice and what it
means; the radio is visually hidden and the checked row takes the accent border. A change shows one
button, then one confirmation that lists what changes and what it does to earlier rolls; failures
focus the reason and the retry repeats the same request. "Each Player chooses" is kept on the Player's
device (`rytta-dice-choice:<user>:<campaign>` in localStorage, in memory for the session where storage
is blocked): a two-way control "Physical / In the app" on the sheet, the initiative entry and the hit
dice, physical until it is used.

In app mode Rytta rolls: the server rolls (`log_roll` with source `app`) and its dice and total are the
only ones there are. Typed results (physical mode) are stored as `recorded`; the result card and the
strip say which it was ("Rolled by Rytta" / "Recorded"). The 3D engine cannot land on chosen faces, so
the dice are decoration: a short tumble that fades out while the dice are still in the air, started
beside the request; the result appears in the card when the server has answered. With reduced motion
nothing is animated and the engine is not loaded. A request that fails shows nothing rolled and, for a
network failure or the rate limit, a retry that repeats the same request id (the server returns the
roll it already made). When the DM has changed the mode, the refusal says so, the campaign is read
again and the sheet switches.

A rollable number on the sheet is the number itself with a solid accent underline (the glossary keeps
its dotted one), a 44px target, never a chip or a button face. With physical dice the number reads as
what to roll (`d20 + 5`, `1d8 + 3`; `d20+5` inside the ability medals) and a tap opens a dialog where
the dice are typed and checked; with dice in the app the modifier stays and a tap rolls. Its accessible
name holds what is on screen plus what a tap does. Checks, saves, skills, attack, damage and two-handed
damage lines are rollable; a flat damage (unarmed without a die) is not. The result is one card, under
the abilities or at the foot of the open block: total in the display face, the dice and the modifier,
the formula, and the source and the visibility the roll was stored with. It is announced from a status
region that is always mounted. The recent rolls strip lists the newest three (the rest in a drawer),
refetched on the realtime signal with polling behind it; it shows what the database returns and
nothing else, and credits "DM" only to a roll with no character. Labels of checks and saves are stored
as keys and read in the viewer's language.

## Casting spells (RYT-134, ADR 046)

"Lanzar" is a quiet 44px text action on each cantrip and prepared spell, never a bar of filled
buttons. A levelled spell opens a dialog that offers only the slot levels from the spell's own up
that still have a slot (pact slots as the one pact level); a spell with no usable slot shows a
muted reason instead of a button. A concentration spell says it will be marked on the sheet and
names the marker it replaces. A cast is one write: it spends the slot and sets the marker
together, and a failure leaves the sheet as it was with the alert inside the dialog and a retry
that resends the same request.

- Rituals: any prepared spell with the Ritual tag can be cast as a ritual and spends no slot (the
  2024 SRD rule, no spellbook needed). A ritual that marks nothing writes nothing.
- The marker lives in the sheet hero, wraps at large text (two lines, then an ellipsis) and ends
  by hand with a short undo. The table-ruling edit (mark or end it, any slot by hand) sits below
  the spell list behind "Concentración a mano".
- The result of a cast shows in a note that stays in view at the top of the spell list, with
  what was spent and what is left; level headings show the slots left.
- The encounter tracks the combatant's concentration apart from the sheet. During a live
  encounter the hero and the dialog say the DM keeps a separate record.

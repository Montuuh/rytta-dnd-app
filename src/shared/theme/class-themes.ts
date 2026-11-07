/**
 * RYT-033 class themes, reworked in RYT-069: the single source of truth for every theme palette
 * and semantic token. Each theme owns one color scheme, chosen by how well its class color reads
 * on dark or light backgrounds (ADR 034); the scheme follows the theme and is never chosen apart.
 * Hearth (default) and Parchment mirror the base tokens in src/app/styles.css; every other theme
 * is rendered into src/app/class-themes.css by `renderClassThemeCss`. A unit test keeps that file
 * in sync and verifies WCAG AA contrast for every theme.
 */
export const classThemeIds = [
  'default',
  'bard',
  'cleric',
  'druid',
  'fighter',
  'monk',
  'paladin',
  'ranger',
  'rogue',
  'sorcerer',
  'parchment',
  'barbarian',
  'warlock',
  'wizard',
] as const

export type ClassThemeId = (typeof classThemeIds)[number]
export type ColorSchemeName = 'dark' | 'light'

/** Unknown or legacy stored values recover to the default theme. */
export function normalizeClassTheme(value: unknown): ClassThemeId {
  return classThemeIds.find((id) => id === value) ?? 'default'
}

/**
 * Before RYT-069 the color scheme was a separate preference (`rytta-color-scheme`). A visitor who
 * kept the default theme in light mode moves to Parchment, its light twin; any class keeps its
 * class, which now carries its own scheme.
 */
export function resolveClassTheme(stored: unknown, legacyScheme: unknown): ClassThemeId {
  const id = normalizeClassTheme(stored)
  return id === 'default' && legacyScheme === 'light' ? 'parchment' : id
}

/** Semantic tokens; each maps to an `--app-*` custom property. */
export type ThemeTokens = {
  bg: string
  surface: string
  raised: string
  /** Hover fill for neutral controls (Mantine dark-5 in dark mode). */
  hover: string
  border: string
  hero: string
  text: string
  muted: string
  /** Equals the Mantine primary filled shade: palette[3] in dark, palette[8] in light. */
  accent: string
  accentSecondary: string
  focus: string
  onAccent: string
}

type Palette = readonly [
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
]

export type ClassTheme = {
  /** The one color scheme this theme is drawn for. */
  scheme: ColorSchemeName
  /** Mantine 10-shade primary palette, lightest first, tuned for the theme's scheme. */
  palette: Palette
  tokens: ThemeTokens
}

/** Mantine primary shade per scheme; the accent token must equal palette[shade]. */
export const primaryShade = { light: 8, dark: 3 } as const

/** Mantine palette name per theme. Hearth and Parchment share the historical `forest` palette. */
export function paletteName(id: ClassThemeId) {
  return id === 'default' || id === 'parchment' ? 'forest' : id
}

export const classThemes: Record<ClassThemeId, ClassTheme> = {
  /** Hearth: the warm amber default for dim tables. */
  default: {
    scheme: 'dark',
    palette: [
      '#fdf5e8',
      '#faead1',
      '#f6c478',
      '#eda145',
      '#d9822b',
      '#bf6919',
      '#9e5114',
      '#844112',
      '#6e3410',
      '#57280b',
    ],
    tokens: {
      bg: '#140f0b',
      surface: '#1e1610',
      raised: '#2a1f16',
      hover: '#3a2a1e',
      border: '#4d3828',
      hero: '#281d14',
      text: '#f5ebd6',
      muted: '#cbb699',
      accent: '#eda145',
      accentSecondary: '#f6c478',
      focus: '#f6c478',
      onAccent: '#181009',
    },
  },
  bard: {
    scheme: 'dark',
    palette: [
      '#fef1f6',
      '#ffddec',
      '#ffafd4',
      '#fe7fc0',
      '#e266a7',
      '#c74c8e',
      '#ab3276',
      '#90145f',
      '#75004b',
      '#560136',
    ],
    tokens: {
      bg: '#140d11',
      surface: '#1d1419',
      raised: '#2a1d24',
      hover: '#382831',
      border: '#4e3844',
      hero: '#281720',
      text: '#f8eaf1',
      muted: '#d3b8c6',
      accent: '#fe7fc0',
      accentSecondary: '#ffb3b8',
      focus: '#ffafd4',
      onAccent: '#160c11',
    },
  },
  cleric: {
    scheme: 'dark',
    palette: [
      '#fff4dd',
      '#fce6b6',
      '#f4cb6f',
      '#d9b255',
      '#c0983a',
      '#a68018',
      '#8b6902',
      '#6f5300',
      '#584100',
      '#413002',
    ],
    tokens: {
      bg: '#110f0b',
      surface: '#1a1711',
      raised: '#252119',
      hover: '#322d23',
      border: '#453f31',
      hero: '#211c11',
      text: '#f2eee5',
      muted: '#c7c0af',
      accent: '#d9b255',
      accentSecondary: '#edc291',
      focus: '#f4cb6f',
      onAccent: '#120f08',
    },
  },
  druid: {
    scheme: 'dark',
    palette: [
      '#e8fdde',
      '#d4f3c3',
      '#a5de86',
      '#8cc36d',
      '#74aa54',
      '#5d913c',
      '#467922',
      '#306101',
      '#244b00',
      '#183700',
    ],
    tokens: {
      bg: '#0c110b',
      surface: '#131911',
      raised: '#1c241a',
      hover: '#263124',
      border: '#364433',
      hero: '#152112',
      text: '#e8f2e6',
      muted: '#b5c7b2',
      accent: '#8cc36d',
      accentSecondary: '#d8cc87',
      focus: '#a5de86',
      onAccent: '#0b1209',
    },
  },
  fighter: {
    scheme: 'dark',
    palette: [
      '#eef6fe',
      '#d9eafa',
      '#b6d5f0',
      '#9dbbd6',
      '#85a2bc',
      '#6d8aa3',
      '#56728a',
      '#405b72',
      '#2d485e',
      '#1b354b',
    ],
    tokens: {
      bg: '#0c1013',
      surface: '#13181c',
      raised: '#1c2228',
      hover: '#272f36',
      border: '#37414a',
      hero: '#151e25',
      text: '#e9eff5',
      muted: '#b6c3ce',
      accent: '#9dbbd6',
      accentSecondary: '#b0d1de',
      focus: '#b6d5f0',
      onAccent: '#0b1014',
    },
  },
  monk: {
    scheme: 'dark',
    palette: [
      '#fef4e4',
      '#fee4bc',
      '#ffcf83',
      '#f5af20',
      '#d79700',
      '#b78006',
      '#996a03',
      '#7c5500',
      '#634403',
      '#4c3301',
    ],
    tokens: {
      bg: '#0a1111',
      surface: '#0f1919',
      raised: '#182424',
      hover: '#203131',
      border: '#2e4544',
      hero: '#0d2121',
      text: '#e4f2f1',
      muted: '#adc7c6',
      accent: '#f5af20',
      accentSecondary: '#80ded7',
      focus: '#ffcf83',
      onAccent: '#071212',
    },
  },
  paladin: {
    scheme: 'dark',
    palette: [
      '#fdf6d4',
      '#f4e9b2',
      '#f2dc70',
      '#d7c155',
      '#bea838',
      '#a48f13',
      '#8a7707',
      '#706003',
      '#5a4d02',
      '#453a00',
    ],
    tokens: {
      bg: '#0e1011',
      surface: '#15171a',
      raised: '#1f2225',
      hover: '#2a2e33',
      border: '#3b4046',
      hero: '#191d22',
      text: '#ebeff3',
      muted: '#bbc2c9',
      accent: '#d7c155',
      accentSecondary: '#a8cff7',
      focus: '#f2dc70',
      onAccent: '#0d1012',
    },
  },
  ranger: {
    scheme: 'dark',
    palette: [
      '#e5fcea',
      '#cef3d6',
      '#9ce1ae',
      '#82c795',
      '#69ad7c',
      '#519465',
      '#397c4e',
      '#1f6538',
      '#005126',
      '#023b1b',
    ],
    tokens: {
      bg: '#0f100a',
      surface: '#161810',
      raised: '#202318',
      hover: '#2c3022',
      border: '#3d4230',
      hero: '#1b1f0f',
      text: '#edf0e4',
      muted: '#bec4ae',
      accent: '#82c795',
      accentSecondary: '#f3be97',
      focus: '#9ce1ae',
      onAccent: '#0e1108',
    },
  },
  rogue: {
    scheme: 'dark',
    palette: [
      '#fef2f3',
      '#fedfe2',
      '#fea4ae',
      '#ff748b',
      '#e75572',
      '#ca3a5b',
      '#ae1a44',
      '#8d0032',
      '#6d0025',
      '#4e0018',
    ],
    tokens: {
      bg: '#0f0f11',
      surface: '#171719',
      raised: '#212124',
      hover: '#2d2e31',
      border: '#3f3f43',
      hero: '#1c1d20',
      text: '#eeeef1',
      muted: '#c0c0c5',
      accent: '#ff748b',
      accentSecondary: '#c8c9d8',
      focus: '#fea4ae',
      onAccent: '#0f0f11',
    },
  },
  sorcerer: {
    scheme: 'dark',
    palette: [
      '#fef2ed',
      '#fee1d4',
      '#ffb798',
      '#ff8f5a',
      '#ef6c22',
      '#cf5604',
      '#ab4501',
      '#883500',
      '#6b2800',
      '#4f1c00',
    ],
    tokens: {
      bg: '#150d0c',
      surface: '#1f1412',
      raised: '#2b1e1b',
      hover: '#3b2925',
      border: '#513934',
      hero: '#2a1713',
      text: '#faeae7',
      muted: '#d7b9b3',
      accent: '#ff8f5a',
      accentSecondary: '#feb5b1',
      focus: '#ffb798',
      onAccent: '#170c0a',
    },
  },
  /** Parchment: the neutral light theme (the former default light tokens). */
  parchment: {
    scheme: 'light',
    palette: [
      '#fdf5e8',
      '#faead1',
      '#f6c478',
      '#eda145',
      '#d9822b',
      '#bf6919',
      '#9e5114',
      '#844112',
      '#6e3410',
      '#57280b',
    ],
    tokens: {
      bg: '#f7efe2',
      surface: '#fffdf9',
      raised: '#efe3cf',
      hover: '#e8d9c1',
      border: '#d8c4a8',
      hero: '#ecdec6',
      text: '#2a1c11',
      muted: '#664f3a',
      accent: '#6e3410',
      accentSecondary: '#974d13',
      focus: '#844112',
      onAccent: '#ffffff',
    },
  },
  barbarian: {
    scheme: 'light',
    palette: [
      '#fff2f0',
      '#fee0dc',
      '#fe9c91',
      '#ff6b60',
      '#e54d45',
      '#c9302d',
      '#bf2024',
      '#b5111a',
      '#ac0311',
      '#86010b',
    ],
    tokens: {
      bg: '#fcf1ef',
      surface: '#fffdfd',
      raised: '#f5e3e1',
      hover: '#eed8d6',
      border: '#e1c7c4',
      hero: '#f8dddb',
      text: '#2c1a18',
      muted: '#674a47',
      accent: '#ac0311',
      accentSecondary: '#873d02',
      focus: '#c9302d',
      onAccent: '#ffffff',
    },
  },
  warlock: {
    scheme: 'light',
    palette: [
      '#f6f3fe',
      '#ebe3fe',
      '#d6c2fe',
      '#c29fff',
      '#ad7ff4',
      '#9466d8',
      '#8c5ed0',
      '#8455c7',
      '#7d4dbe',
      '#6635a3',
    ],
    tokens: {
      bg: '#f4f2fb',
      surface: '#fefdff',
      raised: '#eae5f4',
      hover: '#e0dbec',
      border: '#d0cadf',
      hero: '#e9e3f7',
      text: '#211c2b',
      muted: '#564e66',
      accent: '#7d4dbe',
      accentSecondary: '#026548',
      focus: '#9466d8',
      onAccent: '#ffffff',
    },
  },
  wizard: {
    scheme: 'light',
    palette: [
      '#f1f5fe',
      '#dce9fe',
      '#b4cffe',
      '#8bb4fe',
      '#6799f7',
      '#4f80dc',
      '#3967c1',
      '#2e5bb4',
      '#224fa7',
      '#0f3a90',
    ],
    tokens: {
      bg: '#eff4fc',
      surface: '#fdfdff',
      raised: '#e1e8f6',
      hover: '#d5deee',
      border: '#c3cee2',
      hero: '#dae5f9',
      text: '#171f2e',
      muted: '#465369',
      accent: '#224fa7',
      accentSecondary: '#036169',
      focus: '#3967c1',
      onAccent: '#ffffff',
    },
  },
}

export const tokenCssNames: Record<keyof ThemeTokens, string> = {
  bg: '--app-bg',
  surface: '--app-surface',
  raised: '--app-raised',
  hover: '--app-hover',
  border: '--app-border',
  hero: '--app-hero',
  text: '--app-text',
  muted: '--app-muted',
  accent: '--app-accent',
  accentSecondary: '--app-accent-secondary',
  focus: '--app-focus',
  onAccent: '--app-on-accent',
}

/** Mantine dark palette slots that paint inputs, menus and hovers in dark mode. */
const mantineDarkSlots: [string, keyof ThemeTokens][] = [
  ['--mantine-color-dark-4', 'border'],
  ['--mantine-color-dark-5', 'hover'],
  ['--mantine-color-dark-6', 'raised'],
  ['--mantine-color-dark-7', 'surface'],
  ['--mantine-color-dark-8', 'bg'],
]

function declarations(tokens: ThemeTokens, extra: [string, string][] = []) {
  return [
    ...(Object.keys(tokenCssNames) as (keyof ThemeTokens)[]).map(
      (key) => `  ${tokenCssNames[key]}: ${tokens[key]};`,
    ),
    ...extra.map(([name, value]) => `  ${name}: ${value};`),
  ].join('\n')
}

/** The scheme a theme is drawn for; the app's color scheme always follows the theme. */
export function themeScheme(id: ClassThemeId): ColorSchemeName {
  return classThemes[id].scheme
}

/** Themes of one scheme, in gallery order. */
export function themesOfScheme(scheme: ColorSchemeName): ClassThemeId[] {
  return classThemeIds.filter((id) => classThemes[id].scheme === scheme)
}

/** Hearth and Parchment are the base tokens in styles.css; the rest are generated. */
const baseThemes: ClassThemeId[] = ['default', 'parchment']

/**
 * Renders the CSS for every class theme. Each block also names its scheme so a theme's tokens
 * only ever paint the scheme they were contrast-tested for.
 */
export function renderClassThemeCss(): string {
  const blocks = classThemeIds
    .filter((id) => !baseThemes.includes(id))
    .map((id) => {
      const { scheme, tokens } = classThemes[id]
      if (scheme === 'light')
        return `html[data-rytta-theme='${id}'][data-mantine-color-scheme='light'] {\n${declarations(tokens)}\n}`
      const darkSlots = mantineDarkSlots.map(([name, key]): [string, string] => [name, tokens[key]])
      return `html[data-rytta-theme='${id}']:not([data-mantine-color-scheme='light']) {\n${declarations(tokens, darkSlots)}\n}`
    })
  return `/* Generated from src/shared/theme/class-themes.ts (RYT-033, RYT-069). Do not edit by hand. */\n${blocks.join('\n')}\n`
}

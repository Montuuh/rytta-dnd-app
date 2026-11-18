import { readFileSync } from 'node:fs'
import { DEFAULT_THEME } from '@mantine/core'
import { describe, expect, it } from 'vitest'
import { classThemeIds, classThemes } from '../../src/shared/theme/class-themes.ts'

// RYT-133 review: Mantine's own field error red failed 4.5:1 in Hearth (3.56:1) and Parchment
// (2.87:1). Every scheme now takes the app's `--danger` token; this keeps it legible on every
// theme's surfaces and on the field backgrounds Mantine draws.
const css = readFileSync(new URL('../../src/app/styles.css', import.meta.url), 'utf8')
const channel = (value: number) => {
  const c = value / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}
const luminance = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  return 0.2126 * channel(n >> 16) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}
/** The `--danger` value declared in the base block of a scheme. */
const danger = (scheme: 'dark' | 'light') => {
  const block =
    scheme === 'dark'
      ? css.slice(0, css.indexOf("html[data-mantine-color-scheme='light'] {"))
      : css.slice(css.indexOf("html[data-mantine-color-scheme='light'] {"))
  return /--danger:\s*(#[0-9a-f]{6})/i.exec(block)![1]!
}

describe('field errors use the accessible error token in every scheme', () => {
  it('points Mantine’s error colour at --danger for dark and light', () => {
    expect(css).toMatch(
      /html\[data-mantine-color-scheme\]:root\s*\{[^}]*--mantine-color-error:\s*var\(--danger\)/,
    )
  })
  const fieldBackground: Record<'dark' | 'light', string> = {
    dark: DEFAULT_THEME.colors.dark[6]!,
    light: '#ffffff',
  }
  for (const id of classThemeIds) {
    it(`reads at 4.5:1 on ${id}`, () => {
      const { scheme, tokens } = classThemes[id]
      const error = danger(scheme)
      for (const background of [tokens.bg, tokens.surface, tokens.raised, fieldBackground[scheme]])
        expect(contrast(error, background), `${id} on ${background}`).toBeGreaterThanOrEqual(4.5)
    })
  }
})

// The failed-roll alert sits inside a tinted card: it takes the plain surface, with the error token
// for its title and the text token for its message.
const dice = readFileSync(new URL('../../src/features/dice/ui/dice.css', import.meta.url), 'utf8')
describe('the failed roll alert is legible in every theme', () => {
  it('draws on the plain surface with the error and text tokens', () => {
    const rule = /\.roll-result-alert\.mantine-Alert-root\s*\{([^}]*)\}/.exec(dice)![1]!
    expect(rule).toMatch(/--alert-bg:\s*var\(--app-surface\)/)
    expect(rule).toMatch(/background-color:\s*var\(--app-surface\)/)
    expect(dice).toMatch(
      /\.roll-result-alert \.mantine-Alert-title\s*\{[^}]*color:\s*var\(--danger\)/,
    )
    expect(dice).toMatch(
      /\.roll-result-alert \.mantine-Alert-message\s*\{[^}]*color:\s*var\(--app-text\)/,
    )
  })
  for (const id of classThemeIds)
    it(`title and message read at 4.5:1 on ${id}`, () => {
      const { scheme, tokens } = classThemes[id]
      expect(contrast(danger(scheme), tokens.surface), `${id} title`).toBeGreaterThanOrEqual(4.5)
      expect(contrast(tokens.text, tokens.surface), `${id} message`).toBeGreaterThanOrEqual(4.5)
    })
})

// RYT-134: the cast dialog's alert and the concentration marker. The alert takes the plain surface
// with the error token for its title and the text token for its message; the marker sits on the
// plain surface too, with the muted token for its label and the choice details.
const panel = readFileSync(
  new URL('../../src/features/characters/ui/sheet/panel.css', import.meta.url),
  'utf8',
)
describe('the casting surfaces are legible in every theme', () => {
  it('draws the cast alert and the marker on the plain surface', () => {
    const alert = /\.cast-alert\.mantine-Alert-root\s*\{([^}]*)\}/.exec(panel)![1]!
    expect(alert).toMatch(/--alert-bg:\s*var\(--app-surface\)/)
    expect(alert).toMatch(/background-color:\s*var\(--app-surface\)/)
    expect(panel).toMatch(/\.cast-alert \.mantine-Alert-title\s*\{[^}]*color:\s*var\(--danger\)/)
    expect(panel).toMatch(
      /\.cast-alert \.mantine-Alert-message\s*\{[^}]*color:\s*var\(--app-text\)/,
    )
    const marker = /\.sheet-concentration\s*\{([^}]*)\}/.exec(panel)![1]!
    expect(marker).toMatch(/background:\s*var\(--app-surface\)/)
    expect(panel).toMatch(/\.sheet-concentration-label\s*\{[^}]*color:\s*var\(--app-muted\)/)
    expect(panel).toMatch(/\.cast-option-detail\s*\{[^}]*color:\s*var\(--app-muted\)/)
    expect(panel).toMatch(/\.cast-option\s*\{[^}]*background:\s*var\(--app-surface\)/)
  })
  for (const id of classThemeIds)
    it(`title, message, label and choice text read at 4.5:1 on ${id}`, () => {
      const { scheme, tokens } = classThemes[id]
      expect(contrast(danger(scheme), tokens.surface), `${id} title`).toBeGreaterThanOrEqual(4.5)
      expect(contrast(tokens.text, tokens.surface), `${id} message`).toBeGreaterThanOrEqual(4.5)
      expect(contrast(tokens.muted, tokens.surface), `${id} label`).toBeGreaterThanOrEqual(4.5)
      // The accent edge and the icon are decoration beside text, but still 3:1 for non-text.
      expect(contrast(tokens.accent, tokens.surface), `${id} accent`).toBeGreaterThanOrEqual(3)
    })
})

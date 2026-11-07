import { readFileSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  classThemeIds,
  classThemes,
  primaryShade,
  renderClassThemeCss,
  resolveClassTheme,
  themesOfScheme,
  tokenCssNames,
  type ColorSchemeName,
  type ThemeTokens,
  normalizeClassTheme,
} from '../../src/shared/theme/class-themes.ts'

function luminance(hex: string) {
  const value = parseInt(hex.slice(1), 16)
  const linear = (channel: number) => {
    const c = channel / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return (
    0.2126 * linear((value >> 16) & 255) +
    0.7152 * linear((value >> 8) & 255) +
    0.0722 * linear(value & 255)
  )
}

/** WCAG 2.x contrast ratio between two opaque hex colors. */
function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

const text = 4.5
const nonText = 3

/** Foreground/background pairs the interface actually renders, with their WCAG AA minimum. */
function pairs(tokens: ThemeTokens, palette: readonly string[], scheme: ColorSchemeName) {
  const list: [string, string, string, number][] = []
  for (const surface of ['bg', 'surface', 'raised', 'hero'] as const) {
    list.push([`text on ${surface}`, tokens.text, tokens[surface], text])
    list.push([`muted on ${surface}`, tokens.muted, tokens[surface], text])
    list.push([`accent on ${surface}`, tokens.accent, tokens[surface], text])
    list.push([`secondary accent on ${surface}`, tokens.accentSecondary, tokens[surface], text])
    list.push([`focus ring on ${surface}`, tokens.focus, tokens[surface], nonText])
  }
  list.push(['text on hover', tokens.text, tokens.hover, text])
  list.push(['on-accent on accent', tokens.onAccent, tokens.accent, text])
  // Mantine: filled hover is shade + 1; light variants use shade 0 (dark) or 9 on 1 (light).
  const hover = palette[primaryShade[scheme] + 1]
  list.push(['on-accent on filled hover', tokens.onAccent, hover, text])
  if (scheme === 'dark') {
    list.push(['light variant text on bg', palette[0], tokens.bg, text])
    list.push(['primary text (shade 4) on surface', palette[4], tokens.surface, text])
  } else {
    list.push(['light variant text', palette[9], palette[1], text])
    list.push(['light variant hover text', palette[9], palette[2], text])
    list.push(['outline text on surface', palette[8], tokens.surface, text])
  }
  return list
}

function cssBlock(css: string, selector: string) {
  const start = css.indexOf(`${selector} {`)
  expect(start, `missing ${selector}`).toBeGreaterThanOrEqual(0)
  const body = css.slice(start, css.indexOf('}', start))
  return Object.fromEntries(
    [...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]),
  )
}

describe('class themes', () => {
  it('defines fourteen themes, each drawn for one scheme with a ten-shade palette', () => {
    expect(classThemeIds).toHaveLength(14)
    expect(classThemeIds[0]).toBe('default')
    for (const id of classThemeIds) {
      expect(classThemes[id].palette).toHaveLength(10)
      for (const value of [...classThemes[id].palette, ...Object.values(classThemes[id].tokens)])
        expect(value).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('sorts each class into the scheme its signature color reads best on (ADR 034)', () => {
    expect(themesOfScheme('dark')).toEqual([
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
    ])
    expect(themesOfScheme('light')).toEqual(['parchment', 'barbarian', 'warlock', 'wizard'])
    // The gallery shows the dark group first, so ids stay grouped by scheme.
    expect(classThemeIds).toEqual([...themesOfScheme('dark'), ...themesOfScheme('light')])
  })

  for (const id of classThemeIds)
    it(`${id} (${classThemes[id].scheme}) meets WCAG AA contrast for rendered pairs`, () => {
      const { scheme, palette, tokens } = classThemes[id]
      expect(tokens.accent, 'accent equals the Mantine filled shade').toBe(
        palette[primaryShade[scheme]],
      )
      const failures = pairs(tokens, palette, scheme)
        .map(([name, fg, bg, min]) => ({ name, ratio: contrast(fg, bg), min }))
        .filter(({ ratio, min }) => ratio < min)
        .map(({ name, ratio, min }) => `${name}: ${ratio.toFixed(2)} < ${min}`)
      expect(failures).toEqual([])
    })

  it('keeps the base tokens in styles.css equal to Hearth (dark) and Parchment (light)', () => {
    const css = readFileSync('src/app/styles.css', 'utf8')
    const dark = cssBlock(css, ':root')
    const light = cssBlock(css, "html[data-mantine-color-scheme='light']")
    for (const [key, name] of Object.entries(tokenCssNames) as [keyof ThemeTokens, string][]) {
      expect(dark[name], `Hearth ${name}`).toBe(classThemes.default.tokens[key])
      expect(light[name], `Parchment ${name}`).toBe(classThemes.parchment.tokens[key])
    }
  })

  it('keeps the generated class-themes.css in sync with the theme source', () => {
    const path = 'src/app/class-themes.css'
    const expected = renderClassThemeCss()
    // Regenerate with: UPDATE_THEME_CSS=1 npx vitest run tests/unit/class-themes.test.ts
    if (process.env.UPDATE_THEME_CSS) writeFileSync(path, expected)
    expect(readFileSync(path, 'utf8').replaceAll('\r\n', '\n')).toBe(expected)
  })

  it('maps every theme to its scheme and background in the pre-paint bootstrap', () => {
    const html = readFileSync('index.html', 'utf8')
    const map = html.match(/const themes = \{([^}]+)\}/)?.[1] ?? ''
    const entries = [...map.matchAll(/(\w+): '(dark|light) (#[0-9a-f]{6})'/g)].map(
      ([, id, scheme, bg]) => [id, scheme, bg],
    )
    expect(entries).toEqual(
      classThemeIds.map((id) => [id, classThemes[id].scheme, classThemes[id].tokens.bg]),
    )
  })

  it('recovers invalid values and migrates the legacy light default to Parchment', () => {
    for (const value of [null, '', 'paladin ', 'forest', 42])
      expect(normalizeClassTheme(value)).toBe('default')
    expect(normalizeClassTheme('warlock')).toBe('warlock')
    expect(resolveClassTheme(null, 'light')).toBe('parchment')
    expect(resolveClassTheme('default', 'light')).toBe('parchment')
    expect(resolveClassTheme('artificer', 'light')).toBe('parchment')
    expect(resolveClassTheme(null, 'dark')).toBe('default')
    expect(resolveClassTheme(null, null)).toBe('default')
    // A class keeps its class; its own scheme replaces the old preference.
    expect(resolveClassTheme('druid', 'light')).toBe('druid')
    expect(resolveClassTheme('wizard', 'dark')).toBe('wizard')
    expect(resolveClassTheme('parchment', 'dark')).toBe('parchment')
  })
})

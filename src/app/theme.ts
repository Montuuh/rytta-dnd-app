import { createTheme, defaultVariantColorsResolver, type MantineColorsTuple } from '@mantine/core'
import {
  classThemeIds,
  classThemes,
  paletteName,
  primaryShade,
  type ClassThemeId,
} from '@/shared/theme'

/** Every class palette is registered so the primary color can switch without a reload. */
const classPalettes = Object.fromEntries(
  classThemeIds.map((id) => [paletteName(id), [...classThemes[id].palette] as MantineColorsTuple]),
)

export function createAppTheme(classTheme: ClassThemeId = 'default') {
  return createTheme({
    primaryColor: paletteName(classTheme),
    colors: {
      dark: [
        '#f5ebd6',
        '#e5d5bc',
        '#cbb699',
        '#a88f70',
        '#4d3828',
        '#3a2a1e',
        '#2a1f16',
        '#1e1610',
        '#140f0b',
        '#0c0906',
      ],
      ...classPalettes,
    },
    primaryShade,
    autoContrast: true,
    // Filled primary controls use the theme's on-accent token (verified by the contrast test).
    variantColorResolver: (input) => {
      const colors = defaultVariantColorsResolver(input)
      return input.variant === 'filled' &&
        (input.color ?? input.theme.primaryColor) === input.theme.primaryColor
        ? { ...colors, color: 'var(--app-on-accent)' }
        : colors
    },
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
    headings: { fontFamily: 'Georgia, Cambria, serif', fontWeight: '500' },
    defaultRadius: 'md',
    cursorType: 'pointer',
    components: {
      Button: { defaultProps: { size: 'md' }, styles: { root: { minHeight: 44 } } },
      NativeSelect: { styles: { input: { minHeight: 44 } } },
      SegmentedControl: {
        styles: {
          label: { minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' },
        },
      },
      Tooltip: { classNames: { tooltip: 'app-tooltip' } },
      Paper: { defaultProps: { withBorder: true } },
    },
  })
}

export const theme = createAppTheme()

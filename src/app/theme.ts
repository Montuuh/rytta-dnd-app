import { createTheme, defaultVariantColorsResolver } from '@mantine/core'

export const theme = createTheme({
  primaryColor: 'forest',
  colors: {
    dark: [
      '#f0efdf',
      '#d7dfd0',
      '#b1bcae',
      '#7f9284',
      '#43594a',
      '#31473a',
      '#24362d',
      '#1b2722',
      '#121a17',
      '#0c120f',
    ],
    forest: [
      '#f0f4ed',
      '#dfe8d9',
      '#becfb3',
      '#b8d18c',
      '#7e9e69',
      '#6b9053',
      '#496b36',
      '#3b582b',
      '#304923',
      '#263b1c',
    ],
  },
  primaryShade: { light: 8, dark: 3 },
  autoContrast: true,
  variantColorResolver: (input) => {
    const colors = defaultVariantColorsResolver(input)
    return input.variant === 'filled' && input.color === 'forest'
      ? { ...colors, color: 'var(--app-on-accent)' }
      : colors
  },
  fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
  headings: { fontFamily: 'Georgia, Cambria, serif', fontWeight: '500' },
  defaultRadius: 'md',
  cursorType: 'pointer',
  components: {
    Badge: { defaultProps: { color: 'forest' } },
    Button: { defaultProps: { size: 'md' }, styles: { root: { minHeight: 44 } } },
    NativeSelect: { styles: { input: { minHeight: 44 } } },
    SegmentedControl: {
      styles: {
        label: { minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' },
      },
    },
    Paper: { defaultProps: { withBorder: true } },
  },
})
